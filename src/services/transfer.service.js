import { withTransaction } from '../db/pool.js';
import { lockAccounts, postEntry } from './ledger.js';

/**
 * Moves money between two accounts: a debit on the source and a credit on the
 * destination, both under the same reference_id. Both legs run in one database
 * transaction, so any failure (missing account, insufficient balance,
 * duplicate reference on either side) rolls back the whole transfer.
 */
export function createTransfer({ from_account_id, to_account_id, amount, reference_id, description }) {
  return withTransaction(async (client) => {
    await lockAccounts(client, [from_account_id, to_account_id]);

    const debit = await postEntry(client, {
      accountId: from_account_id,
      type: 'debit',
      amount,
      description: description ?? `Transfer to ${to_account_id}`,
      referenceId: reference_id,
    });
    const credit = await postEntry(client, {
      accountId: to_account_id,
      type: 'credit',
      amount,
      description: description ?? `Transfer from ${from_account_id}`,
      referenceId: reference_id,
    });

    return {
      debit: debit.transaction,
      credit: credit.transaction,
      balances: { from_account: debit.balance, to_account: credit.balance },
    };
  });
}
