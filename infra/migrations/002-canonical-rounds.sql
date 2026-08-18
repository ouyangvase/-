-- Forward-compatible upgrade for databases created by the first demo baseline.
ALTER TABLE users ADD COLUMN IF NOT EXISTS internal_uid text;
UPDATE users SET internal_uid = 'P12-' || upper(substr(replace(id::text, '-', ''), 1, 12)) WHERE internal_uid IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_internal_uid_key ON users(internal_uid);

ALTER TABLE device_bindings ADD COLUMN IF NOT EXISTS device_public_key text;
UPDATE device_bindings SET device_public_key = COALESCE(device_public_key, 'legacy:' || device_fingerprint_hash) WHERE device_public_key IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS device_bindings_public_key_key ON device_bindings(device_public_key);

ALTER TABLE rounds DROP CONSTRAINT IF EXISTS rounds_state_check;
UPDATE rounds SET state = 'LOBBY' WHERE state = 'DRAFT';
UPDATE rounds SET state = 'BETTING' WHERE state = 'BANKER_CONFIRMED';
UPDATE rounds SET state = 'EVALUATING' WHERE state = 'RESOLVING';
UPDATE rounds SET state = 'ROUND_COMPLETE' WHERE state = 'SETTLED';
UPDATE rounds SET state = 'ROUND_CANCELLED' WHERE state = 'CANCELLED';
ALTER TABLE rounds ADD CONSTRAINT rounds_state_check CHECK (state IN ('LOBBY', 'BANKER_BIDDING', 'BETTING', 'PACKET_SENT', 'CLAIMING', 'EVALUATING', 'SETTLING', 'ROUND_COMPLETE', 'ROUND_CANCELLED', 'REFUNDING', 'REFUNDED', 'DISPUTED'));

ALTER TABLE wallet_accounts DROP CONSTRAINT IF EXISTS wallet_accounts_account_type_check;
ALTER TABLE wallet_accounts ADD CONSTRAINT wallet_accounts_account_type_check CHECK (account_type IN ('USER_AVAILABLE', 'USER_LOCKED', 'USER_LOCKED_BANKER_POOL', 'BANKER_POOL', 'PLATFORM_FEE', 'DEMO_GRANTS', 'CAMPAIGN_REWARD_RESERVE', 'PENDING_ADJUSTMENT'));
ALTER TABLE ledger_journals ADD COLUMN IF NOT EXISTS provider_reference text;
CREATE UNIQUE INDEX IF NOT EXISTS ledger_journals_provider_reference_key ON ledger_journals(provider_reference) WHERE provider_reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS campaign_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_version_id uuid NOT NULL REFERENCES campaign_versions(id), rule_key text NOT NULL, rule_value jsonb NOT NULL,
  UNIQUE(campaign_version_id, rule_key)
);
CREATE TABLE IF NOT EXISTS campaign_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_version_id uuid NOT NULL REFERENCES campaign_versions(id), reward_key text NOT NULL, reward_points bigint NOT NULL CHECK (reward_points >= 0),
  UNIQUE(campaign_version_id, reward_key)
);
