-- PROJECT 12 demo schema.
-- Wallet amounts are demo points with up to two decimal places. No table represents fiat or crypto money.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), internal_uid text NOT NULL UNIQUE DEFAULT ('P12-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  display_name text NOT NULL,
  role text NOT NULL DEFAULT 'PLAYER' CHECK (role IN ('PLAYER', 'ADMIN', 'SUPPORT', 'SUPER_ADMIN', 'OPERATIONS', 'FINANCE_VIEWER', 'RISK_REVIEWER', 'CAMPAIGN_MANAGER', 'READ_ONLY')),
  risk_status text NOT NULL DEFAULT 'CLEAR' CHECK (risk_status IN ('CLEAR', 'REVIEW', 'HELD', 'BANNED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS admin_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE, description text NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_user_roles (
  user_id uuid NOT NULL REFERENCES users(id), role_id uuid NOT NULL REFERENCES admin_roles(id), granted_by uuid REFERENCES users(id), granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, role_id)
);
CREATE TABLE IF NOT EXISTS telegram_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  telegram_user_id text NOT NULL UNIQUE, username text, first_name text, last_name text,
  init_data_verified_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id), avatar_url text, locale text NOT NULL DEFAULT 'zh-CN',
  timezone text NOT NULL DEFAULT 'Asia/Kuala_Lumpur', bio text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), session_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS device_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE REFERENCES users(id), device_public_key text NOT NULL UNIQUE, device_fingerprint_hash text UNIQUE,
  platform text NOT NULL DEFAULT 'telegram', bound_at timestamptz NOT NULL DEFAULT now(), unbound_at timestamptz
);
CREATE TABLE IF NOT EXISTS device_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), device_binding_id uuid NOT NULL REFERENCES device_bindings(id), session_id uuid NOT NULL REFERENCES user_sessions(id),
  last_seen_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS device_recovery_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), reason text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'APPROVED', 'REJECTED', 'CLOSED')),
  reviewed_by uuid REFERENCES users(id), reviewed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS security_pins (
  user_id uuid PRIMARY KEY REFERENCES users(id), pin_hash text NOT NULL, failed_attempts int NOT NULL DEFAULT 0,
  locked_until timestamptz, changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS identity_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  legal_name_ciphertext text NOT NULL, tng_account_ciphertext text NOT NULL, tng_account_last4 text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  submitted_at timestamptz NOT NULL DEFAULT now(), reviewed_by text, reviewed_at timestamptz, rejection_reason text
);

CREATE TABLE IF NOT EXISTS referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'EXPIRED')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS referral_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), referrer_user_id uuid NOT NULL REFERENCES users(id), referred_user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  referral_code text NOT NULL REFERENCES referral_codes(code), status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'QUALIFIED', 'REJECTED')),
  source text NOT NULL DEFAULT 'MANUAL', created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL UNIQUE, name text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'ARCHIVED')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS round_rule_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), game_id uuid NOT NULL REFERENCES games(id), version text NOT NULL,
  fee_rate_bps int NOT NULL DEFAULT 500, banker_pool_limit bigint NOT NULL DEFAULT 0 CHECK (banker_pool_limit >= 0), rules jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(game_id, version)
);
CREATE TABLE IF NOT EXISTS game_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), game_id uuid NOT NULL REFERENCES games(id), name text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'PAUSED', 'CLOSED')), active_round_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS room_members (
  room_id uuid NOT NULL REFERENCES game_rooms(id), user_id uuid NOT NULL REFERENCES users(id), joined_at timestamptz NOT NULL DEFAULT now(), left_at timestamptz,
  PRIMARY KEY(room_id, user_id)
);
CREATE TABLE IF NOT EXISTS rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room_id uuid NOT NULL REFERENCES game_rooms(id), rule_version_id uuid NOT NULL REFERENCES round_rule_versions(id),
  state text NOT NULL CHECK (state IN ('LOBBY', 'BANKER_BIDDING', 'BETTING', 'WAITING_BANKER_CONFIRM', 'PACKET_SENT', 'CLAIMING', 'EVALUATING', 'SETTLING', 'ROUND_COMPLETE', 'ROUND_CANCELLED', 'REFUNDING', 'REFUNDED', 'DISPUTED')),
  state_started_at timestamptz NOT NULL DEFAULT now(), state_ends_at timestamptz, state_version bigint NOT NULL DEFAULT 1, banker_user_id uuid REFERENCES users(id),
  server_seed_hash text, server_seed text, seed_revealed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE game_rooms ADD COLUMN IF NOT EXISTS active_round_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_rooms_active_round_id_fkey') THEN
    ALTER TABLE game_rooms ADD CONSTRAINT game_rooms_active_round_id_fkey FOREIGN KEY (active_round_id) REFERENCES rounds(id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_game_rooms_active_round ON game_rooms(active_round_id);
CREATE TABLE IF NOT EXISTS round_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), round_id uuid NOT NULL REFERENCES rounds(id), from_state text, to_state text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb, actor text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS room_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room_id uuid NOT NULL REFERENCES game_rooms(id), round_id uuid NOT NULL REFERENCES rounds(id),
  user_id uuid REFERENCES users(id), target_user_id uuid REFERENCES users(id), message_type text NOT NULL,
  visibility text NOT NULL DEFAULT 'PUBLIC_ROOM' CHECK (visibility IN ('PUBLIC_ROOM', 'PARTICIPANTS_ONLY', 'TARGET_USER', 'ADMIN_ONLY')),
  template_key text, body text NOT NULL, payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  message_seq bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS room_messages_room_message_seq_uq ON room_messages(room_id, message_seq);
