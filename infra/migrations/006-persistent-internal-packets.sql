-- Persist internal packet state so Vercel instances cannot lose or duplicate claims.
ALTER TABLE packet_records ADD COLUMN IF NOT EXISTS total_amount bigint NOT NULL DEFAULT 0 CHECK (total_amount >= 0);
ALTER TABLE packet_records ADD COLUMN IF NOT EXISTS max_claims bigint NOT NULL DEFAULT 1 CHECK (max_claims > 0);
ALTER TABLE packet_records ADD COLUMN IF NOT EXISTS claimed_amount bigint NOT NULL DEFAULT 0 CHECK (claimed_amount >= 0);
ALTER TABLE packet_records ADD COLUMN IF NOT EXISTS claimed_count bigint NOT NULL DEFAULT 0 CHECK (claimed_count >= 0);
ALTER TABLE packet_records ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '45 seconds');
ALTER TABLE packet_records ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_packet_records_expires ON packet_records(expires_at);
CREATE INDEX IF NOT EXISTS idx_claim_records_round_user ON claim_records(round_id, user_id, claim_sequence);
