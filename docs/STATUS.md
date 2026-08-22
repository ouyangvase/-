# Project 12 状态

更新时间：2026-08-23

## 当前分支

- 分支：`goal/telegram-internal-chat-game`
- 最新本地提交：`4f79f22`
- 最新公开 Preview：`https://project-12-demo-staging-public-lfjs6t7oh-tomupros-projects.vercel.app`
- 产品形态：Telegram Mini App，手机优先；游戏发生在 Mini App 内部聊天室
- 真实现金、TNG 充值、提现和现金奖励：关闭

## 已验证

- `/chat` 是聊天 Inbox，而不是营销页或 Dashboard。
- `/chat/:roomId` 使用固定房间头部、置顶栏、真实滚动消息区、头像、玩家气泡、系统消息、阶段提示、红包消息、成绩榜、庄家总结、未读数、历史分页、断线重连和文字 Composer。
- 抢庄、下注、`sh` 梭哈、停止下注、庄家任意文字确认发包、领取和继续/结束均由聊天室文字指令触发；没有下注控制面板或独立下注按钮。
- 参与者专属红包由服务端权限过滤；旁观者不能读取领取入口，也不能调用领取接口。
- `pnpm typecheck`、`pnpm test`、聊天室 Playwright 测试和 `pnpm build` 已通过。
- 最新公开 Preview 的 `/api/health` 可访问，当前明确报告为 `mode: demo`、`database: disabled`、`bot: blocked`，没有把 Demo 误报为生产。

## 尚未达到生产 Gate A/B 的事项

- Telegram Bot token、BotFather Main Mini App/Menu Button/commands/webhook 尚未以生产凭据配置。
- Supabase/Postgres `DATABASE_URL`、`DIRECT_URL`、服务端 Supabase secret、JWT secret 尚未配置到部署环境。
- 持续运行的 Worker 尚未提供健康 heartbeat，因此不能宣称审核通知、自动领取和超时结算已在线。
- 因上述外部凭据缺失，尚无真实 Telegram `/start -> Mini App -> signed initData -> Supabase user` 证据；证据目录只接受脱敏 JSON/截图。

## 下一验收顺序

1. 配置并验证 Telegram Bot 与 webhook。
2. 应用 `infra/schema.sql` 及全部有序 migrations，不 reset/drop/truncate。
3. 启动 Worker，确认 heartbeat、outbox、审核通知和 round advancement。
4. 关闭 mock，运行 `pnpm staging:preflight`，再做真实 Telegram、双身份聊天室和权限验收。
