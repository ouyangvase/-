-- Create the first live room, round and internal point pools.
-- This migration is intentionally idempotent and contains no demo users,
-- demo balances, or sample history. It only makes a fresh production
-- database immediately playable after the schema migrations complete.

DO $$
DECLARE
  v_game_id uuid;
  v_rule_id uuid;
  v_room_id uuid;
  v_round_id uuid;
  v_round_state text;
BEGIN
  INSERT INTO games (slug, name, status)
  VALUES ('12-niuniu', '12牛牛', 'ACTIVE')
  ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name, status = 'ACTIVE'
  RETURNING id INTO v_game_id;

  INSERT INTO round_rule_versions (game_id, version, fee_rate_bps, banker_pool_limit, rules)
  VALUES (
    v_game_id,
    '12-niuniu-v1',
    500,
    0,
    '{
      "specialHands": ["豹子", "满牛", "反顺", "顺子", "对子", "金牛"],
      "ordering": ["豹子", "满牛", "反顺", "顺子", "对子", "金牛", "普通"],
      "claimTimeoutSeconds": 45,
      "multipliers": {"豹子": 17, "满牛": 15, "反顺": 14, "顺子": 13, "对子": 12, "金牛": 11, "普通点数": 1},
      "points": "INTERNAL_POINTS"
    }'::jsonb
  )
  ON CONFLICT (game_id, version) DO UPDATE
    SET fee_rate_bps = EXCLUDED.fee_rate_bps,
        banker_pool_limit = EXCLUDED.banker_pool_limit,
        rules = EXCLUDED.rules
  RETURNING id INTO v_rule_id;

  SELECT id INTO v_room_id
  FROM game_rooms
  WHERE game_id = v_game_id AND name = '十二牛牛聊天室'
  ORDER BY created_at, id
  LIMIT 1;

  IF v_room_id IS NULL THEN
    INSERT INTO game_rooms (game_id, name, status)
    VALUES (v_game_id, '十二牛牛聊天室', 'OPEN')
    RETURNING id INTO v_room_id;
  ELSE
    UPDATE game_rooms SET status = 'OPEN' WHERE id = v_room_id;
  END IF;

  SELECT r.id, r.state
  INTO v_round_id, v_round_state
  FROM game_rooms gr
  LEFT JOIN rounds r ON r.id = gr.active_round_id
  WHERE gr.id = v_room_id
  FOR UPDATE OF gr;

  IF v_round_id IS NULL OR v_round_state IN ('ROUND_COMPLETE', 'ROUND_CANCELLED', 'REFUNDED') THEN
    INSERT INTO rounds (room_id, rule_version_id, state, state_ends_at)
    VALUES (v_room_id, v_rule_id, 'BANKER_BIDDING', now() + interval '30 seconds')
    RETURNING id INTO v_round_id;

    UPDATE game_rooms SET active_round_id = v_round_id WHERE id = v_room_id;

    INSERT INTO round_events (round_id, from_state, to_state, payload, actor)
    VALUES (v_round_id, NULL, 'BANKER_BIDDING', '{"automated":true,"source":"production-bootstrap"}'::jsonb, 'system:production-bootstrap');
  END IF;

  INSERT INTO wallet_accounts (user_id, account_type, balance)
  SELECT NULL, pool.account_type, pool.balance
  FROM (VALUES
    ('BANKER_POOL', 0::numeric),
    ('PLATFORM_FEE', 0::numeric),
    ('CAMPAIGN_REWARD_RESERVE', 0::numeric),
    ('PENDING_ADJUSTMENT', 0::numeric)
  ) AS pool(account_type, balance)
  WHERE NOT EXISTS (
    SELECT 1 FROM wallet_accounts existing
    WHERE existing.user_id IS NULL AND existing.account_type = pool.account_type
  );

  INSERT INTO room_messages (room_id, round_id, message_type, visibility, template_key, body, payload)
  SELECT v_room_id, v_round_id, 'ROUND', 'PUBLIC_ROOM', 'game.round.started',
    '🟢 新一局已开启，聊天室发送整数庄金开始抢庄。',
    jsonb_build_object('roundId', v_round_id, 'state', 'BANKER_BIDDING', 'automated', true, 'stageKey', 'BANKER_BIDDING')
  WHERE NOT EXISTS (
    SELECT 1 FROM room_messages WHERE round_id = v_round_id AND template_key = 'game.round.started'
  );

  INSERT INTO room_messages (room_id, round_id, message_type, visibility, template_key, body, payload)
  SELECT v_room_id, v_round_id, 'ROUND', 'PUBLIC_ROOM', 'game.banker.instructions',
    '📌 抢庄阶段：请直接发送整数庄金。系统按收到时间与庄金规则确定庄家。',
    jsonb_build_object('roundId', v_round_id, 'state', 'BANKER_BIDDING', 'automated', true)
  WHERE NOT EXISTS (
    SELECT 1 FROM room_messages WHERE round_id = v_round_id AND template_key = 'game.banker.instructions'
  );
END $$;