CREATE INDEX IF NOT EXISTS room_messages_room_seq_idx ON room_messages(room_id, message_seq DESC);
CREATE OR REPLACE FUNCTION project12_assign_room_message_seq()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.message_seq IS NULL OR NEW.message_seq <= 0 THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.room_id::text, 0));
    SELECT COALESCE(MAX(message_seq), 0) + 1 INTO NEW.message_seq FROM room_messages WHERE room_id = NEW.room_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS room_messages_assign_message_seq ON room_messages;
CREATE TRIGGER room_messages_assign_message_seq
BEFORE INSERT ON room_messages
FOR EACH ROW EXECUTE FUNCTION project12_assign_room_message_seq();
CREATE TABLE IF NOT EXISTS chat_message_reads (
  room_id uuid NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_message_id uuid REFERENCES room_messages(id) ON DELETE SET NULL,
  last_read_message_seq bigint,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(room_id, user_id)
);
CREATE TABLE IF NOT EXISTS banker_bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), round_id uuid NOT NULL REFERENCES rounds(id), user_id uuid NOT NULL REFERENCES users(id), amount bigint NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(round_id, user_id)
);
CREATE TABLE IF NOT EXISTS banker_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), round_id uuid NOT NULL UNIQUE REFERENCES rounds(id), amount bigint NOT NULL DEFAULT 0 CHECK (amount >= 0), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), round_id uuid NOT NULL REFERENCES rounds(id), user_id uuid NOT NULL REFERENCES users(id), bet_sequence bigint NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(round_id, user_id, bet_sequence)
);
CREATE TABLE IF NOT EXISTS packet_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), round_id uuid NOT NULL UNIQUE REFERENCES rounds(id), provider text NOT NULL DEFAULT 'demo',
  server_seed_hash text NOT NULL, server_seed text, total_amount bigint NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  max_claims bigint NOT NULL DEFAULT 1 CHECK (max_claims > 0), claimed_amount bigint NOT NULL DEFAULT 0 CHECK (claimed_amount >= 0),
  claimed_count bigint NOT NULL DEFAULT 0 CHECK (claimed_count >= 0), expires_at timestamptz NOT NULL DEFAULT (now() + interval '45 seconds'),
  cancelled_at timestamptz, revealed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS claim_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), packet_id uuid NOT NULL REFERENCES packet_records(id), round_id uuid NOT NULL REFERENCES rounds(id), user_id uuid NOT NULL REFERENCES users(id),
  claim_sequence bigint NOT NULL, demo_value bigint NOT NULL CHECK (demo_value >= 0), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(round_id, user_id, claim_sequence)
);
CREATE TABLE IF NOT EXISTS hands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), round_id uuid NOT NULL REFERENCES rounds(id), user_id uuid NOT NULL REFERENCES users(id), points int NOT NULL CHECK (points BETWEEN 0 AND 10),
  hand_type text NOT NULL, cards jsonb NOT NULL DEFAULT '[]'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(round_id, user_id)
);
CREATE TABLE IF NOT EXISTS settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), round_id uuid NOT NULL REFERENCES rounds(id), user_id uuid NOT NULL REFERENCES users(id), settlement_type text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'POSTED', 'VOIDED')), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(round_id, user_id, settlement_type)
);
CREATE TABLE IF NOT EXISTS settlement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), settlement_id uuid NOT NULL REFERENCES settlements(id), account_type text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')), amount numeric(20,2) NOT NULL CHECK (amount > 0), reason text NOT NULL
);

