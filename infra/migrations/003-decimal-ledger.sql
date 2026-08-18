-- Preserve the rules-deck fee examples (4.50 and 9.50) in the persistent demo ledger.
ALTER TABLE settlement_lines ALTER COLUMN amount TYPE numeric(20,2) USING amount::numeric;
ALTER TABLE wallet_accounts ALTER COLUMN balance TYPE numeric(20,2) USING balance::numeric;
ALTER TABLE ledger_lines ALTER COLUMN amount TYPE numeric(20,2) USING amount::numeric;
ALTER TABLE balance_snapshots ALTER COLUMN available TYPE numeric(20,2) USING available::numeric;
ALTER TABLE balance_snapshots ALTER COLUMN locked TYPE numeric(20,2) USING locked::numeric;

ALTER TABLE hands DROP CONSTRAINT IF EXISTS hands_points_check;
ALTER TABLE hands ADD CONSTRAINT hands_points_check CHECK (points BETWEEN 0 AND 10);
