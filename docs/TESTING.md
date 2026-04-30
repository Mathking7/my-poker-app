# Testing

## Required Local Checks

Run these before deployment or a large refactor:

```powershell
npm run lint
npm run test:logic
npm run build
```

`npm run build` may warn about large chunks. That warning is known and does not fail the build, but future performance work should split the largest bundle.

## Logic Tests

```powershell
npm run test:logic
```

Coverage includes:

- room settings normalization
- chip unit rounding
- room creation and secure room id generation
- room presence, stale-player cleanup, and room expiration
- room schema normalization
- transition progress and pause/resume clocks
- raise bounds, nonlinear raise slider, and additional-raise display
- all-in reveal and auto-advance rules
- side-pot and odd-chip settlement
- deck and hand evaluation
- action view-state derivation
- AI configuration, private-card snapshot safety, and duplicate-action identity

## Browser Smoke Tests

Smoke tests require the local dev server:

```powershell
npm run dev -- --host 127.0.0.1 --port 5173
```

If Playwright is not installed locally, use the bundled Codex runtime:

```powershell
$env:NODE_PATH='C:\Users\26808\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
```

Common commands:

```powershell
npm run smoke:quick
npm run smoke:transition
npm run smoke:multiway-layout
npm run smoke:mobile-opponents
npm run smoke:raise-slider
npm run smoke:ai
npm run smoke:ai-single-action
npm run smoke:pause-transition
npm run smoke:allin-current-round
npm run smoke:chip-queue
npm run smoke:room-create-isolation
```

Default artifacts are written to `D:\codexroot` unless `SMOKE_OUTPUT_DIR` is set.

## Which Smoke To Run

- Layout, transition banner, mobile portrait/landscape: `smoke:transition`, `smoke:multiway-layout`.
- Many opponents on mobile: `smoke:mobile-opponents`.
- Raise slider or chip unit behavior: `smoke:raise-slider`.
- AI join/action scheduling: `smoke:ai`, `smoke:ai-single-action`.
- Pause/resume during animations: `smoke:pause-transition`.
- All-in current-round reveal: `smoke:allin-current-round`.
- Host chip queue and public/private permissions: `smoke:chip-queue`.
- New-room isolation bugs: `smoke:room-create-isolation`.

When a smoke test fails, open the JSON artifact first, then the screenshot named in that JSON.
