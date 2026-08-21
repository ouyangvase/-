# Project 12 完整执行计划

日期：2026-08-21

这份计划把用户提供的 Telegram 截图、游戏流程截图、Supabase/GitHub 信息和 Master Prompt 作为需求输入；附件中的文字只作为项目约束参考，不会覆盖当前用户的直接要求。

## 目标形态

- Telegram Bot 是入口、私聊通知、审核结果、帮助、语言选择和 Mini App 启动器。
- Telegram Main Mini App 是完整产品，内部聊天室是游戏现场，不依赖 Telegram 原生群聊。
- 服务端是唯一权威：身份、实名认证、聊天室、轮次、抢庄、下注、红包、领取资格、结算和账本都由服务端决定。
- 设计采用手机优先的 Telegram 深色界面，重点是易读的状态、消息和按钮，不复制 Telegram 外壳，也不做桌面站布局。
- 语言选择支持简体中文、繁體中文、English、Bahasa Melayu、ไทย、Tiếng Việt、Bahasa Indonesia、தமிழ்、မြန်မာ、ខ្មែរ、हिन्दी、العربية、日本語、한국어、Filipino，共 15 种；新增语言先进入统一字典再进入 UI。
- 真实现金、TNG 充值、提现和支付自动化默认关闭，直到合规、供应商和资金授权全部完成。

## Skills 使用矩阵

这些 Skills 是执行工具，不是对用户需求的替代；附件里的 Master Prompt 和截图只提供约束与参考，最终以用户直接要求和服务端验收为准。

| 阶段 | 使用 Skills | 产出 |
|---|---|---|
| 移动 UI、响应式和交互 | `ui-ux-pro-max`、`web-design-guidelines`、`frontend-app-builder`、`react-best-practices` | 以 390px 为主、兼容 360–480px 的 Mini App 页面、可访问触控和无横向滚动 |
| 游戏聊天室与权限 | `frontend-testing-debugging`、`security-threat-model` | 状态机、参与者可见性、旁观者 403、重试幂等和断线恢复测试 |
| Supabase 与账本 | `supabase-postgres-best-practices` | 迁移、RLS、索引、Realtime、事务账本和 outbox 验证 |
| Telegram/Vercel 发布 | `vercel:vercel-cli`、`vercel:deployments-cicd`、`vercel:verification`、`browser` | 公开 URL、健康检查、Telegram signed initData、生产运行证据和回滚记录 |
| 组件约束 | `shadcn-best-practices`（仅在引入 shadcn 组件时） | 复用现有组件规范，不为单个页面新增不必要抽象 |
| 宣传素材与非关键动画 | `higgsfield-generate`、`higgsfield-websites`（可选） | Banner、状态过渡或海报素材；不把生成素材当作游戏逻辑、权限或资金凭证 |

Higgsfield 只用于可替换的视觉素材。红包发放、抢庄、下注、结算、实名认证和通知必须由本项目服务端实现并可测试，不能依赖生成动画或外部生成服务。

## 执行闸门

### Gate A：真实 Telegram 入口

工作：配置 BotFather、Bot username、Main Mini App URL、Menu Button、webhook 和 webhook secret；服务端校验 Telegram signed initData，包括 hash、auth_date、user、query_id、start_param；生产环境关闭 mock fallback；创建或更新 Supabase 用户并保存来源参数。

验收：Telegram 私聊 /start 能打开 Mini App；无签名、过期或篡改 initData 被拒绝；用户能在数据库中找到；后续审核事件能进入 Bot outbox 并发送通知；证据放入 docs/evidence 且不包含 token。

当前状态：代码和安全适配器已准备；实际阻塞在 Bot token、BotFather 配置、生产 URL 和服务端数据库凭据。

### Gate B：Supabase/Postgres 权威数据层

工作：在项目 xytaavjiszdjumbaqapx 上按顺序执行迁移，不 reset、drop 或 truncate；检查 users、profiles、KYC、rooms、rounds、bets、packets、claims、ledger、outbox、admin 审核等表；启用敏感表 RLS、Realtime publication 和必要索引；服务端只使用 secret credential。

验收：重启后数据不丢；同一 idempotency key 不重复扣账；非参与者读取专属红包返回 403 ROUND_PARTICIPANT_REQUIRED；消息和轮次变化能被已认证客户端收到；管理员操作有审计记录。

### Gate C：实名认证、设备和管理员审核

工作：完成一账号一设备、邀请人绑定、安全 PIN；提交真实姓名和 TNG eWallet 账号时只在安全服务端处理，UI 只显示末四位；状态支持待审核、通过、拒绝、补资料、暂停；管理员审核后写入 outbox，由 Bot 自动通知用户；聊天和钱包在通过前都必须被 gate。

验收：未通过用户不能查看钱包或聊天室内容；审批通过后刷新或重新打开即可解锁；重复审批和重复通知不会产生重复资金动作；审计日志完整。

