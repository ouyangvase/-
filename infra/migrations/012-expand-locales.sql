-- Expand the selectable Mini App locale set without resetting existing data.
-- This is a forward migration for databases that already applied 009/010.

ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_locale_check;
ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_locale_check
  CHECK (locale IN ('zh-CN', 'zh-TW', 'en', 'ms', 'th', 'vi', 'id', 'ta', 'my', 'km', 'hi', 'ar', 'ja', 'ko', 'fil'));

ALTER TABLE user_languages DROP CONSTRAINT IF EXISTS user_languages_locale_check;
ALTER TABLE user_languages
  ADD CONSTRAINT user_languages_locale_check
  CHECK (locale IN ('zh-CN', 'zh-TW', 'en', 'ms', 'th', 'vi', 'id', 'ta', 'my', 'km', 'hi', 'ar', 'ja', 'ko', 'fil'));
