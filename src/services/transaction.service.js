import { query, withTransaction } from '../db/pool.js';
import { assertAccountExists } from './account.service.js';
import { lockAccounts, postEntry, TRANSACTION_COLUMNS } from './ledger.js';

/**
 * Creates a transaction and updates the balance as one atomic operation:
 * either both are saved or neither is.
 */
export function createTransaction(accountId, { type, amount, description, reference_id }) {
  return withTransaction(async (client) => {
    await lockAccounts(client, [accountId]);
    return postEntry(client, {
      accountId,
      type,
      amount,
      description,
      referenceId: reference_id,
    });
  });
}

/** Returns one page of an account's transactions, newest first. */
export async function listTransactions(accountId, { type, page, limit }) {
  await assertAccountExists(accountId);

  const params = [accountId];
  let where = 'account_id = $1';
  if (type) {
    params.push(type);
    where += ` AND type = $${params.length}`;
  }

  const offset = (page - 1) * limit;
  const [countResult, pageResult] = await Promise.all([
    query(`SELECT count(*)::int AS total FROM transactions WHERE ${where}`, params),
    query(
      `SELECT ${TRANSACTION_COLUMNS} FROM transactions
        WHERE ${where}
        ORDER BY created_at DESC, id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    ),
  ]);

  const total = countResult.rows[0].total;
  return {
    transactions: pageResult.rows,
    pagination: {
      page,
      limit,
      total_records: total,
      total_pages: Math.ceil(total / limit),
    },
  };
}
