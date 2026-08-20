-- Account locale is used by Mini App preferences and Bot notifications.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'zh-CN';

ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_locale_check;
ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_locale_check
  CHECK (locale IN ('zh-CN', 'en', 'ms', 'th', 'vi', 'id'));

CREATE INDEX IF NOT EXISTS idx_user_profiles_locale ON user_profiles(locale);

-- The API currently delivers chat through its authenticated SSE stream. This
-- publication keeps room_messages ready for a future direct Supabase client.
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
