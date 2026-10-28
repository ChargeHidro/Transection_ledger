CREATE TABLE transactions (
  id           UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   UUID           NOT NULL REFERENCES accounts (id) ON DELETE RESTRICT,
  type         VARCHAR(6)     NOT NULL,
  amount       NUMERIC(18, 2) NOT NULL,
  description  VARCHAR(500),
  reference_id VARCHAR(255)   NOT NULL,
  created_at   TIMESTAMPTZ    NOT NULL DEFAULT now(),

  CONSTRAINT transactions_type_valid              CHECK (type IN ('credit', 'debit')),
  CONSTRAINT transactions_amount_positive         CHECK (amount > 0),
  CONSTRAINT transactions_reference_id_not_blank  CHECK (btrim(reference_id) <> ''),
  -- A reference_id is unique per account; other accounts may reuse it.
  CONSTRAINT transactions_account_reference_unique UNIQUE (account_id, reference_id)
);

-- Serves the history query: filter by account, newest first, id as tiebreaker.
CREATE INDEX transactions_account_created_idx
  ON transactions (account_id, created_at DESC, id DESC);
