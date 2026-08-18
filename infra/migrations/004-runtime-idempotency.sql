-- Runtime boundary upgrade. This migration is additive and intentionally does not reset or delete data.
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS claimed_by text;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS attempt_count int NOT NULL DEFAULT 0;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS last_error text;

CREATE TABLE IF NOT EXISTS telegram_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), update_id bigint NOT NULL UNIQUE, update_type text NOT NULL,
  payload jsonb NOT NULL, received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS worker_heartbeats (
  worker_id text PRIMARY KEY, status text NOT NULL, heartbeat_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telegram_updates_received ON telegram_updates(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_worker_heartbeats_recent ON worker_heartbeats(heartbeat_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbox_claimable ON outbox_events(created_at) WHERE published_at IS NULL;
