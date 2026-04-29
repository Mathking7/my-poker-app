# Architecture

## Runtime Flow

1. `src/App.jsx` 初始化 Firebase、匿名登录、创建/加入房间，并订阅当前房间文档。
2. `src/components/Lobby.jsx` 处理大厅 UI，包括公开/私密房间创建、公开房间浏览和手动加入。
3. `src/components/PokerGame.jsx` 是对局控制器，负责会改变房间状态的动作：开始手牌、弃牌、跟注、加注、过场推进、摊牌结算、房主操作、玩家离开、掉线维护。
4. `src/components/poker/*` 负责展示牌桌、对手、自身面板、动作栏、过场提示和日志抽屉。
5. `src/utils/*` 放可复用、可测试的纯逻辑。

Firestore 房间路径：

```text
artifacts/{globalAppId}/public/data/rooms/{roomId}
```

`globalAppId` 定义在 `src/firebase.js`。

## Core Boundaries

### Firestore Boundary

Firestore 写入应集中在：

- `src/App.jsx`
- `src/components/PokerGame.jsx`

展示组件不直接导入 `firebase`，也不直接调用 `setDoc` / `deleteDoc`。它们通过 props 接收状态和回调。

### Poker Rules Boundary

德州扑克规则相关逻辑优先进入：

- `src/utils/gameFlow.js`
- `src/utils/pokerLogic.jsx`
- `src/utils/chipMath.js`

这些文件应保持无 React 依赖，方便 `scripts/logic-tests.mjs` 直接测试。

### View-State Boundary

非规则、但会被多个组件共享的界面推导进入：

- `src/utils/pokerUi.js`
- `src/utils/pokerViewState.js`

例如动作栏显示文案、当前计时器是否危险、按钮是否可用等。

## Component Layout

`src/components/poker/` 中的组件职责：

- `PokerHeader.jsx`: 顶部房号、盲注、暂停、设置、退出。
- `JoinRequestsBar.jsx`: 私密房间加入申请。
- `TransitionBanner.jsx`: 轮次/发牌/结算过场提示。
- `OpponentCard.jsx`: 对手头像、手牌、下注气泡、胜利气泡。
- `TableCenter.jsx`: 当前轮次、奖池、公共牌、分池结算面板。
- `SelfPlayerPanel.jsx`: 自己的手牌、码量、坐下/观战、自身下注/获胜显示。
- `ActionDock.jsx`: 永远可见的弃牌/看牌/跟注/加注动作区。
- `GameLogDrawer.jsx`: 侧滑对局日志。

新增 UI 时优先落在这个目录下；只有需要写房间状态的逻辑才放回 `PokerGame.jsx`。

## Room Maintenance

浏览器没有可靠的 Firestore `onDisconnect`。本项目使用心跳维护：

- 客户端约每 15 秒写入自己的 `lastSeenAt`。
- 玩家 45 秒无心跳会被视为 stale。
- 无活跃玩家的房间 3 分钟后过期。
- 活跃房间内由选举出的维护客户端标记掉线玩家、必要时自动弃牌，并迁移私密房间房主。

相关逻辑在 `src/utils/roomMaintenance.js`，回归测试在 `scripts/logic-tests.mjs`。

## Coding Guidelines

- 不要在展示组件里复制下注、分池、全下等规则。
- 不要绕过 `normalizeGameSettings` 保存房间设置。
- 不要绕过 `quantizeChipAmount` / `clampRaiseAmount` 写筹码金额。
- 修改移动端或横屏布局时，优先检查 `.poker-*` 语义类，而不是散落增加 Tailwind 覆盖。
- 大改前先备份，备份文件放在 `D:\codexroot` 或项目外部目录。
