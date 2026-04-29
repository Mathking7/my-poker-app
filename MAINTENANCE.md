# Project Maintenance Notes

## Current Safety Points

- Pre-maintenance Git branch: `backup/pre-maintenance-20260427-220646`
- Pre-maintenance source backup: `C:\Users\26808\my-poker-app-backups\pre-maintenance-20260427-220646.zip`
- The zip excludes `node_modules`, `.git`, and `dist`; those can be rebuilt from Git and `package-lock.json`.
- Do not commit `.env` or `.vercel`; both are intentionally ignored.

## What This App Does

This is a Vite + React poker room app backed by Firebase Anonymous Auth and Firestore.

- `src/App.jsx` signs users in anonymously, creates/joins rooms, listens to the active room document, and passes room state to the UI.
- `src/components/Lobby.jsx` renders the lobby, public/private room creation, room browsing, and manual room join.
- `src/components/PokerGame.jsx` contains room management and the Texas Hold'em game flow: blinds, turns, fold/call/raise, timeout handling, showdown, side-pot settlement, pause, sit out, kick, and chip edits.
- `src/utils/gameSettings.js` contains settings defaults, bounds, normalization, and room capacity constants.
- `src/utils/pokerLogic.jsx` contains deck creation and poker hand evaluation.
- `src/utils/roomMaintenance.js` contains player presence, stale-player detection, room expiration, and maintenance election.
- `src/components/CardUI.jsx` renders reusable card faces and backs.

Firestore room path:

```text
artifacts/{globalAppId}/public/data/rooms/{roomId}
```

`globalAppId` is currently `my-custom-poker-app`.

## Presence And Room Cleanup

Firestore does not provide a reliable browser `onDisconnect` hook. The app therefore uses client heartbeats instead of trusting `beforeunload`.

- Every active room client writes its own `lastSeenAt` about every 15 seconds.
- A player is considered stale after 45 seconds without a heartbeat.
- A room with no active players expires after 3 minutes.
- Lobby room browsing and the idle lobby sweep clean expired public and private rooms.
- Inside an active room, one elected maintenance client marks stale players offline, moves them to spectator mode, folds them if they were blocking an active hand, and transfers private-room host rights when the host goes stale.
- Legacy rooms without `lastSeenAt` are first marked with `presenceMigrationStartedAt`; they are deleted only after the grace period if no updated client heartbeats into them.

Key constants live in:

```text
src/utils/roomMaintenance.js
```

Pure maintenance checks can be run with:

```powershell
@'
import assert from 'node:assert/strict';
import {
  EMPTY_ROOM_TTL_MS,
  PLAYER_STALE_MS,
  applyRoomMaintenance,
  getActivePlayerCount,
  isRoomExpired,
  shouldMarkLegacyRoom,
  stampPlayerPresence,
} from './src/utils/roomMaintenance.js';

const now = 1_000_000;
assert.equal(shouldMarkLegacyRoom({ players: [{ uid: 'a' }] }), true);
assert.equal(isRoomExpired({ players: [{ uid: 'a' }] }, now), false);
assert.equal(isRoomExpired({ presenceMigrationStartedAt: now - EMPTY_ROOM_TTL_MS - 1, players: [{ uid: 'a' }] }, now), true);

const active = stampPlayerPresence({ uid: 'a', name: 'A' }, now);
const stale = stampPlayerPresence({ uid: 'b', name: 'B', isSittingOut: false, folded: false, allIn: false }, now - PLAYER_STALE_MS - 1);
assert.equal(getActivePlayerCount({ players: [active, stale] }, now), 1);

const result = applyRoomMaintenance({
  isPublic: false,
  hostUid: 'b',
  creatorUid: 'b',
  status: 'flop',
  logs: [],
  players: [active, stale],
}, now, 'a');

assert.equal(result.changed, true);
assert.equal(result.shouldAdvance, true);
assert.equal(result.room.hostUid, 'a');
console.log('roomMaintenance tests passed');
'@ | node --input-type=module
```

## Game Settings And Join Rules

