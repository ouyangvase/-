-- Project 12 internal chat uses a private Supabase Realtime channel.
-- API/Worker broadcast with the server key; clients receive only when their
-- Supabase JWT subject is an active member of the room.

DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS project12_room_realtime_read ON realtime.messages';
    EXECUTE 'DROP POLICY IF EXISTS project12_room_realtime_presence_write ON realtime.messages';
    EXECUTE 'DROP POLICY IF EXISTS project12_room_realtime_broadcast_write ON realtime.messages';
    EXECUTE 'DROP POLICY IF EXISTS project12_room_realtime_presence_read ON realtime.messages';
    EXECUTE $policy$
      CREATE POLICY project12_room_realtime_read
      ON realtime.messages FOR SELECT
      TO authenticated
      USING (
        (select realtime.topic()) = 'room-12'
        AND extension = 'broadcast'
        AND EXISTS (
          SELECT 1
          FROM public.room_members member
          JOIN public.game_rooms game_room ON game_room.id = member.room_id
          WHERE member.user_id = auth.uid()
            AND member.left_at IS NULL
            AND game_room.status = 'OPEN'
        )
      )
    $policy$;
    EXECUTE $policy$
      CREATE POLICY project12_room_realtime_presence_read
      ON realtime.messages FOR SELECT
      TO authenticated
      USING (
        (select realtime.topic()) = 'room-12'
        AND extension = 'presence'
        AND EXISTS (
          SELECT 1
          FROM public.room_members member
          JOIN public.game_rooms game_room ON game_room.id = member.room_id
          WHERE member.user_id = auth.uid()
            AND member.left_at IS NULL
            AND game_room.status = 'OPEN'
        )
      )
    $policy$;
    EXECUTE $policy$
      CREATE POLICY project12_room_realtime_broadcast_write
      ON realtime.messages FOR INSERT
      TO authenticated
      WITH CHECK (
        (select realtime.topic()) = 'room-12'
        AND extension = 'broadcast'
        AND EXISTS (
          SELECT 1
          FROM public.room_members member
          JOIN public.game_rooms game_room ON game_room.id = member.room_id
          WHERE member.user_id = auth.uid()
            AND member.left_at IS NULL
            AND game_room.status = 'OPEN'
        )
      )
    $policy$;
    EXECUTE $policy$
      CREATE POLICY project12_room_realtime_presence_write
      ON realtime.messages FOR INSERT
      TO authenticated
      WITH CHECK (
        (select realtime.topic()) = 'room-12'
        AND extension = 'presence'
        AND EXISTS (
          SELECT 1
          FROM public.room_members member
          JOIN public.game_rooms game_room ON game_room.id = member.room_id
          WHERE member.user_id = auth.uid()
            AND member.left_at IS NULL
            AND game_room.status = 'OPEN'
        )
      )
    $policy$;
  END IF;
END $$;
