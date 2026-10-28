import request from 'supertest';
import app from '../src/app.js';
import { setupDatabase } from '../src/db/migrate.js';
import { closePool, query } from '../src/db/pool.js';

export const api = () => request(app);

export const prepareDatabase = () => setupDatabase();

// TRUNCATE doesn't fire the immutability trigger, unlike DELETE.
export const resetDatabase = () => query('TRUNCATE transactions, accounts');

export { closePool };

export async function createAccount(name = 'Test Account') {
  const res = await api().post('/api/accounts').send({ name });
  return res.body.data;
}

export const postTransaction = (accountId, body) =>
  api().post(`/api/accounts/${accountId}/transactions`).send(body);

export const getBalance = async (accountId) =>
  (await api().get(`/api/accounts/${accountId}/balance`)).body.data.balance;

let referenceCounter = 0;
export const nextReference = () => `REF-${++referenceCounter}`;

export const credit = (accountId, amount, referenceId = nextReference()) =>
  postTransaction(accountId, { type: 'credit', amount, reference_id: referenceId });

export const debit = (accountId, amount, referenceId = nextReference()) =>
  postTransaction(accountId, { type: 'debit', amount, reference_id: referenceId });

export const MISSING_ID = '00000000-0000-4000-8000-000000000000';
