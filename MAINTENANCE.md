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

## GitHub Release Steps

Check changes:

```powershell
git status --short
git diff --stat
git diff
```

Commit after checks pass:

```powershell
git add .gitignore MAINTENANCE.md package.json scripts/logic-tests.mjs vercel.json src/App.jsx src/index.css src/components/CardUI.jsx src/components/Lobby.jsx src/components/PokerGame.jsx src/utils/gameFlow.js src/utils/gameSettings.js src/utils/pokerLogic.jsx src/utils/roomMaintenance.js
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
