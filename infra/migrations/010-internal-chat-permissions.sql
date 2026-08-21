-- Internal Mini App chat permissions. This migration is additive and does not
-- reset, drop, or truncate existing product data.

ALTER TABLE room_messages
  ADD COLUMN IF NOT EXISTS target_user_id uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'PUBLIC_ROOM';

ALTER TABLE room_messages DROP CONSTRAINT IF EXISTS room_messages_visibility_check;
ALTER TABLE room_messages
  ADD CONSTRAINT room_messages_visibility_check
  CHECK (visibility IN ('PUBLIC_ROOM', 'PARTICIPANTS_ONLY', 'TARGET_USER', 'ADMIN_ONLY'));

ALTER TABLE identity_verifications DROP CONSTRAINT IF EXISTS identity_verifications_status_check;
ALTER TABLE identity_verifications
  ADD CONSTRAINT identity_verifications_status_check
  CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'NEEDS_MORE_INFO', 'SUSPENDED'));

CREATE INDEX IF NOT EXISTS idx_room_messages_round_visibility_created
  ON room_messages(round_id, visibility, created_at, id);
CREATE INDEX IF NOT EXISTS idx_room_messages_target_user
  ON room_messages(target_user_id, created_at DESC)
  WHERE target_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_languages (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  locale text NOT NULL CHECK (locale IN ('zh-CN', 'zh-TW', 'en', 'ms', 'th', 'vi', 'id', 'ja', 'ko', 'fil')),
  source text NOT NULL DEFAULT 'USER' CHECK (source IN ('USER', 'TELEGRAM', 'DEFAULT')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS verification_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id uuid REFERENCES identity_verifications(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  before_status text,
  after_status text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payout_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'TNG_EWALLET',
  account_ciphertext text NOT NULL,
  account_last4 text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS round_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('BANKER', 'PLAYER')),
  status text NOT NULL DEFAULT 'ELIGIBLE' CHECK (status IN ('ELIGIBLE', 'FAILED', 'LEFT', 'CLAIMED', 'AUTO_CLAIMED')),
  bet_amount numeric(18, 2),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_round_participants_user_round
  ON round_participants(user_id, round_id);

CREATE TABLE IF NOT EXISTS packet_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  packet_id uuid REFERENCES packet_records(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  allocation_amount numeric(18, 2),
  claim_status text NOT NULL DEFAULT 'ELIGIBLE' CHECK (claim_status IN ('ELIGIBLE', 'CLAIMED', 'AUTO_CLAIMED', 'EXPIRED')),
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_packet_allocations_user_status
  ON packet_allocations(user_id, round_id, claim_status);

CREATE TABLE IF NOT EXISTS chat_message_reads (
  room_id uuid NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_message_id uuid REFERENCES room_messages(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES room_messages(id) ON DELETE CASCADE,
  pinned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, message_id)
);

CREATE TABLE IF NOT EXISTS wallet_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  round_id uuid REFERENCES rounds(id) ON DELETE SET NULL,
  hold_type text NOT NULL CHECK (hold_type IN ('BET', 'BANKER_POOL', 'WITHDRAWAL')),
  amount numeric(18, 2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'HELD' CHECK (status IN ('HELD', 'RELEASED', 'CAPTURED', 'CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_wallet_holds_user_status
  ON wallet_holds(user_id, status, created_at DESC);

-- Browser clients do not query these tables directly. The API/worker uses the
-- server-side database role, while Supabase Realtime receives committed events.
ALTER TABLE room_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE round_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE packet_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_holds ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.room_messages;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;
