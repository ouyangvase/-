-- Stable room message identity for pagination, reconnect replay and read cursors.
ALTER TABLE room_messages ADD COLUMN IF NOT EXISTS message_seq bigint;

WITH numbered AS (
  SELECT id,
    COALESCE((SELECT MAX(existing.message_seq) FROM room_messages existing WHERE existing.room_id = pending.room_id), 0)
      + row_number() OVER (PARTITION BY room_id ORDER BY created_at, id) AS seq
  FROM room_messages
  WHERE message_seq IS NULL
)
UPDATE room_messages AS room_message
SET message_seq = numbered.seq
FROM numbered
WHERE room_message.id = numbered.id
  AND room_message.message_seq IS NULL;

CREATE OR REPLACE FUNCTION project12_assign_room_message_seq()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.message_seq IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.room_id::text, 0));
    SELECT COALESCE(MAX(message_seq), 0) + 1 INTO NEW.message_seq
    FROM room_messages
    WHERE room_id = NEW.room_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project12_room_message_seq ON room_messages;
CREATE TRIGGER project12_room_message_seq
BEFORE INSERT ON room_messages
FOR EACH ROW EXECUTE FUNCTION project12_assign_room_message_seq();

ALTER TABLE room_messages ALTER COLUMN message_seq SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_room_messages_room_seq ON room_messages(room_id, message_seq);
CREATE INDEX IF NOT EXISTS idx_room_messages_room_seq ON room_messages(room_id, message_seq DESC);

ALTER TABLE chat_message_reads ADD COLUMN IF NOT EXISTS last_read_message_seq bigint;
