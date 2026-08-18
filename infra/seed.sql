-- Deterministic demo seed. Safe to run repeatedly.
-- Every balance below is a demo point integer. It is never fiat, crypto, or a payment balance.

DO $$
DECLARE
  i int;
  uid uuid;
  round_id uuid;
  room_id uuid;
  game_id uuid := '00000000-0000-0000-0001-000000000001';
  rule_id uuid := '00000000-0000-0000-0001-000000000002';
  player_id uuid := md5('project12-user-1')::uuid;
  outcome text;
  announcement_id uuid;
BEGIN
  FOR i IN 1..20 LOOP
    INSERT INTO users (id, internal_uid, display_name, role, risk_status)
    VALUES (
      md5(format('project12-user-%s', i))::uuid,
      format('P12-DEMO-%s', lpad(i::text, 2, '0')),
      CASE WHEN i = 19 THEN 'Safety Admin' WHEN i = 20 THEN 'Support Operator' ELSE format('Demo Player %s', lpad(i::text, 2, '0')) END,
      CASE WHEN i = 19 THEN 'ADMIN' WHEN i = 20 THEN 'SUPPORT' ELSE 'PLAYER' END,
      'CLEAR'
    )
    ON CONFLICT (internal_uid) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role;
    SELECT id INTO uid FROM users WHERE internal_uid = format('P12-DEMO-%s', lpad(i::text, 2, '0'));
    INSERT INTO user_profiles (user_id) VALUES (uid) ON CONFLICT (user_id) DO NOTHING;
    INSERT INTO telegram_identities (user_id, telegram_user_id, username)
    VALUES (uid, format('demo-telegram-%s', i), format('demo_player_%s', i))
    ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username;
    INSERT INTO referral_codes (user_id, code)
    VALUES (uid, format('P12-DEMO-%s', lpad(i::text, 2, '0')))
    ON CONFLICT (user_id) DO NOTHING;
  END LOOP;

  INSERT INTO admin_roles (name, description) VALUES
    ('SUPER_ADMIN', 'Full demo operations access'), ('OPERATIONS', 'Round and service operations'), ('FINANCE_VIEWER', 'Read-only ledger visibility'),
    ('SUPPORT', 'Support and recovery workflows'), ('RISK_REVIEWER', 'Risk and dispute review'), ('CAMPAIGN_MANAGER', 'Campaign and announcement management'), ('READ_ONLY', 'Read-only console access')
  ON CONFLICT (name) DO NOTHING;
  INSERT INTO admin_user_roles (user_id, role_id)
  SELECT md5('project12-user-19')::uuid, id FROM admin_roles WHERE name = 'SUPER_ADMIN'
  ON CONFLICT (user_id, role_id) DO NOTHING;

  INSERT INTO games (id, slug, name) VALUES (game_id, '12-niuniu', '12牛牛') ON CONFLICT (id) DO NOTHING;
  INSERT INTO round_rule_versions (id, game_id, version, fee_rate_bps, rules) VALUES
    (rule_id, game_id, 'demo-v1-source-confirmed-examples', 500,
     '{"specialHands":["豹子","满牛","反顺","顺子","对子","金牛"],"ordering":["豹子","满牛","反顺","顺子","对子","金牛","普通"],"realMoney":false,"confidence":"SOURCE_CONFIRMED_EXAMPLES"}'::jsonb)
  ON CONFLICT (id) DO UPDATE SET rules = EXCLUDED.rules, fee_rate_bps = EXCLUDED.fee_rate_bps;
  INSERT INTO game_rooms (id, game_id, name, status) VALUES
    ('00000000-0000-0000-0001-000000000003', game_id, 'P12 Demo Table', 'OPEN'),
    ('00000000-0000-0000-0001-000000000005', game_id, 'P12 Audit Table', 'OPEN')
  ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;
  INSERT INTO rounds (id, room_id, rule_version_id, state, state_ends_at, server_seed_hash, banker_user_id)
  VALUES ('00000000-0000-0000-0001-000000000004', '00000000-0000-0000-0001-000000000003', rule_id, 'BETTING', now() + interval '28 seconds', 'demo-seed-hash', player_id)
  ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, state_ends_at = EXCLUDED.state_ends_at;

  FOR i IN 1..30 LOOP
    round_id := md5(format('project12-history-round-%s', i))::uuid;
    room_id := CASE WHEN i % 2 = 0 THEN '00000000-0000-0000-0001-000000000003'::uuid ELSE '00000000-0000-0000-0001-000000000005'::uuid END;
    outcome := CASE (i % 4) WHEN 1 THEN 'WIN' WHEN 2 THEN 'LOSE' WHEN 3 THEN 'TIE' ELSE 'WATERED' END;
    INSERT INTO rounds (id, room_id, rule_version_id, state, state_started_at, state_ends_at, state_version, banker_user_id, server_seed_hash, seed_revealed_at)
    VALUES (round_id, room_id, rule_id, 'ROUND_COMPLETE', now() - (i || ' days')::interval, now() - (i || ' days')::interval + interval '45 seconds', 8,
      md5(format('project12-user-%s', 2 + (i % 5)))::uuid, md5(format('project12-seed-%s', i)), now() - (i || ' days')::interval)
    ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, state_version = EXCLUDED.state_version, seed_revealed_at = EXCLUDED.seed_revealed_at;
    INSERT INTO packet_records (id, round_id, provider, server_seed_hash, server_seed, revealed_at)
    VALUES (md5(format('project12-packet-%s', i))::uuid, round_id, 'demo', md5(format('project12-seed-%s', i)), format('demo-seed-%s', i), now() - (i || ' days')::interval)
    ON CONFLICT (round_id) DO NOTHING;
    INSERT INTO claim_records (id, packet_id, round_id, user_id, claim_sequence, demo_value, created_at)
    VALUES (md5(format('project12-claim-%s', i))::uuid, md5(format('project12-packet-%s', i))::uuid, round_id, player_id, 1, 30 + (i % 60), now() - (i || ' days')::interval)
    ON CONFLICT (round_id, user_id, claim_sequence) DO NOTHING;
    INSERT INTO hands (id, round_id, user_id, points, hand_type, cards, created_at)
    VALUES (md5(format('project12-hand-%s', i))::uuid, round_id, player_id, (i % 9) + 1,
      CASE (i % 4) WHEN 1 THEN '普通点数' WHEN 2 THEN '对子' WHEN 3 THEN '顺子' ELSE '豹子' END,
      jsonb_build_array(i % 10, (i + 2) % 10, (i + 4) % 10), now() - (i || ' days')::interval)
    ON CONFLICT (round_id, user_id) DO NOTHING;
    INSERT INTO settlements (id, round_id, user_id, settlement_type, status, created_at)
    VALUES (md5(format('project12-settlement-%s', i))::uuid, round_id, player_id, outcome, 'POSTED', now() - (i || ' days')::interval)
    ON CONFLICT (round_id, user_id, settlement_type) DO NOTHING;
  END LOOP;

  INSERT INTO referral_edges (referrer_user_id, referred_user_id, referral_code, status, source)
  VALUES
    (md5('project12-user-1')::uuid, md5('project12-user-2')::uuid, 'P12-DEMO-01', 'QUALIFIED', 'SEED'),
    (md5('project12-user-2')::uuid, md5('project12-user-3')::uuid, 'P12-DEMO-02', 'QUALIFIED', 'SEED'),
    (md5('project12-user-3')::uuid, md5('project12-user-4')::uuid, 'P12-DEMO-03', 'PENDING', 'SEED')
  ON CONFLICT (referred_user_id) DO UPDATE SET status = EXCLUDED.status;

  INSERT INTO campaigns (id, slug, name, status) VALUES
    (md5('project12-campaign-1')::uuid, 'daily-demo', 'Daily demo rounds', 'ACTIVE'),
    (md5('project12-campaign-2')::uuid, 'banker-week', 'Banker week', 'ACTIVE'),
    (md5('project12-campaign-3')::uuid, 'referral-social', 'Referral social', 'ACTIVE'),
    (md5('project12-campaign-4')::uuid, 'new-player', 'New player welcome', 'ACTIVE')
  ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;
  FOR i IN 1..4 LOOP
    INSERT INTO campaign_versions (id, campaign_id, version, rules)
    VALUES (md5(format('project12-campaign-version-%s', i))::uuid, md5(format('project12-campaign-%s', i))::uuid, 1,
      jsonb_build_object('target', CASE WHEN i = 3 THEN 2 ELSE 3 END, 'rewardPoints', i * 120))
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO campaign_rules (campaign_version_id, rule_key, rule_value)
    VALUES (md5(format('project12-campaign-version-%s', i))::uuid, 'demo_only', 'true'::jsonb)
    ON CONFLICT (campaign_version_id, rule_key) DO NOTHING;
    INSERT INTO campaign_rewards (campaign_version_id, reward_key, reward_points)
    VALUES (md5(format('project12-campaign-version-%s', i))::uuid, 'default', i * 120)
    ON CONFLICT (campaign_version_id, reward_key) DO NOTHING;
  END LOOP;

  INSERT INTO wallet_accounts (user_id, account_type, balance) VALUES
    (player_id, 'USER_AVAILABLE', 12500), (player_id, 'USER_LOCKED', 0), (player_id, 'USER_LOCKED_BANKER_POOL', 0)
  ON CONFLICT (user_id, account_type) DO UPDATE SET balance = EXCLUDED.balance;
  INSERT INTO wallet_accounts (user_id, account_type, balance)
  SELECT NULL, value.account_type, value.balance FROM (VALUES
    ('BANKER_POOL', 4800), ('PLATFORM_FEE', 0), ('DEMO_GRANTS', 12630), ('CAMPAIGN_REWARD_RESERVE', 100000), ('PENDING_ADJUSTMENT', 0)
  ) AS value(account_type, balance)
  WHERE NOT EXISTS (SELECT 1 FROM wallet_accounts existing WHERE existing.user_id IS NULL AND existing.account_type = value.account_type);

  FOR i IN 1..8 LOOP
    announcement_id := md5(format('project12-announcement-%s', i))::uuid;
    INSERT INTO announcements (id, title, body, status, published_at)
    VALUES (announcement_id, format('PROJECT 12 bulletin %s', i), 'Demo mode is active. Credits have no cash value.', 'PUBLISHED', now())
    ON CONFLICT (id) DO UPDATE SET status = 'PUBLISHED';
    INSERT INTO announcement_banners (id, announcement_id, image_url, action_path, sort_order)
    VALUES (md5(format('project12-banner-%s', i))::uuid, announcement_id, format('/assets/announcement-%s.svg', i), '/hall', i)
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END $$;
