CREATE TABLE IF NOT EXISTS round_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'PLAYER' CHECK (role IN ('PLAYER', 'BANKER')),
  bet_amount numeric(20,2) NOT NULL DEFAULT 0,
  packet_value numeric(20,2) NOT NULL DEFAULT 0,
  hand_type text NOT NULL,
  hand_points int NOT NULL CHECK (hand_points BETWEEN 0 AND 10),
  cards jsonb NOT NULL DEFAULT '[]'::jsonb,
  outcome text CHECK (outcome IN ('WIN', 'LOSE', 'TIE', 'WATERED')),
  multiplier numeric(20,4) NOT NULL DEFAULT 0,
  gross_reward numeric(20,2) NOT NULL DEFAULT 0,
  fee numeric(20,2) NOT NULL DEFAULT 0,
  net_reward numeric(20,2) NOT NULL DEFAULT 0,
  banker_pool_before numeric(20,2) NOT NULL DEFAULT 0,
  banker_pool_after numeric(20,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(round_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_round_results_round ON round_results(round_id, created_at);
