import { spawnSync } from 'node:child_process';

const productionUrl = process.env.SMOKE_BASE_URL || 'https://my-poker-app-liard.vercel.app';
const runNpmScript = (script) => {
  if (process.platform === 'win32') {
    return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `npm run ${script}`], {
      env: {
        ...process.env,
        SMOKE_BASE_URL: productionUrl,
      },
      stdio: 'inherit',
    });
  }

  return spawnSync('npm', ['run', script], {
    env: {
      ...process.env,
      SMOKE_BASE_URL: productionUrl,
    },
    stdio: 'inherit',
  });
};

const smokeScripts = [
  'smoke:quick',
  'smoke:ai-single-action',
];

console.log(`Running production smoke tests against ${productionUrl}`);

if (!process.env.NODE_PATH) {
  console.log('NODE_PATH is not set. If Playwright is not installed locally, point NODE_PATH to the bundled Codex runtime.');
}

for (const script of smokeScripts) {
  console.log(`\n> npm run ${script}`);
  const result = runNpmScript(script);

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log('\nProduction smoke tests passed.');
