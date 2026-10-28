import { afterAll, beforeAll, beforeEach, describe, expect, test } from '@jest/globals';
import {
  api,
  closePool,
  createAccount,
  MISSING_ID,
  prepareDatabase,
  resetDatabase,
} from './helpers.js';

beforeAll(prepareDatabase);
beforeEach(resetDatabase);
afterAll(closePool);

describe('POST /api/accounts', () => {
  test('creates an account with a zero balance and system-generated fields', async () => {
    const res = await api().post('/api/accounts').send({ name: 'Alice' });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      name: 'Alice',
      balance: 0,
      created_at: expect.any(String),
    });
    expect(Number.isNaN(Date.parse(res.body.data.created_at))).toBe(false);
  });

  test('generates a unique id per account', async () => {
    const a = await createAccount('A');
    const b = await createAccount('B');
    expect(a.id).not.toBe(b.id);
  });

  test('trims the name', async () => {
    const res = await api().post('/api/accounts').send({ name: '  Bob  ' });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Bob');
  });

  test.each([
    ['missing', {}, 'name is required'],
    ['blank', { name: '   ' }, 'name must not be empty'],
    ['not a string', { name: 42 }, 'name must be a string'],
    ['too long', { name: 'x'.repeat(256) }, 'name must be at most 255 characters'],
  ])('rejects a %s name', async (_, body, message) => {
    const res = await api().post('/api/accounts').send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toContainEqual({ field: 'name', message });
  });

  test('does not let the client set the initial balance', async () => {
    const res = await api().post('/api/accounts').send({ name: 'Eve', balance: 1000 });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual({
      field: 'balance',
      message: "Unknown field 'balance' is not allowed",
    });
  });

  test('rejects malformed JSON', async () => {
    const res = await api()
      .post('/api/accounts')
      .set('Content-Type', 'application/json')
      .send('{"name": ');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  test('rejects a body that is not an object', async () => {
    const res = await api().post('/api/accounts').send(['Alice']);

    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual({
      field: 'body',
      message: 'Request body must be a JSON object',
    });
  });

  test('rejects a non-JSON content type', async () => {
    const res = await api().post('/api/accounts').type('form').send('name=Alice');

    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });
});

describe('GET /api/accounts/:accountId/balance', () => {
  test('returns the account balance', async () => {
    const account = await createAccount();
    const res = await api().get(`/api/accounts/${account.id}/balance`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ account_id: account.id, balance: 0 });
  });

  test('returns 404 for an unknown account', async () => {
    const res = await api().get(`/api/accounts/${MISSING_ID}/balance`);

    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({
      code: 'ACCOUNT_NOT_FOUND',
      message: `Account '${MISSING_ID}' was not found.`,
      details: { account_id: MISSING_ID },
    });
  });

  test('returns 400 for a malformed account id', async () => {
    const res = await api().get('/api/accounts/not-a-uuid/balance');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ACCOUNT_ID');
  });
});

describe('general', () => {
  test('returns 404 for unknown routes', async () => {
    const res = await api().get('/api/nope');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  test('serves the documentation page', async () => {
    const res = await api().get('/documentation');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('Transaction <span>Ledger</span> API');
  });

  test('serves the OpenAPI spec', async () => {
    const res = await api().get('/documentation/openapi.yaml');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/yaml/);
    expect(res.text).toMatch(/^openapi: 3\.0\.3/);
  });

  test('exposes a health check', async () => {
    const res = await api().get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: 'ok' });
  });
});