Settings are normalized before room creation and before host saves:

- Initial chips are clamped to `100..100000`.
- Numeric thinking time is clamped to `5..300` seconds.
- `"无限"` is preserved as the no-timer option.
- Room capacity is capped at 9 players.
- If `allowJoinDuringGame` is false, new players cannot join or request private-room approval mid-hand.
- If joining mid-hand is allowed, the new player enters as a spectator for the current hand and is seated automatically next hand with `waitingNextHand`.

Important implementation files:

```text
src/utils/gameSettings.js
src/App.jsx
src/components/PokerGame.jsx
```

Quick settings and maintenance test:

```powershell
@'
import assert from 'node:assert/strict';
import { normalizeGameSettings, MIN_INITIAL_CHIPS, MAX_INITIAL_CHIPS, MIN_TIME_LIMIT, MAX_TIME_LIMIT } from './src/utils/gameSettings.js';
import {
  EMPTY_ROOM_TTL_MS,
  PLAYER_STALE_MS,
  applyRoomMaintenance,
  getActivePlayerCount,
  isRoomExpired,
  shouldMarkLegacyRoom,
  stampPlayerPresence,
} from './src/utils/roomMaintenance.js';

const unlimited = '\u65e0\u9650';
assert.deepEqual(normalizeGameSettings({ initialChips: -1, timeLimit: 1, allowJoinDuringGame: 1 }), {
  initialChips: MIN_INITIAL_CHIPS,
  timeLimit: MIN_TIME_LIMIT,
  allowJoinDuringGame: true,
  doubleBlinds: false,
  autoTopUp: false,
});
assert.equal(normalizeGameSettings({ initialChips: 999999 }).initialChips, MAX_INITIAL_CHIPS);
assert.equal(normalizeGameSettings({ timeLimit: 999999 }).timeLimit, MAX_TIME_LIMIT);
assert.equal(normalizeGameSettings({ timeLimit: unlimited }).timeLimit, unlimited);

const now = 1_000_000;
assert.equal(shouldMarkLegacyRoom({ players: [{ uid: 'a' }] }), true);
assert.equal(isRoomExpired({ players: [{ uid: 'a' }] }, now), false);
assert.equal(isRoomExpired({ presenceMigrationStartedAt: now - EMPTY_ROOM_TTL_MS - 1, players: [{ uid: 'a' }] }, now), true);
const active = stampPlayerPresence({ uid: 'a', name: 'A' }, now);
const stale = stampPlayerPresence({ uid: 'b', name: 'B', isSittingOut: false, folded: false, allIn: false }, now - PLAYER_STALE_MS - 1);
assert.equal(getActivePlayerCount({ players: [active, stale] }, now), 1);
const result = applyRoomMaintenance({ isPublic: false, hostUid: 'b', creatorUid: 'b', status: 'flop', logs: [], players: [active, stale] }, now, 'a');
assert.equal(result.changed, true);
assert.equal(result.shouldAdvance, true);
assert.equal(result.room.hostUid, 'a');
console.log('settings and room maintenance tests passed');
'@ | node --input-type=module
```

## Manual Multiplayer Smoke Test Result

On 2026-04-27, browser smoke tests completed successfully against the configured Firebase project:

- Desktop lobby viewport `1366x768`: no horizontal overflow, no console errors.
- Mobile lobby viewport `390x844`: no horizontal overflow, no console errors.
- Public two-player hand room `1862`: create, join, start, pre-flop, flop, turn, river, and showdown completed.
- Timed public room `4787`: 5-second timer displayed, counted down, auto-folded the timed-out player, and settled the hand.
- Private room `9938`: guest requested to join, host approved, guest entered the room.
- Public room `1020` with mid-hand joins disabled: third player was rejected with the expected error.
- Browser console had no runtime errors or Firestore conflict warnings after moving heartbeat writes to `presence.{uid}`.

Use fake player names such as `CodexA` and `CodexB` for these tests. Do not use real personal data. Test rooms are not manually deleted during automated checks; they should expire through the room cleanup mechanism unless the owner explicitly approves cloud deletion.

