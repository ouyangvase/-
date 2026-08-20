-- One-time grants let reply-keyboard Mini Apps authenticate even when Telegram
-- does not provide WebAppInitData for that launch mode.
CREATE TABLE IF NOT EXISTS telegram_launch_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), update_id bigint NOT NULL UNIQUE,
  telegram_user_id text NOT NULL, chat_id text NOT NULL, token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_telegram_launch_grants_active ON telegram_launch_grants(token_hash, expires_at) WHERE used_at IS NULL;
