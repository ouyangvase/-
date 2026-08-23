-- Keep the room pointed at the round that players should see next.
ALTER TABLE game_rooms ADD COLUMN IF NOT EXISTS active_round_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_rooms_active_round_id_fkey') THEN
    ALTER TABLE game_rooms ADD CONSTRAINT game_rooms_active_round_id_fkey FOREIGN KEY (active_round_id) REFERENCES rounds(id);
  END IF;
END $$;

UPDATE game_rooms
SET active_round_id = '00000000-0000-0000-0001-000000000004'
WHERE id = '00000000-0000-0000-0001-000000000003'
  AND active_round_id IS NULL
  AND EXISTS (SELECT 1 FROM rounds WHERE id = '00000000-0000-0000-0001-000000000004');

UPDATE game_rooms room
SET active_round_id = latest.id
FROM LATERAL (
  SELECT r.id
  FROM rounds r
  WHERE r.room_id = room.id
  ORDER BY (r.state <> 'ROUND_COMPLETE') DESC, r.created_at DESC, r.id DESC
  LIMIT 1
) latest
WHERE room.active_round_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_game_rooms_active_round ON game_rooms(active_round_id);