## Local Runbook

Install dependencies:

```powershell
npm install
```

Start the dev server:

```powershell
npm run dev -- --host 127.0.0.1 --port 5173
```

Open:

```text
http://127.0.0.1:5173
```

Quality checks:

```powershell
npm run test:logic
npm run lint
npm run build
```

## Animation And Round Pacing

Round transitions are synchronized through `roomData.transition`, not only local UI state. This prevents one player from seeing an action timer while another player is still watching cards deal.

Current timing lives in `src/utils/gameFlow.js`:

- New hand intro: `1200ms`
- Street transition base: `1150ms`
- Extra delay per newly dealt community card: `360ms`
- Showdown intro / pot split: `1800ms`
- Showdown reveal per player: `1800ms`
- Winner hold before next hand: `3800ms`

The intended feel is: short enough that repeated hands do not drag, long enough that players can see why the state changed. During a transition, action buttons and countdown timers are locked. If everyone is all-in, the maintenance manager advances streets one transition at a time instead of recursively jumping straight to showdown.

Settlement details are stored in `roomData.settlement.pots`, so split pots can be displayed explicitly instead of only changing chip totals.

Preview a production build:

```powershell
npm run preview -- --host 127.0.0.1 --port 4173
```

## Browser Smoke Test Used During Maintenance

The Codex workspace runtime includes Playwright packages, but the project does not depend on Playwright. This command uses installed Microsoft Edge through the bundled runtime:

```powershell
$env:NODE_PATH='C:\Users\26808\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
@'
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const messages = [];

  page.on('console', msg => messages.push(`${msg.type()}: ${msg.text()}`));
  page.on('pageerror', err => messages.push(`pageerror: ${err.message}`));

  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle', timeout: 30000 });
  await page.screenshot({ path: 'maintenance-smoke-home.png', fullPage: true });
  await page.locator('input[type="text"]').first().fill('Codex');
  await page.locator('button').nth(2).click();
  await page.screenshot({ path: 'maintenance-smoke-create-modal.png', fullPage: true });

  const text = await page.evaluate(() => document.body.innerText);
  await browser.close();

  console.log(JSON.stringify({ hasLobby: text.includes('棋牌游戏大厅'), messages }, null, 2));
})();
'@ | node
```

Note: clicking "确认创建并进入房间" writes a room document to Firebase, so only do that after intentionally starting a cloud-backed multiplayer test.

Latest animation smoke, 2026-04-28:

- Local room `3952`, two browser contexts, completed one full heads-up hand.
- Observed new-hand, flop, turn, river, showdown, and settlement/pot-split UI states.
- 8 actions completed; console errors/warnings: none.
- Mobile lobby viewport `390x844`: no horizontal overflow; console errors/warnings: none.

Latest fixed-action-dock smoke, 2026-04-28:

- Desktop local room `6422`: action controls fixed at the lower-right command dock; no viewport overflow; console errors/warnings: none.
- Mobile local room `2009`: expanded raise dock tested at `390x844` and `375x667`; no horizontal overflow or offscreen controls; console errors/warnings: none.
- In mobile raise-expanded state, the player info area compacts to name/chips/timer so the fixed action dock remains comfortable on short screens.

Latest always-on action-dock smoke, 2026-04-28:

- Desktop local room `3717`: both players see the same fixed action dock. Active player buttons/raise slider are enabled; inactive player buttons, presets, number input, and range input are disabled and dimmed.
- Mobile local room `3717`: inactive viewport `390x844` keeps the disabled Fold/Check/Raise dock visible; active viewport `390x844` and `375x667` keeps the expanded raise dock inside the viewport with no horizontal overflow or offscreen controls.
- Console errors/warnings: none. Screenshots were saved under `D:\codexroot\poker-action-dock-final-*.png`; structured smoke output was saved to `D:\codexroot\poker-action-dock-final-smoke.json`.

Always-on action dock notes:

