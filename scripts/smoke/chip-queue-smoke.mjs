import {
  artifactPath,
  createRoom,
  createSmokeContext,
  launchSmokeBrowser,
  sleep,
  startHand,
  writeSmokeArtifact,
} from './poker-smoke-harness.mjs';

async function getSelfChips(page) {
  return page.evaluate(() => {
    const text = Array.from(document.querySelectorAll('.poker-self-meta span'))
      .map((element) => element.textContent || '')
      .find((value) => value.includes('💰')) || '';
    const match = text.match(/\d+/);
    return match ? Number(match[0]) : 0;
  });
}

async function hasQueuedChipNotice(page, label) {
  return page.evaluate((expectedLabel) => document.body.textContent.includes(`已排队：${expectedLabel}`), label);
}

async function queueSelfChipChange(page, mode, amount) {
  await page.locator('button[title="修改自己的筹码"]').click();
  await page.waitForSelector('input[type="number"]', { timeout: 10_000 });
  const modeLabel = mode === 'subtract' ? '减少' : (mode === 'add' ? '增加' : '设为');
  await page.locator('button', { hasText: modeLabel }).click();
  await page.locator('input[type="number"]').fill(String(amount));
  await page.locator('button', { hasText: '排队应用' }).click();
}

async function reopenSelfManager(page) {
  await page.locator('button[title="修改自己的筹码"]').click();
  await page.waitForSelector('input[type="number"]', { timeout: 10_000 });
}

async function closeModal(page) {
  await page.locator('.fixed.inset-0 button').first().click();
}

async function clickEnabled(page, selector) {
  const handle = await page.$(selector);
  if (!handle) return false;
  const disabled = await handle.evaluate((element) => element.disabled || element.getAttribute('aria-disabled') === 'true');
  if (disabled) return false;
  await handle.click().catch(() => {});
  return true;
}

async function finishCurrentHandAndApplyNext(page, targetMinChips) {
  const deadline = Date.now() + 70_000;
  while (Date.now() < deadline) {
    const chips = await getSelfChips(page);
    if (chips >= targetMinChips) return chips;

    const clicked = await clickEnabled(page, '.poker-fold-button:not([disabled])')
      || await clickEnabled(page, '.poker-call-button:not([disabled])')
      || await clickEnabled(page, '.poker-board-center button:not([disabled])');
    await sleep(clicked ? 500 : 800);
  }
  return getSelfChips(page);
}

const browser = await launchSmokeBrowser();
let result = { ok: false };

try {
  const publicContext = await createSmokeContext(browser, { width: 1366, height: 900 });
  const publicPage = await publicContext.newPage();
  const publicRoomId = await createRoom(publicPage, `PublicChip${Date.now() % 10000}`, { isPublic: true });
  const publicHasChipButton = await publicPage.locator('button[title="修改自己的筹码"]').count();
  await publicContext.close();

  const context = await createSmokeContext(browser, { width: 1366, height: 900 });
  const page = await context.newPage();
  const roomId = await createRoom(page, `ChipHost${Date.now() % 10000}`, { isPublic: false });

  await page.locator('button[title="加入 AI 玩家"]').click();
  await page.waitForFunction(() => (
    document.querySelector('.poker-opponent-card')?.textContent.includes('AI')
  ), null, { timeout: 20_000 });

  await startHand(page);
  await page.waitForSelector('button[title="修改自己的筹码"]', { timeout: 20_000 });
  const chipsBeforeQueue = await getSelfChips(page);

  await queueSelfChipChange(page, 'subtract', 100);
  await reopenSelfManager(page);
  const subtractNoticeVisible = await hasQueuedChipNotice(page, '减少 100');
  await closeModal(page);

  await queueSelfChipChange(page, 'set', 1200);
  await sleep(600);
  const chipsAfterQueue = await getSelfChips(page);

  await reopenSelfManager(page);
  const queuedNoticeVisible = await hasQueuedChipNotice(page, '设为 1200');
  await closeModal(page);

  const chipsAfterNextHand = await finishCurrentHandAndApplyNext(page, 1170);
  const screenshot = artifactPath('poker-chip-queue-smoke.png');
  await page.screenshot({ path: screenshot, fullPage: true });

  result = {
    ok: Boolean(
      roomId &&
      publicRoomId &&
      publicHasChipButton === 0 &&
      chipsBeforeQueue > 0 &&
      subtractNoticeVisible &&
      chipsAfterQueue === chipsBeforeQueue &&
      queuedNoticeVisible &&
      chipsAfterNextHand >= 1170
    ),
    publicRoomId,
    publicHasChipButton,
    roomId,
    chipsBeforeQueue,
    subtractNoticeVisible,
    chipsAfterQueue,
    queuedNoticeVisible,
    chipsAfterNextHand,
    screenshot,
  };

  await context.close();
} finally {
  await browser.close();
}

const output = writeSmokeArtifact('poker-chip-queue-smoke.json', result);
console.log(JSON.stringify({
  ok: result.ok,
  output,
  publicRoomId: result.publicRoomId,
  publicHasChipButton: result.publicHasChipButton,
  roomId: result.roomId,
  chipsBeforeQueue: result.chipsBeforeQueue,
  subtractNoticeVisible: result.subtractNoticeVisible,
  chipsAfterQueue: result.chipsAfterQueue,
  queuedNoticeVisible: result.queuedNoticeVisible,
  chipsAfterNextHand: result.chipsAfterNextHand,
}, null, 2));

if (!result.ok) process.exitCode = 1;
