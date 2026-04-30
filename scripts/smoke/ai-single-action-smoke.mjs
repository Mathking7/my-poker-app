import {
  artifactPath,
  createRoom,
  createSmokeContext,
  launchSmokeBrowser,
  sleep,
  startHand,
  writeSmokeArtifact,
} from './poker-smoke-harness.mjs';

async function collectState(page, label) {
  return page.evaluate((stageLabel) => {
    const opponent = document.querySelector('.poker-opponent-card');
    const actionBubble = opponent?.querySelector('.poker-action-bubble');
    const chipText = opponent?.querySelector('.poker-player-chips')?.textContent || '';
    const potText = document.querySelector('.poker-pot-amount')?.textContent || '';
    const numericText = (text) => Number((text.match(/\d+/) || ['0'])[0]);
    return {
      label: stageLabel,
      opponentText: opponent?.textContent.trim() || '',
      opponentChips: numericText(chipText),
      opponentAction: actionBubble?.textContent.trim() || '',
      opponentTimerVisible: Boolean(opponent?.querySelector('.poker-opponent-timer-ring')),
      tableClockVisible: Boolean(document.querySelector('.poker-table-clock')),
      pot: numericText(potText),
      canHumanAct: Boolean(document.querySelector('.poker-call-button:not([disabled])')),
      statusClass: document.querySelector('.poker-game-shell')?.className || '',
    };
  }, label);
}

async function waitForHumanAction(page, timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await collectState(page, 'poll');
    if (state.canHumanAct) return state;
    await sleep(250);
  }
  return collectState(page, 'timeout');
}

const browser = await launchSmokeBrowser();
let result = { ok: false };

try {
  const context = await createSmokeContext(browser, { width: 1366, height: 900 });
  const page = await context.newPage();
  const roomId = await createRoom(page, `AiOnce${Date.now() % 10000}`);

  await page.locator('button[title="加入 AI 玩家"]').click();
  await page.waitForFunction(() => (
    document.querySelector('.poker-opponent-card')?.textContent.includes('AI')
  ), null, { timeout: 20_000 });

  await startHand(page);
  await sleep(1600);
  const afterAiAction = await waitForHumanAction(page);
  await sleep(6_000);
  const afterIdle = await collectState(page, 'after-idle');
  const screenshot = artifactPath('poker-ai-single-action-smoke.png');
  await page.screenshot({ path: screenshot, fullPage: true });

  result = {
    ok: Boolean(
      roomId &&
      afterAiAction.canHumanAct &&
      !afterAiAction.opponentTimerVisible &&
      afterIdle.canHumanAct &&
      !afterIdle.opponentTimerVisible &&
      afterIdle.opponentChips === afterAiAction.opponentChips &&
      afterIdle.opponentAction === afterAiAction.opponentAction &&
      afterIdle.pot === afterAiAction.pot
    ),
    roomId,
    afterAiAction,
    afterIdle,
    screenshot,
  };

  await context.close();
} finally {
  await browser.close();
}

const output = writeSmokeArtifact('poker-ai-single-action-smoke.json', result);
console.log(JSON.stringify({
  ok: result.ok,
  output,
  roomId: result.roomId,
  afterAiAction: result.afterAiAction,
  afterIdle: result.afterIdle,
}, null, 2));

if (!result.ok) process.exitCode = 1;
