# Testing

## Test Levels

本项目现在保留两层测试：

1. 纯逻辑测试：快、稳定、应作为每次提交前的必跑项。
2. 浏览器烟测：需要本地 dev server 和 Playwright，用来验证真实多人房间与响应式布局。

## Logic Tests

运行：

```powershell
npm run test:logic
```

覆盖范围：

- 房间设置规范化
- 筹码单位取整
- 房间心跳、掉线、过期清理
- 过场时间与进度
- 加注合法性、非线性滑条
- 全下亮牌和自动推进
- 分池与 odd chip 分配
- 牌堆与牌型评估
- 动作栏视图状态推导

逻辑测试入口：

```text
scripts/logic-tests.mjs
```

## Browser Smoke Tests

烟测脚本位于：

```text
scripts/smoke/
```

公共能力放在：

```text
scripts/smoke/poker-smoke-harness.mjs
```

它包含：

- 启动浏览器
- 创建房间
- 加入房间
- 点击可用动作按钮
- 推进到翻牌过场
- 读取元素矩形
- 写入 JSON 与截图结果

### 前置条件

先启动本地服务：

```powershell
npm run dev -- --host 127.0.0.1 --port 5173
```

Playwright 可以作为 dev dependency 安装，也可以使用 Codex 桌面环境的 bundled runtime：

```powershell
$env:NODE_PATH='C:\Users\26808\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
```

默认使用系统 Edge：

```text
C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe
```

如需覆盖：

```powershell
$env:SMOKE_BROWSER_PATH='C:\Path\To\msedge.exe'
```

### 快速多人房间烟测

```powershell
npm run smoke:quick
```

验证：

- 桌面端 host 可创建房间
- 移动端 guest 可加入房间
- 双方动作栏存在

输出默认写到：

```text
D:\codexroot\poker-quick-room-smoke.json
D:\codexroot\poker-quick-room-host.png
D:\codexroot\poker-quick-room-guest.png
```

### 过场与响应式布局烟测

```powershell
npm run smoke:transition
```

验证：

- 竖屏 `390x844` 和横屏 `844x390`
- 等待开局按钮不被底部个人面板挡住
- 翻牌过场提示框不挡公共牌、对手框、奖池
- 无横向溢出

输出默认写到：

```text
D:\codexroot\poker-transition-layout-smoke.json
D:\codexroot\poker-transition-portrait.png
D:\codexroot\poker-transition-landscape.png
```

### Raise Slider Smoke

```powershell
npm run smoke:raise-slider
```

Checks:
- A live two-player hand automatically finds the player who can currently raise.
- The number input shows this action's additional chips instead of the total committed bet.
- The input step is `10`, and a dragged slider result remains a multiple of `10`.
- The slider fill follows the snapped chip step.

Default outputs:

```text
D:\codexroot\poker-raise-slider-smoke.json
D:\codexroot\poker-raise-slider-smoke.png
```

### Multiway Layout Smoke

```powershell
npm run smoke:multiway-layout
```

Checks one live 4-player room across four simultaneous viewport roles:

- Desktop `1366x900`
- Square `900x900`
- Mobile portrait `390x844`
- Mobile landscape `844x390`

The script verifies that every player sees three opponents, drives the hand to flop and turn transitions, and fails on hard overlaps among the action dock, self panel, pot, phase pill, timer, transition banner, community cards, and visible opponent cards. It also checks for horizontal page overflow, clipped fixed elements, text fit issues, and non-horizontal action bubbles.

Default outputs:

```text
D:\codexroot\poker-multiway-layout-smoke.json
D:\codexroot\poker-multiway-*-waiting.png
D:\codexroot\poker-multiway-*-flop-transition.png
D:\codexroot\poker-multiway-*-turn-transition.png
```

## Recommended Pre-Deploy Check

```powershell
npm run lint
npm run test:logic
npm run build
```

如果改了牌桌布局或移动端样式，再追加：

```powershell
$env:NODE_PATH='C:\Users\26808\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
npm run smoke:transition
npm run smoke:multiway-layout
```

If raise, all-in, or slider interactions changed, also run:

```powershell
npm run smoke:raise-slider
```
