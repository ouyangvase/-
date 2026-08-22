# Project 12 已知限制

- 公开 Preview 当前是 Demo 模式，尚未连接生产 Supabase/Postgres 或真实 Telegram Bot。
- Bot token、webhook secret、数据库连接串、Supabase service credential 和 `SUPABASE_JWT_SECRET` 只能由部署者注入 secret manager；本仓库不记录也不输出这些值。
- 审核通过后的 Bot 私聊通知依赖 Worker 消费 `outbox_events`；Worker 未上线前不能视为自动通知已完成。
- Mini App 的 Realtime 连接需要 Supabase URL、anon key、服务端签发的用户 JWT 和 `014-private-realtime-chat.sql` 权限策略；未配置时使用权限过滤的 SSE fallback。
- 真实充值、提现、TNG eWallet 自动支付和现金奖励被明确禁用。任何开启都需要额外的合规、供应商和资金授权审查。
- 证据文件必须脱敏：不得提交 Bot token、数据库 URL、webhook secret、完整 Telegram `initData` 或 TNG 账号。
