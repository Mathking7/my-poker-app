# Architecture

## Runtime Flow

1. `src/App.jsx` signs the user in anonymously, creates or joins rooms, subscribes to the active room document, normalizes room data, and hands it to the game UI.
2. `src/components/PokerGame.jsx` coordinates room writes and passes derived state to focused table components.
3. `src/components/poker/*` renders the table, cards, opponents, center board, action dock, logs, settings, and transition banner.
4. `src/hooks/*` owns React lifecycle side effects such as local timers, transition presentation, showdown reveal, AI scheduling, presence heartbeats, and maintenance polling.
5. `src/utils/*` contains pure rules and deterministic helpers that can be tested without a browser.

Firestore room path:

```text
artifacts/{globalAppId}/public/data/rooms/{roomId}
```

## Boundaries

### Firestore

`src/services/roomRepository.js` is the Firestore access layer. Components should use this service rather than importing `firebase/firestore` directly.

`src/App.jsx` subscribes to a room and calls `normalizePokerRoom` before storing it in React state. This keeps old or incomplete room documents from leaking malformed values into UI and rules code.

### Room Schema

`src/utils/pokerRoomSchema.js` is an in-memory normalizer, not a migration writer. It fills defaults for room and player fields, normalizes settings, and preserves unknown fields so older rooms remain compatible.

Update `src/types/pokerRoom.js` when shared Firestore fields are added.

### Poker Rules

Core Texas Hold'em rules live in:

```text
src/utils/gameFlow.js
src/utils/pokerGameEngine.js
src/utils/pokerLogic.jsx
src/utils/chipMath.js
```

UI code should not duplicate all-in, min-raise, side-pot, odd-chip, turn-order, or action-availability rules. Add tests in `scripts/logic-tests.mjs` when changing these helpers.

### Presentation Hooks

The main game component now delegates local presentation clocks:

```text
useTurnTimer                 local countdown and timeout action trigger
usePresentedTransition       server transition mirrored into stable local animation time
useTransitionCompletion      manager-only transition completion and auto-advance
useShowdownPresentation      reveal sequence, highlight cards, winner display state
useAiTurnScheduler           AI think delay, transition wait, and one-action scheduling
```

These hooks keep `PokerGame.jsx` focused on orchestration instead of carrying every timer and animation effect inline.

### AI

AI has three conceptual layers:

```text
src/utils/pokerAi.jsx        strategy, range/EV estimation, action choice
src/utils/pokerAiTurn.js     pure scheduling identity helpers
src/hooks/useAiTurnScheduler.js  browser-side execution scheduling and Firestore commit
```

The AI scheduler waits for pauses and transitions to clear before committing one action. `getAiActionKey` defines the duplicate-action guard and is covered by logic tests.

### Styling

Styles load in this order:

```text
src/index.css
src/styles/poker-mobile-layout.css
```

`index.css` remains the legacy global poker stylesheet. New narrow mobile collision fixes should go into `poker-mobile-layout.css` with comments explaining the protected layout contract.

## Room Maintenance

Browsers do not provide a reliable Firestore disconnect hook, so the app uses heartbeats:

- Active clients write `lastSeenAt`.
- Stale players are detected after the configured timeout.
- Empty rooms expire after the room TTL.
- One elected maintenance client marks stale players offline, folds blocking players, advances stuck hands, and transfers private-room host rights.

Maintenance rules live in `src/utils/roomMaintenance.js` and are tested in `scripts/logic-tests.mjs`.

## Deployment Shape

This is a static Vite app deployed to Vercel. AI runs in the browser with a worker fallback; no separate backend server is required for the current architecture.
