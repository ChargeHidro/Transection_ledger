# Transaction Ledger API

A backend REST API for a simple transaction ledger. It lets you create accounts, post credit and debit transactions, check balances, read paginated transaction history, and transfer money between accounts atomically.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Getting Started](#getting-started)
3. [API Documentation](#api-documentation)
4. [Project Structure](#project-structure)
5. [Data Model](#data-model)
6. [Endpoints Overview](#endpoints-overview)
7. [Error Handling](#error-handling)
8. [Data Integrity](#data-integrity)
9. [Assumptions](#assumptions)

---

## Tech Stack

| Layer      | Choice                               |
| ---------- | ------------------------------------ |
| Runtime    | Node.js (v18+)                       |
| Framework  | Express                              |
| Database   | PostgreSQL 16 (`postgres:16-alpine`, Docker) |
| Validation | Zod                                  |
| Testing    | Jest + Supertest                     |
| API Docs   | Custom HTML page served at `/documentation`, plus an OpenAPI 3 spec |

---

## Getting Started

### Prerequisites

- Node.js v18 or later
- Docker with a running `postgres:16-alpine` container (see [Database](#database))

### Run it

After cloning and running `npm install` once, the whole application starts with **one command**:

```bash
npm start
```

On startup the app:

1. Connects to PostgreSQL and creates the `ledger` database if it doesn't exist.
2. Runs any pending migrations. This is safe to repeat, because migrations that already ran are skipped.
3. Starts the API at `http://localhost:4000/api`, with the documentation at `http://localhost:4000/documentation`.

There's no manual database setup, migration step or `.env` file to create.

For development with auto-reload, use `npm run dev`. It runs the same startup steps.

### Database

The API uses PostgreSQL 16 running in Docker. Local development uses the existing container:

| Setting   | Value                                  |
| --------- | -------------------------------------- |
| Container | `integration_application-postgres-1`   |
| Image     | `postgres:16-alpine`                   |
| Host/Port | `localhost:55432`                      |
| User      | `cloudworx`                            |
| Password  | `cloudworx`                            |
| Database  | `ledger` (separate from other projects' data) |

The app creates the `ledger` database itself on first start.

If you don't have that container, you can start a fresh one with the same settings:

```bash
docker run --name ledger-db -e POSTGRES_USER=cloudworx -e POSTGRES_PASSWORD=cloudworx \
  -p 55432:5432 -d postgres:16-alpine
```

### Configuration (optional)

The defaults below work as they are. To override them, set environment variables or copy `.env.example` to `.env`.

| Variable       | Description                  | Default                                                  |
| -------------- | ---------------------------- | -------------------------------------------------------- |
| `PORT`         | Port the API listens on      | `4000`                                                   |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://cloudworx:cloudworx@localhost:55432/ledger`  |

### Other scripts

```bash
npm run dev       # start with auto-reload (same startup steps)
npm run migrate   # run migrations only, without starting the server
npm test          # run the test suite
```

### Run tests

```bash
npm test
```

Tests run against a separate `ledger_test` database, which is created automatically, so they never touch development data. They cover every endpoint, every validation rule, and concurrency cases: parallel debits, parallel duplicate requests, and opposite-direction transfers.

---

## API Documentation

The API serves its own documentation. With the app running (`npm start`), open:

**http://localhost:4000/documentation**

It's a single self-contained page ([`docs/index.html`](docs/index.html)) with no external dependencies, and it contains:

- **Quickstart:** a step-by-step walkthrough from creating accounts to a transfer
- **Endpoint reference:** for every endpoint, its parameters, request body fields, an example cURL request, an example response and the errors it can return
- **Try it:** a panel on each endpoint that sends real requests to the running API and shows the response. Accounts you create there are filled into the other panels automatically.
- **Concepts:** idempotency with `reference_id`, atomicity and consistency, and pagination
- **Errors and validation rules:** the error format, every error code and every field rule
- **Live status:** an indicator showing whether the API and database are reachable

A machine-readable OpenAPI 3 spec is also available at **http://localhost:4000/documentation/openapi.yaml** ([`docs/openapi.yaml`](docs/openapi.yaml)). You can import it into Postman or Insomnia.

---

## Project Structure

```
src/
├── app.js                 # Express app setup (middleware, routes, error handler)
├── server.js              # Entry point
├── config/                # Environment configuration
├── db/
│   ├── pool.js            # PostgreSQL connection pool
│   ├── migrate.js         # Creates DB if missing + runs pending migrations (on startup)
│   └── migrations/        # SQL schema
├── routes/                # Route definitions
├── controllers/           # HTTP layer: parse request, send response
├── services/              # Business logic and DB transactions
│   └── ledger.js          # Shared: lock accounts, post one credit/debit
├── validators/            # Zod request schemas
├── middleware/            # Validation, JSON content-type check, error handling
└── errors/                # Custom error classes (AppError, AccountNotFoundError, ...)
tests/                     # Integration tests (Jest + Supertest)
docs/
├── index.html             # Documentation page, served at /documentation
└── openapi.yaml           # OpenAPI 3 spec, served at /documentation/openapi.yaml
```

---

## Data Model

### `accounts`

| Column       | Type            | Constraints                          |
| ------------ | --------------- | ------------------------------------ |
| `id`         | UUID            | Primary key, generated by the system |
| `name`       | VARCHAR(255)    | `NOT NULL`, not blank                |
| `balance`    | NUMERIC(18, 2)  | `NOT NULL DEFAULT 0`, `CHECK (balance >= 0)` |
| `created_at` | TIMESTAMPTZ     | `NOT NULL DEFAULT now()`             |

### `transactions`

| Column         | Type           | Constraints                                     |
| -------------- | -------------- | ----------------------------------------------- |
| `id`           | UUID           | Primary key, generated by the system            |
| `account_id`   | UUID           | `NOT NULL`, foreign key → `accounts(id)`        |
| `type`         | VARCHAR(6)     | `NOT NULL`, `CHECK (type IN ('credit','debit'))`|
| `amount`       | NUMERIC(18, 2) | `NOT NULL`, `CHECK (amount > 0)`                |
| `description`  | VARCHAR(500)   | Nullable                                        |
| `reference_id` | VARCHAR(255)   | `NOT NULL`                                      |
| `created_at`   | TIMESTAMPTZ    | `NOT NULL DEFAULT now()`                        |

**Constraints and indexes**

- `UNIQUE (account_id, reference_id)`: a `reference_id` can't repeat within one account, but different accounts can use the same one.
- An index on `(account_id, created_at DESC)` speeds up the newest-first history query.

---

## Endpoints Overview

Base URL: `http://localhost:4000/api`. See the [documentation page](#api-documentation) at `/documentation` for full request and response details.

| Method | Endpoint                              | Description                       | Success |
| ------ | ------------------------------------- | --------------------------------- | ------- |
| POST   | `/accounts`                           | Create an account (`name` only)   | 201     |
| GET    | `/accounts/:accountId/balance`        | Get the account balance           | 200     |
| POST   | `/accounts/:accountId/transactions`   | Add a credit or debit             | 201     |
| GET    | `/accounts/:accountId/transactions`   | History, filter by `type`, `page`, `limit` | 200 |
| POST   | `/transfers`                          | Transfer between accounts (bonus) | 201     |
| GET    | `/health`                             | API and database health check     | 200     |

The documentation is served outside `/api`, at `GET /documentation` (HTML page) and `GET /documentation/openapi.yaml` (spec).

### Quick example

```bash
# Create an account
curl -X POST http://localhost:4000/api/accounts \
  -H "Content-Type: application/json" -d '{"name":"Alice"}'

# Credit 100
curl -X POST http://localhost:4000/api/accounts/<id>/transactions \
  -H "Content-Type: application/json" \
  -d '{"type":"credit","amount":100,"reference_id":"R1","description":"Deposit"}'

# Check the balance
curl http://localhost:4000/api/accounts/<id>/balance

# Get debit history, page 1
curl "http://localhost:4000/api/accounts/<id>/transactions?type=debit&page=1&limit=10"
```

History responses include a `pagination` object (`page`, `limit`, `total_records`, `total_pages`) and are sorted newest first by `created_at`.

---

## Error Handling

Every error response has the same shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "details": [
      { "field": "amount", "message": "Amount must be greater than 0" }
    ]
  }
}
```

| Status | Code                    | Meaning                                         |
| ------ | ----------------------- | ----------------------------------------------- |
| 400    | `VALIDATION_ERROR`      | Invalid body, query params, or field values     |
| 400    | `INVALID_JSON`          | Request body is not valid JSON                  |
| 400    | `INVALID_ACCOUNT_ID`    | Account ID is not a valid UUID                  |
| 404    | `ACCOUNT_NOT_FOUND`     | Account does not exist                          |
| 404    | `ROUTE_NOT_FOUND`       | Unknown endpoint                                |
| 409    | `DUPLICATE_TRANSACTION` | `reference_id` already used for this account    |
| 413    | `PAYLOAD_TOO_LARGE`     | Request body is larger than 100 KB              |
| 415    | `UNSUPPORTED_MEDIA_TYPE`| Body not sent as `application/json`             |
| 422    | `INSUFFICIENT_BALANCE`  | Debit/transfer exceeds available balance        |
| 422    | `AMOUNT_OUT_OF_RANGE`   | Resulting balance exceeds the storable maximum  |
| 500    | `INTERNAL_ERROR`        | Unexpected server error (no internals leaked)   |

---

## Data Integrity

### Atomicity

A new transaction runs inside one PostgreSQL transaction:

1. `BEGIN`
2. `SELECT ... FROM accounts WHERE id = $1 FOR UPDATE`. This locks the account row, so concurrent requests on the same account run one after another.
3. Check the balance (for debits) and look for a duplicate `reference_id`.
4. `INSERT` the transaction row.
5. `UPDATE` the account balance.
6. `COMMIT`, or `ROLLBACK` if any step fails.

If either write fails, neither one is saved.

Transfers lock both account rows in a fixed order (by ascending `id`). This prevents deadlocks when two transfers between the same accounts run in opposite directions at the same time.

### Database-level safeguards

The service layer runs these checks first. The database enforces them again in case something gets past the application:

- `CHECK (balance >= 0)`: a balance can never go negative.
- `CHECK (amount > 0)` and `CHECK (type IN ('credit','debit'))`.
- `UNIQUE (account_id, reference_id)`: if two concurrent requests send the same reference, the second fails with a unique violation and gets `409`.
- A foreign key from `transactions.account_id` to `accounts.id`.
- A `BEFORE UPDATE OR DELETE` trigger on `transactions` rejects any change to a transaction once it exists, even from outside the API.

### Immutability

The API has no update or delete endpoints for transactions, and a database trigger blocks `UPDATE` and `DELETE` on the table. Once a transaction is created, its type, amount, description, reference ID, account ID and timestamp never change.

### Balance consistency

The stored balance is only changed in the same database transaction that inserts a transaction row. This means it always equals the sum of credits minus the sum of debits. Rejected or failed requests never change it.

---

## Assumptions

1. **No authentication.** The assessment doesn't mention users or authorization, so every endpoint is public.
2. **Single currency.** All amounts are in one implicit currency.
3. **Amount precision.** Amounts can have at most 2 decimal places and are stored as `NUMERIC(18,2)` to avoid floating-point errors.
4. **Duplicate response.** A repeated `reference_id` on the same account returns `409 Conflict` along with the existing transaction. The client can tell the transaction already exists, and nothing changes.
5. **Insufficient balance status.** This returns `422 Unprocessable Entity`: the request is well-formed but breaks a business rule. Malformed input returns `400`.
6. **No overdraft.** A debit that would make the balance negative is rejected. A debit that brings the balance to exactly `0` is allowed.
7. **Description is optional.** The spec lists `description` as a field but doesn't say it's required.
8. **Initial balance.** Sending `balance` (or any unknown field) when creating an account returns a validation error instead of being silently ignored, so the client clearly can't set it.
9. **Rejected transactions aren't stored.** A failed debit leaves no record in the ledger.
10. **Pagination defaults.** `page=1`, `limit=10`, and `limit` is capped at 100.
11. **Transfers.** A transfer is two ledger entries, a debit and a credit, that share the same `reference_id`. Transferring to the same account is rejected.
12. **IDs.** Account and transaction IDs are UUID v4 values generated by the server.
13. **Timestamps.** All timestamps are stored and returned in UTC ISO 8601 format.
14. **Local database.** Local development reuses an existing `postgres:16-alpine` container on port `55432`, in its own `ledger` database.
15. **Maximum amount.** A single transaction or transfer can be at most 1,000,000,000.
16. **JSON only.** Request bodies must be sent with `Content-Type: application/json`, otherwise the API returns `415`.
17. **Transfer descriptions.** If a transfer has no `description`, the legs get "Transfer to `<id>`" and "Transfer from `<id>`" so the history stays readable.
18. **Trimmed strings.** `name` and `reference_id` are trimmed, so `"R1 "` and `"R1"` count as the same reference.
19. **Duplicate checked first.** If a `reference_id` was already used, the API returns `409` even when the balance couldn't cover the request again. That way, retrying a successful debit is always recognised as a retry.
