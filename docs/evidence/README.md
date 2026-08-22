# Gate 证据目录

这里仅保存脱敏的验收证据，不保存任何 token、密码、数据库连接串、webhook secret、完整 `initData` 或 TNG 账号。

真实 Gate A/B 完成后，至少应提供：

- `telegram-getme.json`：仅保留 Bot username/id 的非敏感字段。
- `telegram-webhook.json`：保留 URL 是否匹配、pending update 数量和错误状态；删除 token/secret。
- `telegram-start.png`：Telegram 私聊 `/start` 打开 Mini App 的截图。
- `telegram-miniapp-user.png`：Mini App 内显示当前 Telegram 用户已通过服务端签名校验的截图，不显示敏感凭据。
- `database-smoke.json`：仅保留迁移版本、用户/房间/轮次存在性和健康状态，不保留连接信息。
- `worker-heartbeat.json`：仅保留 Worker 状态、时间和版本。

当前尚无真实 Gate A/B 证据；请不要用 Demo 截图替代。