- The dock is rendered whenever `myPlayerInfo` exists. `canTakeAction` controls the enabled state; non-turn states should say `等待中`, `等待`, `结算`, `过场中`, or `本手结束` rather than suggesting the user can act.
- The raise slider uses a 0-100 UI range. `0` maps to the minimum legal raise target, `68` maps to the pot-sized raise target, and `100` maps to all-in. This gives fine control around normal bet sizes while preserving fast access to large all-in ranges.
- Browser multiplayer smoke needs a short wait after the lobby loads because Firebase anonymous auth is asynchronous. In Playwright scripts, wait around 5 seconds after the first text input appears before creating/joining rooms.
- To run Playwright without adding it to the repo, use the bundled runtime:

```powershell
$env:NODE_PATH='C:\Users\26808\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
node --input-type=commonjs
```

Latest clock and bottom-layout smoke, 2026-04-28:

- Desktop local room `2955`: the personal bottom rail and action dock no longer overlap; the action dock begins to the right of the personal rail with a visible gap.
- Mobile local room `2955`: collapsed action dock and expanded raise dock were tested at `390x844` and `375x667`; self cards remain visible above the action dock, and measured panel overlap was `false`.
- The old centered self-panel timer was removed. A table-level `.poker-table-clock` now shows the current actor and time to every player; the action player also sees the compact timer inside the action dock.
- Urgent timer smoke used local room `9730` with a 10-second limit. Both `.poker-table-clock` and `.poker-action-status-timer` received `is-critical`, turning red and pulsing. Console errors/warnings: none.
- Screenshots were saved under `D:\codexroot\poker-clock-layout-*.png` and `D:\codexroot\poker-clock-critical-mobile.png`; structured output was saved to `D:\codexroot\poker-clock-layout-smoke.json`.

Latest responsive bottom-panel smoke, 2026-04-28:

- Local room `3881`, two browser contexts, unlimited action timer to keep the active dock stable during viewport switching.
- Tested `1920x900`, `1366x900`, `1101x800`, `1100x800`, `900x760`, `700x720`, `390x844`, and `375x667`, including collapsed and expanded raise states where relevant.
- Desktop/wide layout now treats the personal rail and action dock as a centered bottom cluster; measured horizontal gap was `24px` at `1920`, `1366`, and `1101` widths.
- `641px-1100px` uses the stacked bottom layout: the raise controls are hidden by default, the raise toggle stays visible, and expanded raise controls do not overlap the personal rail.
- Mobile vertical gaps measured `8px` to `13px`; no button escaped the action dock; no horizontal overflow; console errors/warnings: none.
- Screenshots were saved under `D:\codexroot\poker-bottom-final-*.png`; structured output was saved to `D:\codexroot\poker-bottom-final-smoke.json`.

Latest chip-unit update, 2026-04-28:

- All user-facing chip inputs use `CHIP_UNIT = 10`: room initial chips, room settings initial chips, admin top-up, and raise amount.
- Raise targets are clamped through `clampRaiseAmount`, so direct input, slider output, quick raise buttons, and submitted raise actions all snap to 10-chip increments.
- New hand setup floors legacy player stacks to 10-chip increments before blinds are posted; auto top-up and admin top-up are also quantized.
- Settlement floors legacy odd contributions/pots to the 10-chip unit before awards are calculated, preventing old 15/25-style data from reintroducing smaller units.
- Verification after this update:

```powershell
npm run lint
npm run test:logic
npm run build
```

Build passed with only the existing Vite chunk-size warning.

Latest settlement/all-in legality update, 2026-04-29:

- `advanceGameState` now treats an existing `settlement.id` as a completed settlement and returns without recalculating, so stray auto-advance calls cannot re-award chips or append another settlement log.
- Showdown reveal animation now keys off the hand/settlement identity and the reveal-order signature, not the whole `players` array. Presence updates and clearing `transition` no longer restart the same settlement animation.
- Added `getPlayerBettingOptions` as the shared raise-legality gate for UI and submitted actions.
- Raise controls are hidden/rejected when no opponent can call extra chips, when the player already acted and only faces a short all-in that did not reopen betting, or when the player has no chips beyond the call.
- Verification after this update:

