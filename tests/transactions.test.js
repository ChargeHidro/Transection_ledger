import { afterAll, beforeAll, beforeEach, describe, expect, test } from '@jest/globals';
import {
  api,
  closePool,
  createAccount,
  credit,
  debit,
  getBalance,
  MISSING_ID,
  nextReference,
  postTransaction,
  prepareDatabase,
  resetDatabase,
} from './helpers.js';

beforeAll(prepareDatabase);
beforeEach(resetDatabase);
afterAll(closePool);

const history = (accountId, query = '') =>
  api().get(`/api/accounts/${accountId}/transactions${query}`);

describe('POST /api/accounts/:accountId/transactions', () => {
  test('a credit increases the balance', async () => {
    const account = await createAccount();
    await credit(account.id, 100);

    const res = await postTransaction(account.id, {
      type: 'credit',
      amount: 50,
      description: 'Salary',
      reference_id: 'TXN-1',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.balance).toBe(150);
    expect(res.body.data.transaction).toEqual({
      id: expect.any(String),
      account_id: account.id,
      type: 'credit',
      amount: 50,
      description: 'Salary',
      reference_id: 'TXN-1',
      created_at: expect.any(String),
    });
  });

  test('a debit decreases the balance', async () => {
    const account = await createAccount();
    await credit(account.id, 100);

    const res = await debit(account.id, 30);

    expect(res.status).toBe(201);
    expect(res.body.data.balance).toBe(70);
  });

  test('a debit without enough balance is rejected and changes nothing', async () => {
    const account = await createAccount();
    await credit(account.id, 100);

    const res = await debit(account.id, 150);

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');
    expect(res.body.error.details).toEqual({ account_id: account.id, balance: 100, amount: 150 });
    expect(await getBalance(account.id)).toBe(100);
    expect((await history(account.id)).body.pagination.total_records).toBe(1);
  });

  test('a debit of the full balance is allowed', async () => {
    const account = await createAccount();
    await credit(account.id, 100);

    const res = await debit(account.id, 100);

    expect(res.status).toBe(201);
    expect(res.body.data.balance).toBe(0);
  });

  test('the balance equals the result of all valid transactions', async () => {
    const account = await createAccount();
    await credit(account.id, 100);
    await credit(account.id, 50);
    await debit(account.id, 30);
    await debit(account.id, 500); // rejected
    await debit(account.id, 20);

    expect(await getBalance(account.id)).toBe(100);
  });

  test('handles decimal amounts exactly', async () => {
    const account = await createAccount();
    await credit(account.id, 0.1);
    await credit(account.id, 0.2);

    expect(await getBalance(account.id)).toBe(0.3);
  });

  describe('duplicate reference_id', () => {
    test('returns 409 with the existing transaction and does not change the balance', async () => {
      const account = await createAccount();
      const first = await credit(account.id, 100, 'DUP-1');

      const res = await postTransaction(account.id, {
        type: 'credit',
        amount: 999,
        reference_id: 'DUP-1',
      });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE_TRANSACTION');
      expect(res.body.error.details.existing_transaction).toEqual(first.body.data.transaction);
      expect(await getBalance(account.id)).toBe(100);
      expect((await history(account.id)).body.pagination.total_records).toBe(1);
    });

    test('takes priority over insufficient balance when a debit is retried', async () => {
      const account = await createAccount();
      await credit(account.id, 100);
      await debit(account.id, 100, 'DEBIT-1');

      const res = await debit(account.id, 100, 'DEBIT-1');

      expect(res.status).toBe(409);
    });

    test('the same reference_id is allowed on different accounts', async () => {
      const a = await createAccount('A');
      const b = await createAccount('B');

      expect((await credit(a.id, 10, 'SHARED')).status).toBe(201);
      expect((await credit(b.id, 10, 'SHARED')).status).toBe(201);
    });
  });

  test.each([
    ['invalid type', { type: 'refund' }, 'type', "type must be either 'credit' or 'debit'"],
    ['missing type', { type: undefined }, 'type', 'type is required'],
    ['zero amount', { amount: 0 }, 'amount', 'amount must be greater than 0'],
    ['negative amount', { amount: -5 }, 'amount', 'amount must be greater than 0'],
    ['string amount', { amount: '10' }, 'amount', 'amount must be a number'],
    ['missing amount', { amount: undefined }, 'amount', 'amount is required'],
    ['three decimals', { amount: 1.005 }, 'amount', 'amount must have at most 2 decimal places'],
    ['huge amount', { amount: 1e10 }, 'amount', 'amount must not exceed 1000000000'],
    ['missing reference_id', { reference_id: undefined }, 'reference_id', 'reference_id is required'],
    ['blank reference_id', { reference_id: '  ' }, 'reference_id', 'reference_id must not be empty'],
    ['numeric description', { description: 5 }, 'description', 'description must be a string'],
    ['unknown field', { balance: 5 }, 'balance', "Unknown field 'balance' is not allowed"],
  ])('rejects %s', async (_, override, field, message) => {
    const account = await createAccount();
    const body = { type: 'credit', amount: 10, reference_id: nextReference(), ...override };

    const res = await postTransaction(account.id, body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toContainEqual({ field, message });
    expect(await getBalance(account.id)).toBe(0);
  });

  test('returns 404 for an unknown account', async () => {
    const res = await credit(MISSING_ID, 10);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ACCOUNT_NOT_FOUND');
  });

  test('returns 400 for a malformed account id', async () => {
    const res = await credit('123', 10);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ACCOUNT_ID');
  });

  describe('concurrency', () => {
    test('parallel debits never overdraw the account', async () => {
      const account = await createAccount();
      await credit(account.id, 100);

      const results = await Promise.all(Array.from({ length: 10 }, () => debit(account.id, 20)));
      const statuses = results.map((res) => res.status);

      expect(statuses.filter((s) => s === 201)).toHaveLength(5);
      expect(statuses.filter((s) => s === 422)).toHaveLength(5);
      expect(await getBalance(account.id)).toBe(0);
    });

    test('parallel requests with the same reference_id create exactly one transaction', async () => {
      const account = await createAccount();

      const results = await Promise.all(
        Array.from({ length: 5 }, () => credit(account.id, 10, 'SAME-REF')),
      );
      const statuses = results.map((res) => res.status);

      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
      expect(statuses.filter((s) => s === 409)).toHaveLength(4);
      expect(await getBalance(account.id)).toBe(10);
    });
  });
});

describe('GET /api/accounts/:accountId/transactions', () => {
  async function seed() {
    const account = await createAccount();
    await credit(account.id, 100, 'C1');
    await credit(account.id, 50, 'C2');
    await debit(account.id, 30, 'D1');
    await credit(account.id, 10, 'C3');
    await debit(account.id, 20, 'D2');
    return account;
  }

  test('returns all transactions, latest first, with pagination info', async () => {
    const account = await seed();

    const res = await history(account.id);

    expect(res.status).toBe(200);
    expect(res.body.data.map((t) => t.reference_id)).toEqual(['D2', 'C3', 'D1', 'C2', 'C1']);
    expect(res.body.pagination).toEqual({ page: 1, limit: 10, total_records: 5, total_pages: 1 });
  });

  test('filters by type', async () => {
    const account = await seed();

    const debits = await history(account.id, '?type=debit');
    const credits = await history(account.id, '?type=credit');

    expect(debits.body.data.map((t) => t.reference_id)).toEqual(['D2', 'D1']);
    expect(debits.body.pagination.total_records).toBe(2);
    expect(credits.body.data.every((t) => t.type === 'credit')).toBe(true);
    expect(credits.body.pagination.total_records).toBe(3);
  });

  test('paginates', async () => {
    const account = await seed();

    const res = await history(account.id, '?page=2&limit=2');

    expect(res.body.data.map((t) => t.reference_id)).toEqual(['D1', 'C2']);
    expect(res.body.pagination).toEqual({ page: 2, limit: 2, total_records: 5, total_pages: 3 });
  });

  test('returns an empty page past the end', async () => {
    const account = await seed();

    const res = await history(account.id, '?page=9&limit=2');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.total_pages).toBe(3);
  });

  test('returns an empty list for an account without transactions', async () => {
    const account = await createAccount();

    const res = await history(account.id);

    expect(res.body.data).toEqual([]);
    expect(res.body.pagination).toEqual({ page: 1, limit: 10, total_records: 0, total_pages: 0 });
  });

  test.each([
    ['?page=0', 'page', 'page must be at least 1'],
    ['?page=abc', 'page', 'page must be a number'],
    ['?page=1.5', 'page', 'page must be an integer'],
    ['?limit=0', 'limit', 'limit must be at least 1'],
    ['?limit=101', 'limit', 'limit must be at most 100'],
    ['?type=refund', 'type', "type must be either 'credit' or 'debit'"],
  ])('rejects invalid query %s', async (query, field, message) => {
    const account = await createAccount();

    const res = await history(account.id, query);

    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual({ field, message });
  });

  test('returns 404 for an unknown account', async () => {
    const res = await history(MISSING_ID);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ACCOUNT_NOT_FOUND');
  });
});

describe('immutability', () => {
  test.each(['put', 'patch', 'delete'])('has no %s endpoint for transactions', async (method) => {
    const account = await createAccount();
    const { transaction } = (await credit(account.id, 10)).body.data;

    const res = await api()[method](`/api/accounts/${account.id}/transactions/${transaction.id}`);

    expect(res.status).toBe(404);
  });
});
