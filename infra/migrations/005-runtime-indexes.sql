-- Production runtime indexes for the Supabase/Postgres-backed game loop.
-- The API connects through the transaction pooler and is the only trusted writer.

CREATE INDEX IF NOT EXISTS idx_telegram_identities_user_id ON telegram_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_expiry ON user_sessions(user_id, expires_at DESC) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_device_sessions_binding ON device_sessions(device_binding_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_sessions_session ON device_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_referral_edges_referrer ON referral_edges(referrer_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rounds_room_state ON rounds(room_id, state, state_ends_at);
CREATE INDEX IF NOT EXISTS idx_rounds_banker ON rounds(banker_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_round_events_actor ON round_events(actor, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_banker_bids_user ON banker_bids(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bets_user_round ON bets(user_id, round_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claim_records_packet_created ON claim_records(packet_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_claim_records_user ON claim_records(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hands_user_round ON hands(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_settlements_user_round ON settlements(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_settlement_lines_settlement ON settlement_lines(settlement_id);
CREATE INDEX IF NOT EXISTS idx_ledger_lines_account ON ledger_lines(account_id, id);
CREATE INDEX IF NOT EXISTS idx_balance_snapshots_account_created ON balance_snapshots(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_progress_user ON campaign_progress(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_claims_user ON campaign_claims(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_flags_user ON risk_flags(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_disputes_user ON disputes(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_actions_admin ON admin_actions(admin_user_id, created_at DESC);