```powershell
npm run lint
npm run test:logic
npm run build
```

Build passed with only the existing Vite chunk-size warning.

Latest strict Hold'em rules update, 2026-04-29:

- Reference rules checked: Poker TDA 2024 rules and Robert's Rules of Poker.
- Short blinds now keep the table's current bet at the full big blind target instead of lowering the price of entry to the short all-in blind. Players must still call the full blind unless they are also all-in short.
- All-in runout now reveals eligible live hands as soon as all betting action is complete, then automatically deals the remaining streets.
- Auto-advance after transitions now refuses to run if the lone remaining actionable player still has an uncalled bet to match, which prevents a short blind/all-in from skipping the required call/fold decision.
- Odd chips in split pots now follow button-game order: starting with the first tied winner clockwise left of the dealer button, then continuing clockwise for additional odd chip units.
- Verification after this update:

```powershell
npm run lint
npm run test:logic
npm run build
```

Build passed with only the existing Vite chunk-size warning.

Latest local acceptance check, 2026-04-29:

- Local dev server started with:

```powershell
npm run dev -- --host 127.0.0.1 --port 5173
```

- Acceptance URL: `http://127.0.0.1:5173/`
- Checks passed:
  - `npm run lint`
  - `npm run test:logic`
  - `npm run build`
- Browser smoke used headless Microsoft Edge against `http://127.0.0.1:5173/`.
- Smoke created temporary private room `3607`, verified custom initial chips `555` normalized to `560`, verified the action dock rendered, found no console warnings/errors, then exited the room to clean it up.

Latest responsive overlap fix, 2026-04-29:

- Fixed square viewport overlap by reserving vertical space under opponent cards for bet chips before the center pot area.
- Fixed portrait mobile clipping by adding top/bottom safe space to the horizontally scrolling opponent row; opponent status buttons/timers and bet chips now stay within the scroll area.
- Mobile self bet chip now participates in the self-card flex row instead of floating above the panel, so it cannot cover the fixed action controls.
- Added a dedicated mobile landscape layout for short screens: compact header, opponent rail, centered table, fixed self panel on the lower-left, and fixed action dock on the lower-right.
- Verification:

```powershell
npm run lint
npm run test:logic
npm run build
```

- Browser smoke used headless Microsoft Edge in local room `6587`, with viewports `900x900`, `390x844`, and `844x390`.
- Checked no overlap between pot/opponent bet and self bet/action dock, opponent bet and action dock inside viewport, and no horizontal overflow.
- Smoke output: `D:\codexroot\poker-layout-responsive-smoke.json`; screenshots: `D:\codexroot\poker-layout-square-900.png`, `D:\codexroot\poker-layout-portrait-390x844.png`, `D:\codexroot\poker-layout-landscape-844x390.png`.

Latest portrait transition/win-chip fix, 2026-04-29:

- Removed the mobile transition padding class from the table scroll area so phase/transition prompts no longer push the opponent row down and back up.
- Mobile transition prompts are now stable overlay toasts positioned over the table center instead of above opponent cards.
- Opponent win chips use `.poker-opponent-win` with separate mobile sizing and bottom spacing, so settlement winnings such as `+1280` are not clipped by the opponent row.
- Verification:

```powershell
npm run lint
npm run test:logic
npm run build
```

- Browser smoke used headless Microsoft Edge in local room `3957` at `390x844`.
- Measured opponent-card vertical movement during transition: `0px`.
- Verified transition banner does not overlap opponent card, injected opponent win chip stays in viewport, win chip does not overlap pot, no horizontal overflow, and no console warnings/errors.
- Smoke output: `D:\codexroot\poker-portrait-win-transition-fix.json`; screenshot: `D:\codexroot\poker-portrait-win-transition-fix.png`.

Latest transition/public-card overlap fix, 2026-04-29:

