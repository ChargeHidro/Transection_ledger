import { query } from '../db/pool.js';
import { AccountNotFoundError } from '../errors/index.js';

export async function createAccount({ name }) {
  // balance and created_at always come from column defaults (0 and now()).
  const { rows: [account] } = await query(
    'INSERT INTO accounts (name) VALUES ($1) RETURNING id, name, balance, created_at',
    [name],
  );
  return account;
}

export async function getBalance(accountId) {
  const { rows: [balance] } = await query(
    'SELECT id AS account_id, balance FROM accounts WHERE id = $1',
    [accountId],
  );
  if (!balance) throw new AccountNotFoundError(accountId);
  return balance;
}

export async function assertAccountExists(accountId) {
  const { rowCount } = await query('SELECT 1 FROM accounts WHERE id = $1', [accountId]);
  if (rowCount === 0) throw new AccountNotFoundError(accountId);
}
