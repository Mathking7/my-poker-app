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