- Backup before this pass: `D:\codexroot\my-poker-app-backup-20260429-141948.zip`.
- Portrait mobile transition prompts are compact capsules positioned in the gap between the opponent row and the pot, instead of near the header or table center. This keeps the prompt off the community-card row during flop/turn/river transitions.
- Added a `poker-status-*` class on the game shell so waiting-state landscape tweaks can be scoped without changing live hand layout.
- Landscape waiting state now pins the start/waiting capsule near the top center, avoiding the fixed self panel and action dock. In-hand landscape transition prompts remain semi-transparent and compact; they were not moved because the current position avoids the community cards and pot.
- Verification:

```powershell
npm run lint
npm run test:logic
npm run build
```

- Portrait browser smoke used headless Microsoft Edge in local room `8926` at `390x844`; transition banner did not overlap community cards, opponent card, or pot, and no horizontal overflow was measured.
- Landscape browser smoke used headless Microsoft Edge in local room `4397` at `844x390`; the waiting start button did not overlap the fixed self panel, and the street-transition banner did not overlap community cards, opponent card, or pot.
- Smoke outputs: `D:\codexroot\poker-portrait-transition-no-community-overlap.json`, `D:\codexroot\poker-landscape-transition-layout.json`; screenshots: `D:\codexroot\poker-portrait-transition-no-community-overlap.png`, `D:\codexroot\poker-landscape-transition-layout.png`.

Latest architecture/test-framework cleanup, 2026-04-29:

- Backup before this pass: `D:\codexroot\my-poker-app-backup-architecture-20260429-144129.zip`.
- `PokerGame.jsx` is still the state-changing game controller, but large UI areas were extracted into `src/components/poker/`:
  - `PokerHeader.jsx`
  - `JoinRequestsBar.jsx`
  - `TransitionBanner.jsx`
  - `OpponentCard.jsx`
  - `TableCenter.jsx`
  - `SelfPlayerPanel.jsx`
  - `ActionDock.jsx`
  - `GameLogDrawer.jsx`
- Shared UI/view-state helpers now live in:
  - `src/utils/pokerUi.js`
  - `src/utils/pokerViewState.js`
- Browser smoke scripts were formalized under `scripts/smoke/`:
  - `poker-smoke-harness.mjs` contains shared Playwright setup, room creation/join, action driving, geometry checks, screenshots, and JSON artifact helpers.
  - `quick-room-smoke.mjs` checks two-player room creation/join and action dock rendering.
  - `transition-layout-smoke.mjs` checks portrait/landscape transition overlays and waiting-button overlap.
- New npm scripts:

```powershell
npm run smoke:quick
npm run smoke:transition
```

- Smoke scripts require Playwright. In the Codex desktop environment, set:

```powershell
$env:NODE_PATH='C:\Users\26808\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
```

- Project docs were added/rewritten:
  - `README.md`
  - `docs/ARCHITECTURE.md`
  - `docs/TESTING.md`
- Verification after this cleanup:

```powershell
npm run lint
npm run test:logic
npm run build
$env:NODE_PATH='C:\Users\26808\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
npm run smoke:quick
npm run smoke:transition
```

- Browser smoke outputs:
  - `D:\codexroot\poker-quick-room-smoke.json`, room `4184`
  - `D:\codexroot\poker-transition-layout-smoke.json`, rooms `8546` and `3690`
  - Screenshots: `D:\codexroot\poker-quick-room-host.png`, `D:\codexroot\poker-quick-room-guest.png`, `D:\codexroot\poker-transition-portrait.png`, `D:\codexroot\poker-transition-landscape.png`
- Build still passes with only the existing Vite chunk-size warning.

Latest showdown timing/all-in reveal fix, 2026-04-29:

- Backup after this pass: `D:\codexroot\my-poker-app-backup-showdown-timing-20260429-151428.zip`.
- Shortened showdown pacing:
  - `showdownIntroMs`: `900`
  - `showdownRevealMs`: `850`
  - `winnerHoldMs`: `2400`
