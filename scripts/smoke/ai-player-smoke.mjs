import {
  artifactPath,
  createRoom,
  createSmokeContext,
  launchSmokeBrowser,
  sleep,
  startHand,
  writeSmokeArtifact,
} from './poker-smoke-harness.mjs';

async function collectAiSnapshot(page, label) {
  return page.evaluate((stageLabel) => {
    const opponent = document.querySelector('.poker-opponent-card');
    const actionBubble = opponent?.querySelector('.poker-action-bubble');
    const shell = document.querySelector('.poker-game-shell');
    const actionStatus = document.querySelector('.poker-action-status-label')?.textContent.trim() || '';
    return {
      label: stageLabel,
      opponentText: opponent?.textContent.trim() || '',
      actionText: actionBubble?.textContent.trim() || '',
      actionStatus,
      statusClass: shell?.className || '',
      hasAiButton: Boolean(document.querySelector('button[title="加入 AI 玩家"]')),
      canHumanAct: Boolean(document.querySelector('.poker-call-button:not([disabled])')),
      canStart: Boolean(document.querySelector('.poker-board-center button:not([disabled])')),
    };
  }, label);
}

async function waitForAiAction(page, timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snapshot = await collectAiSnapshot(page, 'poll');
    if (
      snapshot.opponentText.includes('AI') &&
      (
        snapshot.canHumanAct ||
        snapshot.statusClass.includes('poker-status-flop') ||
        snapshot.statusClass.includes('poker-status-turn') ||
        snapshot.statusClass.includes('poker-status-river') ||
        snapshot.statusClass.includes('poker-status-showdown')
      )
    ) {
      return snapshot;
    }
    await sleep(250);
  }
  return collectAiSnapshot(page, 'timeout');
}

const browser = await launchSmokeBrowser();
let result = { ok: false };

try {
  const context = await createSmokeContext(browser, { width: 1366, height: 900 });
  const page = await context.newPage();
  const roomId = await createRoom(page, `AiHost${Date.now() % 10000}`);

  await page.locator('button[title="加入 AI 玩家"]').click();
  await page.waitForFunction(() => (
    document.querySelector('.poker-opponent-card')?.textContent.includes('AI')
  ), null, { timeout: 20_000 });

  const beforeStart = await collectAiSnapshot(page, 'before-start');
  await startHand(page);
  await sleep(1600);
  const afterAction = await waitForAiAction(page);
  const screenshot = artifactPath('poker-ai-player-smoke.png');
  await page.screenshot({ path: screenshot, fullPage: true });

  result = {
    ok: Boolean(
      roomId &&
      beforeStart.opponentText.includes('AI') &&
      (
        afterAction.canHumanAct ||
        afterAction.statusClass.includes('poker-status-flop') ||
        afterAction.statusClass.includes('poker-status-turn') ||
        afterAction.statusClass.includes('poker-status-river') ||
        afterAction.statusClass.includes('poker-status-showdown')
      )
    ),
    roomId,
    beforeStart,
    afterAction,
    screenshot,
  };

  await context.close();
} finally {
  await browser.close();
}

const output = writeSmokeArtifact('poker-ai-player-smoke.json', result);
console.log(JSON.stringify({
  ok: result.ok,
  output,
  roomId: result.roomId,
  actionText: result.afterAction?.actionText,
  actionStatus: result.afterAction?.actionStatus,
  canHumanAct: result.afterAction?.canHumanAct,
  statusClass: result.afterAction?.statusClass,
}, null, 2));

if (!result.ok) process.exitCode = 1;
