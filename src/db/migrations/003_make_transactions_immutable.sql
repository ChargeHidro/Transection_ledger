-- Transactions are an append-only ledger. The API exposes no update or delete
-- endpoints, and this trigger enforces the same rule at the database level.
CREATE FUNCTION prevent_transaction_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'transactions are immutable: % is not allowed', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER transactions_immutable
  BEFORE UPDATE OR DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION prevent_transaction_mutation();
