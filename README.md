# My Poker App

一个基于 Vite + React + Firebase 的多人德州扑克房间应用。当前支持公开/私密房间、匿名登录、实时房间同步、移动端/桌面端牌桌、下注流程、全下亮牌、分池结算、房间保留、最近房间、结构化牌局历史、暂停恢复、AI 玩家和浏览器 smoke 测试。

## 快速开始

```powershell
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

`.env` 需要配置 Firebase Web App 变量：

```text
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

提交或部署前至少运行：

```powershell
npm run lint
npm run test:logic
npm run build
```

涉及个人历史或 AI 调度时建议额外运行：

```powershell
npm run smoke:personal-history
npm run smoke:room-personal-history
npm run smoke:ai-single-action
```

## 目录结构

```text
src/App.jsx                         登录、房间创建/加入、房间订阅
src/components/Lobby.jsx            大厅与房间入口
src/components/PokerGame.jsx        对局控制器和 Firestore 写入协调
src/components/poker/               牌桌展示组件
src/hooks/                          计时器、过场、摊牌、AI 调度、房间维护等生命周期逻辑
src/services/roomRepository.js      Firestore 房间读写入口
src/services/roomLifecycleActions.js 房间删除、索引清理和个人历史关闭动作
src/utils/gameFlow.js               牌局流程、下注、过场、分池等纯规则
src/utils/pokerGameEngine.js        动作提交、推进、防重复提交辅助
src/utils/pokerAi.jsx               AI 策略与牌力估算
src/utils/roomLifecycle.js          房间保留、公开索引和最近房间数据规则
src/utils/pokerRoomSchema.js        Firestore 房间数据内存规范化
src/styles/                         响应式样式维护说明与移动端覆盖规则
scripts/logic-tests.mjs             纯逻辑回归测试
scripts/smoke/                      Playwright 浏览器 smoke 测试
```

## 维护原则

- 规则优先放在 `src/utils/*`，保持可测试。
- React 生命周期副作用优先放在 `src/hooks/*`，避免继续扩大 `PokerGame.jsx`。
- 展示组件放在 `src/components/poker/*`，尽量只接收 props，不直接访问 Firebase。
- Firestore 访问集中在 `src/services/roomRepository.js`。
- 个人历史、公开索引和房间删除这类跨文档动作优先复用 `src/services/roomLifecycleActions.js`。
- 房间数据进入 UI 前经过 `normalizePokerRoom`，减少旧字段/缺字段导致的散落判断。
- 筹码金额必须走 `CHIP_UNIT = 10` 的单位约束。
- 修改移动端布局后运行 `smoke:transition`、`smoke:multiway-layout` 或 `smoke:mobile-opponents`。

## 部署

Vercel 使用：

```text
buildCommand: npm run build
outputDirectory: dist
framework: vite
```

Vercel 环境变量需要与本地 `.env` 中的 `VITE_FIREBASE_*` 一致。部署前确认 lint、逻辑测试和构建通过。

更多说明见：

- [架构文档](docs/ARCHITECTURE.md)
- [房间生命周期](docs/ROOM_LIFECYCLE.md)
- [测试文档](docs/TESTING.md)
- [部署流程](docs/DEPLOYMENT.md)
- [浏览器 smoke 说明](scripts/smoke/README.md)
