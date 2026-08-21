-- Persist message template keys separately from translated display text.
-- This is additive and safe to apply after the internal chat permissions migration.

ALTER TABLE room_messages
  ADD COLUMN IF NOT EXISTS template_key text;

CREATE INDEX IF NOT EXISTS idx_room_messages_template_key
  ON room_messages(template_key)
  WHERE template_key IS NOT NULL;