CREATE TABLE IF NOT EXISTS wallet_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users(id), account_type text NOT NULL CHECK (account_type IN ('USER_AVAILABLE', 'USER_LOCKED', 'USER_LOCKED_BANKER_POOL', 'BANKER_POOL', 'PLATFORM_FEE', 'DEMO_GRANTS', 'CAMPAIGN_REWARD_RESERVE', 'PENDING_ADJUSTMENT')),
  balance numeric(20,2) NOT NULL DEFAULT 0 CHECK (balance >= 0), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id, account_type)
);
CREATE TABLE IF NOT EXISTS ledger_journals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reference_type text NOT NULL, reference_id text NOT NULL, idempotency_key text NOT NULL UNIQUE, provider_reference text UNIQUE,
  reason text NOT NULL, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ledger_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), journal_id uuid NOT NULL REFERENCES ledger_journals(id), account_id uuid NOT NULL REFERENCES wallet_accounts(id),
  direction text NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')), amount numeric(20,2) NOT NULL CHECK (amount > 0)
);
CREATE TABLE IF NOT EXISTS balance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES wallet_accounts(id), available numeric(20,2) NOT NULL, locked numeric(20,2) NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, body text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')), published_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS announcement_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), announcement_id uuid NOT NULL REFERENCES announcements(id), image_url text, action_path text, sort_order int NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL UNIQUE, name text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS campaign_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES campaigns(id), version int NOT NULL, rules jsonb NOT NULL,
  starts_at timestamptz, ends_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(campaign_id, version)
);
CREATE TABLE IF NOT EXISTS campaign_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_version_id uuid NOT NULL REFERENCES campaign_versions(id), rule_key text NOT NULL, rule_value jsonb NOT NULL,
  UNIQUE(campaign_version_id, rule_key)
);
CREATE TABLE IF NOT EXISTS campaign_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_version_id uuid NOT NULL REFERENCES campaign_versions(id), reward_key text NOT NULL, reward_points bigint NOT NULL CHECK (reward_points >= 0),
  UNIQUE(campaign_version_id, reward_key)
);
CREATE TABLE IF NOT EXISTS campaign_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_version_id uuid NOT NULL REFERENCES campaign_versions(id), user_id uuid NOT NULL REFERENCES users(id),
  progress bigint NOT NULL DEFAULT 0 CHECK (progress >= 0), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(campaign_version_id, user_id)
);
CREATE TABLE IF NOT EXISTS campaign_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_version_id uuid NOT NULL REFERENCES campaign_versions(id), user_id uuid NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL UNIQUE, reward_points bigint NOT NULL CHECK (reward_points >= 0), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(campaign_version_id, user_id)
);
CREATE TABLE IF NOT EXISTS leaderboard_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES campaigns(id), user_id uuid NOT NULL REFERENCES users(id),
  points bigint NOT NULL DEFAULT 0, rank int, updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(campaign_id, user_id)
);

CREATE TABLE IF NOT EXISTS risk_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users(id), round_id uuid REFERENCES rounds(id),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'REVIEW', 'HELD', 'CLOSED')), reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), round_id uuid REFERENCES rounds(id), user_id uuid REFERENCES users(id),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'REVIEW', 'RESOLVED', 'REJECTED')), reason text NOT NULL, resolution text, created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);
CREATE TABLE IF NOT EXISTS support_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users(id), author text NOT NULL, note text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key text PRIMARY KEY, actor text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_type text NOT NULL, payload jsonb NOT NULL, published_at timestamptz,
  claimed_at timestamptz, claimed_by text, attempt_count int NOT NULL DEFAULT 0, last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS telegram_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), update_id bigint NOT NULL UNIQUE, update_type text NOT NULL,
  payload jsonb NOT NULL, received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS telegram_launch_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), update_id bigint NOT NULL UNIQUE,
  telegram_user_id text NOT NULL, chat_id text NOT NULL, token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS worker_heartbeats (
  worker_id text PRIMARY KEY, status text NOT NULL, heartbeat_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor text NOT NULL, action text NOT NULL, reference_type text NOT NULL, reference_id text NOT NULL,
  before_state jsonb, after_state jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), admin_user_id uuid REFERENCES users(id), action text NOT NULL, ticket_id text NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_round_events_round_created ON round_events(round_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_room_messages_room_created ON room_messages(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_room_messages_template_key ON room_messages(template_key) WHERE template_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_reference ON audit_logs(reference_type, reference_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_flags_status ON risk_flags(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbox_unpublished ON outbox_events(created_at) WHERE published_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_telegram_updates_received ON telegram_updates(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_worker_heartbeats_recent ON worker_heartbeats(heartbeat_at DESC);