- Normal two-player showdown now auto-starts the next hand after roughly `5s` instead of about `9-10s`; all-in runout settlement skips repeat hole-card reveal and holds winners for roughly `3.3s` including the settlement intro.
- Added `shouldSkipShowdownReveal(room)` in `src/utils/gameFlow.js` so all-in runout rooms skip reveal delay even if legacy data still has `showSequence` values.
- In `PokerGame.jsx`, all-in runout settlement now sets live players' `showSequence` to `-1` after ranks/highlights are calculated, keeping already-revealed cards visible without replaying the one-by-one showdown animation.
- Verification:

```powershell
npm run lint
npm run test:logic
npm run build
$env:NODE_PATH='C:\Users\26808\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
npm run smoke:transition
```

- Browser smoke output: `D:\codexroot\poker-transition-layout-smoke.json`, rooms `7697` and `2820`.
- Mobile portrait/landscape layout switching remains CSS media-query based and passed the transition layout smoke.

## 2026-04-29 Round-End Action Hold

Backup after this pass: `D:\codexroot\my-poker-app-backup-action-hold-20260429-155013.zip`.

Purpose:

- Keep showdown reveal pacing readable: `showdownIntroMs` and per-player `showdownRevealMs` are both `1800`.
- Keep the shortened final winner hold: `winnerHoldMs` remains `2400`.
- Preserve the last action at the end of each betting round before chips/actions are cleared.

Implementation notes:

- `TRANSITION_TIMING.actionHoldMs` is `850`.
- `advanceGameState` creates an `action-hold` transition before a street advances or a fold-win settlement starts when a recent `lastAction` exists.
- The transition completion effect passes the completed transition back into `advanceGameState`, so the second pass knows the hold already happened and can safely clear bets/actions.
- Action bubbles now also show no-chip actions such as check and fold, not only numeric bets.

Validation commands used:

```powershell
npm run lint
npm run test:logic
npm run build
$env:NODE_PATH='C:\Users\26808\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
npm run smoke:transition
npm run smoke:quick
```

- Browser smoke output: `D:\codexroot\poker-transition-layout-smoke.json`, rooms `2733` and `6663`.
- Quick room smoke output: `D:\codexroot\poker-quick-room-smoke.json`, room `8360`.
- Focused action-hold smoke output: `D:\codexroot\poker-action-hold-smoke.json`, room `1848`; observed an active transition before flop with visible final-action bubbles `20` and `20`.

## 2026-04-29 Stable Transition And Mobile Info Pass

Backup after this pass: `D:\codexroot\my-poker-app-backup-stable-transitions-20260429-193800.zip`.

Purpose:

- Extend winner hold by roughly 1.5 seconds: `winnerHoldMs` is now `3900`.
- Make the final action hold more reliable: `actionHoldMs` is now `1250`.
- Slightly lengthen street dealing animation and add a `450ms` transition completion grace period before the manager clears a transition.
- Prevent slow clients from seeing only the tail end of a transition by replaying each newly received transition for its full duration locally.
- Rename check from `看牌` to `过牌`, and keep action bubbles/buttons horizontally laid out on mobile.
- Correct stale blind action visuals so an acted big blind no longer remains purple.
- Simplify mobile center information: the phase pill is now a compact stable label, hides during active transition, and transition detail owns the animated explanation.

Validation commands used:

```powershell
npm run lint
npm run test:logic
npm run build
$env:NODE_PATH='C:\Users\26808\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
npm run smoke:transition
npm run smoke:quick
```

- Transition layout smoke output: `D:\codexroot\poker-transition-layout-smoke.json`, rooms `1884` and `8168`.
- Stable action display smoke output: `D:\codexroot\poker-stable-action-display-smoke.json`, room `1792`; verified big blind action bubble is blue after checking, `过牌` remains horizontal on mobile, and no horizontal overflow was detected.
- Quick room smoke output: `D:\codexroot\poker-quick-room-smoke.json`, room `9204`.

## 2026-04-29 Multiway Layout Smoke

Backup after this pass: `D:\codexroot\my-poker-app-backup-multiway-layout-20260429-202500.zip`.

Purpose:

- Preserve a reusable 4-player browser smoke test for real multiway table layout.
- Test one shared room with four simultaneous viewports: desktop `1366x900`, square `900x900`, mobile portrait `390x844`, and mobile landscape `844x390`.
- Verify waiting state, flop transition, and turn transition for all four players.

