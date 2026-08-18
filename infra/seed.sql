-- Deterministic demo seed. Safe to run repeatedly.
INSERT INTO users (id, display_name, role, risk_status) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Demo Player', 'PLAYER', 'CLEAR'),
  ('00000000-0000-0000-0000-000000000002', 'Safety Admin', 'ADMIN', 'CLEAR')
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role;
INSERT INTO user_profiles (user_id) VALUES ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002') ON CONFLICT (user_id) DO NOTHING;
INSERT INTO telegram_identities (user_id, telegram_user_id, username) VALUES ('00000000-0000-0000-0000-000000000001', 'demo-player-01', 'demo_player') ON CONFLICT (user_id) DO NOTHING;
INSERT INTO games (id, slug, name) VALUES ('00000000-0000-0000-0001-000000000001', '12-niuniu', '12牛牛') ON CONFLICT (id) DO NOTHING;
INSERT INTO round_rule_versions (id, game_id, version, fee_rate_bps, rules) VALUES
  ('00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0001-000000000001', 'demo-v1-source-confirmed-examples', 500,
   '{"specialHands":["豹子","满牛","反顺","顺子","对子","金牛"],"ordering":["豹子","满牛","反顺","顺子","对子","金牛","普通"],"realMoney":false}'::jsonb)
ON CONFLICT (id) DO NOTHING;
INSERT INTO game_rooms (id, game_id, name, status) VALUES ('00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0001-000000000001', 'P12 Demo Table', 'OPEN') ON CONFLICT (id) DO NOTHING;
INSERT INTO rounds (id, room_id, rule_version_id, state, state_ends_at, server_seed_hash) VALUES
  ('00000000-0000-0000-0001-000000000004', '00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0001-000000000002', 'BETTING', now() + interval '28 seconds', 'demo-seed-hash')
ON CONFLICT (id) DO NOTHING;
INSERT INTO referral_codes (user_id, code) VALUES ('00000000-0000-0000-0000-000000000002', 'DEMO-INVITE') ON CONFLICT (code) DO NOTHING;
INSERT INTO campaigns (id, slug, name, status) VALUES ('00000000-0000-0000-0002-000000000001', 'daily-demo', 'Daily demo rounds', 'ACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO campaign_versions (id, campaign_id, version, rules) VALUES ('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0002-000000000001', 1, '{"target":3,"rewardPoints":120}'::jsonb) ON CONFLICT (id) DO NOTHING;
INSERT INTO wallet_accounts (user_id, account_type, balance) VALUES
  ('00000000-0000-0000-0000-000000000001', 'USER_AVAILABLE', 12500),
  ('00000000-0000-0000-0000-000000000001', 'USER_LOCKED', 0),
  (NULL, 'BANKER_POOL', 4800),
  (NULL, 'PLATFORM_FEE', 0),
  (NULL, 'DEMO_GRANTS', 12630)
ON CONFLICT (user_id, account_type) DO NOTHING;
INSERT INTO announcements (id, title, body, status, published_at) VALUES
  ('00000000-0000-0000-0003-000000000001', 'Welcome to PROJECT 12', 'Demo mode is active. Credits have no cash value.', 'PUBLISHED', now())
ON CONFLICT (id) DO NOTHING;
