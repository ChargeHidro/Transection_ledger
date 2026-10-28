import { afterAll, beforeAll, beforeEach, describe, expect, test } from '@jest/globals';
import {
  api,
  closePool,
  createAccount,
  credit,
  getBalance,
  MISSING_ID,
  nextReference,
  prepareDatabase,
  resetDatabase,
} from './helpers.js';

beforeAll(prepareDatabase);
beforeEach(resetDatabase);
afterAll(closePool);

const transfer = (body) => api().post('/api/transfers').send(body);

async function seedAccounts(balanceA = 100, balanceB = 50) {
  const a = await createAccount('A');
  const b = await createAccount('B');
  if (balanceA) await credit(a.id, balanceA);
  if (balanceB) await credit(b.id, balanceB);
  return { a, b };
}

const transactionCount = async (accountId) =>
  (await api().get(`/api/accounts/${accountId}/transactions`)).body.pagination.total_records;

describe('POST /api/transfers', () => {
  test('moves money from one account to another', async () => {
    const { a, b } = await seedAccounts(100, 50);

    const res = await transfer({
      from_account_id: a.id,
      to_account_id: b.id,
      amount: 30,
      reference_id: 'TRF-1',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.balances).toEqual({ from_account: 70, to_account: 80 });
    expect(res.body.data.debit).toMatchObject({
      account_id: a.id,
      type: 'debit',
      amount: 30,
      reference_id: 'TRF-1',
      description: `Transfer to ${b.id}`,
    });
    expect(res.body.data.credit).toMatchObject({
      account_id: b.id,
      type: 'credit',
      amount: 30,
      reference_id: 'TRF-1',
      description: `Transfer from ${a.id}`,
    });
    expect(await getBalance(a.id)).toBe(70);
    expect(await getBalance(b.id)).toBe(80);
  });

  test('uses the given description for both legs', async () => {
    const { a, b } = await seedAccounts();

    const res = await transfer({
      from_account_id: a.id,
      to_account_id: b.id,
      amount: 10,
      reference_id: 'TRF-2',
      description: 'Rent share',
    });

    expect(res.body.data.debit.description).toBe('Rent share');
    expect(res.body.data.credit.description).toBe('Rent share');
  });

  test('rejects a transfer without enough balance and changes nothing', async () => {
    const { a, b } = await seedAccounts(100, 50);

    const res = await transfer({
      from_account_id: a.id,
      to_account_id: b.id,
      amount: 150,
      reference_id: 'TRF-3',
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');
    expect(await getBalance(a.id)).toBe(100);
    expect(await getBalance(b.id)).toBe(50);
    expect(await transactionCount(a.id)).toBe(1);
    expect(await transactionCount(b.id)).toBe(1);
  });

  test('returns 404 when the destination does not exist, without debiting the source', async () => {
    const { a } = await seedAccounts();

    const res = await transfer({
      from_account_id: a.id,
      to_account_id: MISSING_ID,
      amount: 10,
      reference_id: 'TRF-4',
    });

    expect(res.status).toBe(404);
    expect(res.body.error.details).toEqual({ account_id: MISSING_ID });
    expect(await getBalance(a.id)).toBe(100);
  });

  test('returns 404 when the source does not exist', async () => {
    const { b } = await seedAccounts();

    const res = await transfer({
      from_account_id: MISSING_ID,
      to_account_id: b.id,
      amount: 10,
      reference_id: 'TRF-5',
    });

    expect(res.status).toBe(404);
    expect(await getBalance(b.id)).toBe(50);
  });

  test('rejects a repeated reference_id', async () => {
    const { a, b } = await seedAccounts();
    const body = { from_account_id: a.id, to_account_id: b.id, amount: 10, reference_id: 'TRF-6' };
    await transfer(body);

    const res = await transfer(body);

    expect(res.status).toBe(409);
    expect(await getBalance(a.id)).toBe(90);
    expect(await getBalance(b.id)).toBe(60);
  });

  test('rolls back the debit when the credit leg fails', async () => {
    const { a, b } = await seedAccounts();
    // The destination already used this reference, so the credit leg is a duplicate
    // after the debit leg has already been written.
    await credit(b.id, 5, 'TRF-7');

    const res = await transfer({
      from_account_id: a.id,
      to_account_id: b.id,
      amount: 10,
      reference_id: 'TRF-7',
    });

    expect(res.status).toBe(409);
    expect(await getBalance(a.id)).toBe(100);
    expect(await getBalance(b.id)).toBe(55);
    expect(await transactionCount(a.id)).toBe(1);
  });

  test.each([
    ['same account', (a) => ({ to_account_id: a.id }), 'to_account_id', 'to_account_id must be different from from_account_id'],
    ['missing source', () => ({ from_account_id: undefined }), 'from_account_id', 'from_account_id is required'],
    ['malformed destination', () => ({ to_account_id: 'abc' }), 'to_account_id', 'to_account_id must be a valid UUID'],
    ['zero amount', () => ({ amount: 0 }), 'amount', 'amount must be greater than 0'],
    ['missing reference_id', () => ({ reference_id: undefined }), 'reference_id', 'reference_id is required'],
  ])('rejects %s', async (_, override, field, message) => {
    const { a, b } = await seedAccounts();
    const body = {
      from_account_id: a.id,
      to_account_id: b.id,
      amount: 10,
      reference_id: nextReference(),
      ...override(a, b),
    };

    const res = await transfer(body);

    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual({ field, message });
  });

  test('opposite-direction transfers in parallel neither deadlock nor lose money', async () => {
    const { a, b } = await seedAccounts(100, 100);

    const requests = Array.from({ length: 20 }, (_, i) =>
      transfer({
        from_account_id: i % 2 ? a.id : b.id,
        to_account_id: i % 2 ? b.id : a.id,
        amount: 5,
        reference_id: nextReference(),
      }),
    );
    const results = await Promise.all(requests);

    expect(results.every((res) => res.status === 201)).toBe(true);
    expect(await getBalance(a.id)).toBe(100);
    expect(await getBalance(b.id)).toBe(100);
  });
});
