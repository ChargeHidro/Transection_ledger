CREATE TABLE accounts (
  id         UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(255)   NOT NULL,
  balance    NUMERIC(18, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ    NOT NULL DEFAULT now(),

  CONSTRAINT accounts_name_not_blank       CHECK (btrim(name) <> ''),
  CONSTRAINT accounts_balance_non_negative CHECK (balance >= 0)
);
