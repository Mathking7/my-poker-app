# Browser Smoke Harness

All browser smoke tests share `poker-smoke-harness.mjs`.

Common helpers:

- `launchSmokeBrowser()`: starts Edge/Chromium through Playwright.
- `createSmokeContext(browser, viewport)`: creates desktop or mobile-like contexts.
- `createRoom(page, playerName, options)`: creates a public or private room.
- `joinRoom(page, roomId, playerName)`: joins a room from another context.
- `startHand(page)`: starts a waiting hand.
- `driveToStreetTransition(pages)`: advances a simple hand until a street transition appears.
- `getCommonLayoutBoxes(page)`: reads table rectangles for overlap checks, including transition banner, community cards, pot, opponent cards, opponent action bubbles, opponent timers, opponent strip, and self panel.
- `writeSmokeArtifact(name, result)` and `artifactPath(name)`: write JSON and screenshots under `SMOKE_OUTPUT_DIR`.

Focused coverage:

- `npm run smoke:personal-history`: checks the lobby/recent-room personal hand history view.
- `npm run smoke:room-personal-history`: checks the in-room hand history drawer with the current user's private hole cards.
- `npm run smoke:ai-single-action`: checks that an AI turn resolves once, clears the visible AI timer, and does not repeat the action.
- `npm run smoke:room-create-isolation`: injects a marker into an old room, creates a new room, and verifies the new room does not inherit old players, logs, or room state.

Environment knobs:

```powershell
$env:SMOKE_BASE_URL='http://127.0.0.1:5173/'
$env:SMOKE_OUTPUT_DIR='D:\codexroot\my-poker-app-artifacts\smoke'
$env:SMOKE_BROWSER_PATH='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$env:NODE_PATH='C:\Users\26808\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
```

When adding a new smoke test, compose these helpers instead of duplicating lobby login, room creation, screenshots, or artifact writing.

Layout smoke tests should assert hard overlaps explicitly. Important pairs include transition banner vs. community cards, pot, opponent cards, opponent action bubbles, opponent timer rings, opponent scroll strip, self panel, and action dock.
