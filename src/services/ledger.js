import {
  AccountNotFoundError,
  DuplicateTransactionError,
  InsufficientBalanceError,
} from '../errors/index.js';

// Shared building blocks for anything that moves money. Every function takes
// a client that is already inside a database transaction (see withTransaction).

export const TRANSACTION_COLUMNS =
  'id, account_id, type, amount, description, reference_id, created_at';

/**
 * Locks the given account rows (SELECT ... FOR UPDATE) for the rest of the
 * transaction, so concurrent writes to the same account run one at a time.
 * Rows are locked in ascending id order, which prevents deadlocks when two
 * transfers touch the same pair of accounts in opposite directions.
 * Throws AccountNotFoundError for the first ID that doesn't exist.
 */
export async function lockAccounts(client, accountIds) {
  const ids = [...new Set(accountIds.map((id) => id.toLowerCase()))];
  const { rows } = await client.query(
    'SELECT id FROM accounts WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',
    [ids],
  );
  const found = new Set(rows.map((row) => row.id));
  const missing = accountIds.find((id) => !found.has(id.toLowerCase()));
  if (missing) throw new AccountNotFoundError(missing);
}

/**
 * Records one credit or debit and applies it to the account balance.
 * The account must already be locked with lockAccounts.
 *
 * Order matters: a repeated reference_id is reported as a duplicate even if
 * the account no longer has enough balance to repeat the debit.
 */
export async function postEntry(client, { accountId, type, amount, description, referenceId }) {
  const { rows: [existing] } = await client.query(
    `SELECT ${TRANSACTION_COLUMNS} FROM transactions WHERE account_id = $1 AND reference_id = $2`,
    [accountId, referenceId],
  );
  if (existing) throw new DuplicateTransactionError(accountId, referenceId, existing);

  // The arithmetic and the sufficient-funds check both happen in SQL on exact
  // NUMERIC values, never on JavaScript floats.
  const delta = type === 'credit' ? amount : -amount;
  const { rows: [account] } = await client.query(
    `UPDATE accounts SET balance = balance + $2
      WHERE id = $1 AND balance + $2 >= 0
      RETURNING balance`,
    [accountId, delta],
  );
  if (!account) {
    const { rows: [current] } = await client.query('SELECT balance FROM accounts WHERE id = $1', [
      accountId,
    ]);
    throw new InsufficientBalanceError(accountId, current.balance, amount);
  }

  const { rows: [transaction] } = await client.query(
    `INSERT INTO transactions (account_id, type, amount, description, reference_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${TRANSACTION_COLUMNS}`,
    [accountId, type, amount, description ?? null, referenceId],
  );

  return { transaction, balance: account.balance };
}
