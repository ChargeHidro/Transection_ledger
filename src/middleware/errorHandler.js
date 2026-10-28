import { AppError, RouteNotFoundError } from '../errors/index.js';

const PG_UNIQUE_VIOLATION = '23505';
const PG_NUMERIC_OUT_OF_RANGE = '22003';

/** Maps known non-AppError failures (body parser, PostgreSQL) to AppErrors. */
function toAppError(err) {
  if (err instanceof AppError) return err;

  if (err.type === 'entity.parse.failed') {
    return new AppError(400, 'INVALID_JSON', 'Request body is not valid JSON.');
  }
  if (err.type === 'entity.too.large') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
  }
  // Safety net: services check for duplicates under a row lock, so this only
  // fires if that check is ever bypassed.
  if (err.code === PG_UNIQUE_VIOLATION && err.constraint === 'transactions_account_reference_unique') {
    return new AppError(409, 'DUPLICATE_TRANSACTION', 'A transaction with this reference_id already exists for this account.');
  }
  if (err.code === PG_NUMERIC_OUT_OF_RANGE) {
    return new AppError(422, 'AMOUNT_OUT_OF_RANGE', 'The resulting balance exceeds the maximum supported value.');
  }

  return new AppError(500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
}

export function notFoundHandler(req, res, next) {
  next(new RouteNotFoundError(req.method, req.originalUrl));
}

// Express recognises error middleware by its four parameters, so `next` must stay.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const appError = toAppError(err);

  if (appError.status >= 500) {
    console.error(err);
  }

  const body = { code: appError.code, message: appError.message };
  if (appError.details !== undefined) body.details = appError.details;

  res.status(appError.status).json({ error: body });
}
