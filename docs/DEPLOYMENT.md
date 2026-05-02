# Deployment Runbook

## Local Verification

```powershell
npm run lint
npm run test:logic
npm run build
```

For browser smoke tests, start the dev server first:

```powershell
npm run dev -- --host 127.0.0.1 --port 5173
```

Then set Playwright path when using the bundled Codex runtime:

```powershell
$env:NODE_PATH='C:\Users\26808\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
npm run smoke:transition
npm run smoke:multiway-layout
```

Before a production push that touches room lifecycle, personal history, or AI scheduling, also run:

```powershell
npm run smoke:ai-single-action
npm run smoke:personal-history
npm run smoke:room-personal-history
npm run smoke:room-create-isolation
```

## GitHub

```powershell
git status --short
git add README.md docs src scripts package.json package-lock.json vite.config.js
git commit -m "Improve maintainability and layout test coverage"
git push
```

Do not commit `.env`, `.vercel`, `node_modules`, `dist`, or smoke screenshots.

## Vercel

Vercel project settings:

```text
Framework: Vite
Build Command: npm run build
Output Directory: dist
```

Required environment variables:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

After pushing to the connected GitHub branch, Vercel should deploy automatically. If manual deploy is needed, run from the project root after login:

```powershell
vercel --prod
```

## Firebase Rules

Vercel only deploys the static app. Firestore rules must be deployed separately when `firestore.rules` changes:

```powershell
firebase deploy --only firestore:rules
```

Current rules keep `users/{uid}/roomHistory` private to the same anonymous auth uid. Room documents are still collaboratively writable by signed-in users because the current app has no server-side arbiter. Strict anti-cheat, server-side dealing, or fully private per-player hands should be handled in a later backend-backed version.
