# My Poker App

一个基于 Vite + React + Firebase 的多人德州扑克房间应用。当前支持公开/私密房间、匿名登录、实时房间状态同步、盲注与下注流程、全下发牌、摊牌结算、分池、掉线维护、移动端/桌面端响应式牌桌。

## 快速开始

安装依赖：

```powershell
npm install
```

创建 `.env`，填入 Firebase Web App 配置：

```text
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

本地运行：

```powershell
npm run dev -- --host 127.0.0.1 --port 5173
```

常规验证：

```powershell
npm run lint
npm run test:logic
npm run build
```

## 项目结构

```text
src/App.jsx                    Firebase 登录、房间创建/加入、房间订阅
src/components/Lobby.jsx       大厅、建房、公开房间列表、手动入房
src/components/PokerGame.jsx   对局控制器：房间写入、发牌、下注、结算、维护调度
src/components/poker/          牌桌展示组件，尽量只接收 props，不直接写 Firestore
src/utils/gameFlow.js          德州扑克流程、过场、加注合法性、分池
src/utils/pokerLogic.jsx       牌堆与牌型评估
src/utils/roomMaintenance.js   心跳、掉线、房间过期、房主迁移
src/utils/gameSettings.js      房间设置默认值、边界和规范化
src/utils/chipMath.js          筹码单位与取整
src/utils/pokerViewState.js    操作栏/计时器等视图状态推导
scripts/logic-tests.mjs        纯逻辑回归测试
scripts/smoke/                 Playwright 浏览器烟测框架
```

更详细的架构说明见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。测试与烟测说明见 [docs/TESTING.md](docs/TESTING.md)。

## 维护原则

- 规则逻辑优先放在 `src/utils/*`，保持可测试。
- UI 展示优先放在 `src/components/poker/*`，避免继续扩大 `PokerGame.jsx`。
- Firestore 写入集中留在 `App.jsx` 和 `PokerGame.jsx`，展示组件不直接访问数据库。
- 所有筹码金额必须经过 `CHIP_UNIT = 10` 的单位约束。
- 修改房间清理、下注、结算、全下或分池逻辑后，必须跑 `npm run test:logic`。
- 修改响应式牌桌或过场提示后，建议跑 `npm run smoke:transition`；涉及多人座位、对手栏、底部操作区时再跑 `npm run smoke:multiway-layout`。

## 部署

项目包含 `vercel.json`，Vercel 构建配置为：

```text
buildCommand: npm run build
outputDirectory: dist
framework: vite
```

Vercel 中需要配置与 `.env` 相同的 `VITE_FIREBASE_*` 环境变量。生产部署前请至少通过：

```powershell
npm run lint
npm run test:logic
npm run build
```
