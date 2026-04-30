import {
  artifactPath,
  createRoom,
  createSmokeContext,
  launchSmokeBrowser,
  sleep,
  startHand,
  writeSmokeArtifact,
} from './poker-smoke-harness.mjs';

async function getPauseSnapshot(page, label) {
  return page.evaluate((stageLabel) => {
    const shell = document.querySelector('.poker-game-shell');
    return {
      label: stageLabel,
      text: document.body.textContent,
      hasTransition: Boolean(document.querySelector('.poker-transition-banner')),
      canHumanAct: Boolean(document.querySelector('.poker-call-button:not([disabled])')),
      statusClass: shell?.className || '',
      isPausedUi: document.body.textContent.includes('恢复对局'),
    };
  }, label);
}

const browser = await launchSmokeBrowser();
let result = { ok: false };

try {
  const context = await createSmokeContext(browser, { width: 1366, height: 900 });
  const page = await context.newPage();
  const roomId = await createRoom(page, `PauseHost${Date.now() % 10000}`, { isPublic: false });

  await page.locator('button[title="加入 AI 玩家"]').click();
  await page.waitForFunction(() => (
    document.querySelector('.poker-opponent-card')?.textContent.includes('AI')
  ), null, { timeout: 20_000 });

  await startHand(page);
  await page.waitForSelector('.poker-transition-banner', { timeout: 10_000 });
  await page.locator('button[title="暂停对局"]').click();
  await page.waitForSelector('button[title="恢复对局"]', { timeout: 10_000 });
  await sleep(2600);
  const paused = await getPauseSnapshot(page, 'paused-after-transition-duration');

  await page.locator('button[title="恢复对局"]').click();
  await page.waitForFunction(() => {
    const pausedUi = document.body.textContent.includes('恢复对局');
    const hasTransition = Boolean(document.querySelector('.poker-transition-banner'));
    const canHumanAct = Boolean(document.querySelector('.poker-call-button:not([disabled])'));
    const shellClass = document.querySelector('.poker-game-shell')?.className || '';
    const advanced = shellClass.includes('poker-status-flop') ||
      shellClass.includes('poker-status-turn') ||
      shellClass.includes('poker-status-river') ||
      shellClass.includes('poker-status-showdown');
    return !pausedUi && !hasTransition && (canHumanAct || advanced);
  }, null, { timeout: 25_000 });

  const resumed = await getPauseSnapshot(page, 'resumed');
  const screenshot = artifactPath('poker-pause-transition-smoke.png');
  await page.screenshot({ path: screenshot, fullPage: true });

  result = {
    ok: Boolean(roomId && paused.isPausedUi && resumed && !resumed.isPausedUi && !resumed.hasTransition && (resumed.canHumanAct || resumed.statusClass.includes('poker-status-'))),
    roomId,
    paused,
    resumed,
    screenshot,
  };

  await context.close();
} finally {
  await browser.close();
}

const output = writeSmokeArtifact('poker-pause-transition-smoke.json', result);
console.log(JSON.stringify({
  ok: result.ok,
  output,
  roomId: result.roomId,
  paused: {
    hasTransition: result.paused?.hasTransition,
    isPausedUi: result.paused?.isPausedUi,
  },
  resumed: {
    hasTransition: result.resumed?.hasTransition,
    canHumanAct: result.resumed?.canHumanAct,
    statusClass: result.resumed?.statusClass,
  },
}, null, 2));

if (!result.ok) process.exitCode = 1;