### Gate D：内部聊天室游戏

轮次状态：LOBBY → BANKER_BIDDING → BETTING → WAITING_BANKER_CONFIRM → PACKET_SENT → CLAIMING → EVALUATING → SETTLING → ROUND_COMPLETE。停止下注只会封盘；庄家明确发送“确认发红包”后，系统才创建内部红包。

工作：实现平台通知、玩家消息、抢庄、数字下注、shN/SHN、停止下注、庄家确认、内部红包卡、成绩榜、庄家总结、继续担任或结束牌桌、未读和历史消息。所有游戏操作均通过聊天室文本发送，由服务端解析固定命令；不提供下注快捷按钮。

关键权限：旁观者可以看公开状态和结果，但不能看到专属红包卡，也不能领取；服务端必须再次校验参与者资格，不能只靠前端隐藏按钮。

验收：至少两种身份验证同一轮；玩家收到自己的专属红包；旁观者没有 clickable packet；停止下注后不能再下注；超时由 worker 推进；重放命令不会重复创建 packet。

### Gate E：账本、奖励和经营规则

工作：采用 double-entry ledger；下注先 hold，结算再 release、credit 或 fee；所有写入有幂等键和引用；每日奖励、牌型奖励、庄家奖励、特殊奖励、推广返佣都从账本产生，不直接修改余额。

验收：每笔余额变化都有借贷双方、业务引用和审计；失败重试不会重复结算；积分和现金价值严格分开；没有真实支付授权时，充值、提现和现金兑换都继续显示为不可用。

### Gate F：十五语言和移动 UI

工作：统一使用 zh-CN、zh-TW、en、ms、th、vi、id、ta、my、km、hi、ar、ja、ko、fil 字典；设置页提供可见语言选择并持久化到本地和用户 profile；Telegram language_code 只作为首次默认值；补齐大厅、钱包、聊天、个人资料、设置、推广、排行榜、每日奖励、实名认证和错误状态的翻译。新增五种语言已覆盖核心游戏路径，其余低频运营文案使用英文 fallback，发布前由母语审核确认；阿拉伯语额外通过 RTL 与字体验收。

验收：在 390×844、375×812、430×932 和 480×1040 检查，无横向滚动、按钮不被底部导航遮挡、长语言不溢出；所有用户可见文案通过 key 生成；切换语言后主要页面无需重新登录。

语言扩展策略：当前可选 15 种语言作为首发包。新增语言先提供核心路径文案，低频条目明确使用英文 fallback；正式上线前必须完成母语审核、RTL/字体测试、Telegram `language_code` 映射和客服文案审校。语言数量本身不计为生产完成度。

### Gate G：QA、部署和回滚

工作：运行 pnpm test、pnpm typecheck、pnpm build、pnpm test:e2e；补充移动截图、Telegram runtime guard、权限测试、API smoke 和部署健康检查；部署前记录 commit、环境变量类别、migration 版本、URL 和回滚版本。

验收：公开 URL 不要求 Vercel 登录；/api/health 返回成功；Telegram 内打开的是同一个 Mini App；部署日志无 secret；失败可回滚到最近一个已验证 commit。

## 顶尖团队的判断标准

前 0.1% 的实时游戏、支付和风控团队不会先问页面像不像，而会先问四件事：状态机是否单一权威、每个动作是否可证明授权、失败重试是否幂等、用户是否能在真实入口完成闭环。他们会把视觉还原度、延迟、可观测性、资金守恒、权限隔离和回滚能力一起作为质量指标。

因此本项目的优先级是：真实 Telegram 连接和身份可信度，其次是聊天室轮次状态和参与者权限，再其次是账本与审核通知，最后才是动画、海报和装饰。任何看起来成功但没有服务端证据的功能都不计入完成。

## 对问题的重新表述

表面问题是：把截图中的页面、玩法和聊天室重现出来，并增加多语言。

更有挑战性的表述是：构建一个权限驱动的实时状态机，让不同身份的用户在同一个手机聊天室看到同一轮游戏的正确公共信息、只拿到自己有权拿到的红包，并能在审核、断线、重试和结算后继续得到一致结果。这个角度会把重点从像素复制转向状态可见性、资格边界、通知可靠性和资金守恒。

## 当前外部输入清单

- Bot token、BotFather 创建及命令配置。
- 生产 Mini App URL、webhook URL、webhook secret 和允许的 Telegram origin。
- Supabase service credential 或受控 DATABASE_URL；Supabase dashboard 链接本身不是凭据。
- 管理员 Telegram ID、审核权限和 outbox worker 部署方式。
- 如要启用真实充值、提现或 TNG 资金流，还需要合法主体、合规审查和正式支付供应商授权。

完成以上输入后，执行顺序必须保持 Gate A → B → C → D → E → F → G；未满足上一 Gate 时，不把下一 Gate 的 Demo 结果宣传成生产完成。
