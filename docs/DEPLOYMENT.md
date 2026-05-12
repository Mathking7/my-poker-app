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
Build Command: npm run lint && npm run test:logic && npm run build
Output Directory: dist
```

The committed `vercel.json` is the source of truth for production routing and headers:

- Vite build output is served from `dist`.
- Production builds run `npm run lint && npm run test:logic && npm run build`.
- Every non-file route rewrites to `/index.html`, which keeps future SPA deep links from returning a Vercel 404.
- The ignored build step skips Vercel builds when a commit only changes docs, GitHub workflows, smoke scripts, or Firestore rules. Commits that touch `src`, build config, `package.json`, `vercel.json`, or logic tests still build.
- Low-risk browser security headers are applied globally:
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`

Required environment variables:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

Default production flow:

```powershell
git push origin main
```

The connected GitHub integration should deploy `main` automatically. Do not also run `vercel --prod` for the same commit, otherwise Vercel will create a duplicate production deployment. Use manual CLI deploy only when GitHub auto-deploy is unavailable or an emergency redeploy is needed:

```powershell
vercel --prod
```

After deployment, verify:

```powershell
vercel inspect https://my-poker-app-liard.vercel.app
```

For a production smoke test, point the browser smoke harness at the production URL:

```powershell
$env:SMOKE_BASE_URL='https://my-poker-app-liard.vercel.app'
$env:NODE_PATH='C:\Users\26808\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
npm run smoke:quick
npm run smoke:ai-single-action
```

Or use the bundled production verification script:

```powershell
$env:NODE_PATH='C:\Users\26808\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
npm run verify:prod
```

## Preview Firebase

The current production app points at the Firebase project configured by `VITE_FIREBASE_*`. Vercel Preview deployments should ideally use a separate staging Firebase project so test rooms and smoke data do not enter the production Firestore database.

Recommended setup when a staging Firebase project is available:

1. Create a second Firebase project for staging.
2. Enable Anonymous Authentication and Firestore in that project.
3. In Vercel, set the staging `VITE_FIREBASE_*` values for the Preview environment.
4. Keep the current production Firebase values only in the Production environment.
5. Deploy `firestore.rules` to both Firebase projects whenever rules change.

Do not change production environment variables until the staging project has been tested with `smoke:quick` and `smoke:ai-single-action`.

Suggested Vercel CLI flow after the staging Firebase web app exists:

```powershell
vercel env add VITE_FIREBASE_API_KEY preview
vercel env add VITE_FIREBASE_AUTH_DOMAIN preview
vercel env add VITE_FIREBASE_PROJECT_ID preview
vercel env add VITE_FIREBASE_STORAGE_BUCKET preview
vercel env add VITE_FIREBASE_MESSAGING_SENDER_ID preview
vercel env add VITE_FIREBASE_APP_ID preview
```

Keep `.env` and `.env.local` out of Git. Use `.env.example` as the committed template only.

## Firebase Rules

Vercel only deploys the static app. Firestore rules must be deployed separately when `firestore.rules` changes:

```powershell
npx --yes firebase-tools deploy --only firestore:rules --project mypoker-e6f9c
```

If Firebase CLI login is unavailable, publish the same `firestore.rules` content from Firebase Console:

```text
Firebase Console -> Firestore Database -> Rules -> Publish
```

Current rules keep `users/{uid}/roomHistory` private to the same anonymous auth uid. Room documents are still collaboratively writable by signed-in users because the current app has no server-side arbiter. Strict anti-cheat, server-side dealing, or fully private per-player hands should be handled in a later backend-backed version.

Rules automation is scaffolded in `.github/workflows/firebase-rules.yml`. It deploys only when `firestore.rules`, `firebase.json`, or the workflow itself changes, and it safely skips itself if secrets are not configured.

Required GitHub repository secrets:

```text
FIREBASE_PROJECT_ID
FIREBASE_SERVICE_ACCOUNT_JSON
```

`FIREBASE_SERVICE_ACCOUNT_JSON` should be the full JSON content of a Firebase service account with permission to deploy Firestore rules. Do not commit Firebase service-account credentials to the repository.
