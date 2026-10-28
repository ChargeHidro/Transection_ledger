/**
 * Base class for errors that map to an HTTP response. Anything thrown that is
 * not an AppError is treated as unexpected and returned as a 500.
 */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(details, message = 'Request validation failed.') {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

export class InvalidAccountIdError extends AppError {
  constructor(accountId) {
    super(400, 'INVALID_ACCOUNT_ID', `'${accountId}' is not a valid account ID. Expected a UUID.`);
  }
}

export class AccountNotFoundError extends AppError {
  constructor(accountId) {
    super(404, 'ACCOUNT_NOT_FOUND', `Account '${accountId}' was not found.`, {
      account_id: accountId,
    });
  }
}

export class RouteNotFoundError extends AppError {
  constructor(method, path) {
    super(404, 'ROUTE_NOT_FOUND', `Route ${method} ${path} does not exist.`);
  }
}

export class UnsupportedMediaTypeError extends AppError {
  constructor() {
    super(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json.');
  }
}

export class DuplicateTransactionError extends AppError {
  constructor(accountId, referenceId, existingTransaction) {
    super(
      409,
      'DUPLICATE_TRANSACTION',
      `A transaction with reference_id '${referenceId}' already exists for account '${accountId}'.`,
      existingTransaction ? { existing_transaction: existingTransaction } : undefined,
    );
  }
}

export class InsufficientBalanceError extends AppError {
  constructor(accountId, balance, amount) {
    super(
      422,
      'INSUFFICIENT_BALANCE',
      `Account '${accountId}' has insufficient balance for a debit of ${amount}.`,
      { account_id: accountId, balance, amount },
    );
  }
}