Script:

```powershell
$env:NODE_PATH='C:\Users\26808\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
npm run smoke:multiway-layout
```

Implementation notes:

- Script path: `scripts/smoke/multiway-layout-smoke.mjs`.
- NPM script: `smoke:multiway-layout`.
- The script joins players sequentially; concurrent joins can introduce room-write race noise that is outside this layout test.
- It fails on hard overlaps among the action dock, self panel, pot, phase pill, clock, transition banner, community cards, and visible opponent cards.
- It also fails on horizontal page overflow, clipped fixed elements, text fit issues, and non-horizontal action bubbles.

Layout fixes made while validating:

- Inactive action docks no longer render the disabled raise panel, which prevented the desktop dock from covering public cards.
- The transition banner entrance animation now preserves horizontal centering during the animation.
- Mobile landscape table center was tuned so community cards sit above the self panel while the pot stays clear of opponent cards.
- Mobile landscape transition banner was moved slightly upward so it does not overlap the pot.

Validation commands used:

```powershell
npm run lint
npm run test:logic
npm run build
$env:NODE_PATH='C:\Users\26808\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
npm run smoke:transition
npm run smoke:multiway-layout
npm run smoke:quick
```

- Multiway smoke output: `D:\codexroot\poker-multiway-layout-smoke.json`, room `2276`, no failures.
- Transition smoke output: `D:\codexroot\poker-transition-layout-smoke.json`, rooms `7690` and `3662`.
- Quick room smoke output: `D:\codexroot\poker-quick-room-smoke.json`, room `7782`.

## 2026-04-29 v1.0 Lobby And Chinese Labels

Backup after this pass: `D:\codexroot\my-poker-app-backup-v1-cn-labels-20260429-204233.zip`.

Changes:

- Mobile phase short labels are Chinese: `翻前`, `翻牌`, `转牌`, `河牌`, `摊牌`.
- Pot label is Chinese only: `当前底池` or `本局奖池`.
- Lobby now shows a top-left `v1.0` button that opens a short version information modal.
- `package.json` and `package-lock.json` are aligned to version `1.0.0`.
- Smoke room creation now clicks stable `data-testid` selectors instead of depending on button order.

Validation commands used:

```powershell
npm run lint
npm run test:logic
npm run build
$env:NODE_PATH='C:\Users\26808\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
npm run smoke:quick
```

- Focused browser check output: `D:\codexroot\poker-version-cn-label-smoke.json`, room `1037`; verified the lobby version modal and mobile table labels `翻前` / `当前底池` with no English phase/pot text.
- Quick room smoke output: `D:\codexroot\poker-quick-room-smoke.json`, room `1610`.

## GitHub Release Steps

Check changes:

```powershell
git status --short
git diff --stat
git diff
```

Commit after checks pass:

```powershell
git add .gitignore README.md MAINTENANCE.md docs package.json scripts src/App.jsx src/index.css src/components src/utils vercel.json
git commit -m "Maintain poker app build and docs"
```

Push to GitHub:

```powershell
git push origin main
```

Only push after the project owner verifies the local behavior.

## Vercel Notes

The project is linked to Vercel in `.vercel/project.json`; that folder is ignored and should stay local.

Required Vercel environment variables:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

The project includes `vercel.json` with:

- Build command: `npm run build`
- Output directory: `dist`
- Framework: `vite`

Deploy from the linked project:

```powershell
vercel
```

Production deploy:

```powershell
vercel --prod
```

If Vercel has missing Firebase variables, set them in the Vercel dashboard or with:

```powershell
vercel env add VITE_FIREBASE_API_KEY production
vercel env add VITE_FIREBASE_AUTH_DOMAIN production
vercel env add VITE_FIREBASE_PROJECT_ID production
vercel env add VITE_FIREBASE_STORAGE_BUCKET production
vercel env add VITE_FIREBASE_MESSAGING_SENDER_ID production
vercel env add VITE_FIREBASE_APP_ID production
```
