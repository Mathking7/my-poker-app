import {
  createRoom,
  createSmokeContext,
  launchSmokeBrowser,
  sleep,
  writeSmokeArtifact,
} from './poker-smoke-harness.mjs';

async function getRoomIdFromHeader(page) {
  return page.locator('.poker-room-chip .tracking-widest').first().textContent({ timeout: 20_000 })
    .then((text) => text.trim());
}

async function createRoomFromCurrentLobby(page) {
  await page.waitForSelector('[data-testid="create-public-room"]', { timeout: 20_000 });
  await page.locator('[data-testid="create-public-room"]').click();
  await page.waitForSelector('[data-testid="confirm-create-room"]', { timeout: 10_000 });
  await page.locator('[data-testid="confirm-create-room"]').click();
  await page.waitForSelector('.poker-room-chip', { timeout: 30_000 });
  return getRoomIdFromHeader(page);
}

const browser = await launchSmokeBrowser();
let context;
let result = {
  ok: false,
  firstRoomId: null,
  secondRoomId: null,
  firstOpponentCount: 0,
  secondOpponentCount: 0,
};

try {
  context = await createSmokeContext(browser, { width: 1280, height: 820 });
  const page = await context.newPage();

  result.firstRoomId = await createRoom(page, `Iso${Date.now() % 10000}`, { isPublic: false });
  await page.waitForSelector('.poker-room-chip', { timeout: 30_000 });

  const addAiButton = page.locator('.poker-header-actions button').first();
  if (await addAiButton.isVisible().catch(() => false)) {
    await addAiButton.click().catch(() => {});
    await sleep(900);
  }

  result.firstOpponentCount = await page.evaluate(() => document.querySelectorAll('.poker-opponent-card').length);
  await page.locator('.poker-header-actions button').last().click();
  await page.waitForSelector('[data-testid="create-public-room"]', { timeout: 20_000 });

  result.secondRoomId = await createRoomFromCurrentLobby(page);
  await sleep(1200);
  result.secondOpponentCount = await page.evaluate(() => document.querySelectorAll('.poker-opponent-card').length);
  const displayedRoomId = await getRoomIdFromHeader(page);

  result = {
    ...result,
    displayedRoomId,
    ok: Boolean(
      result.firstRoomId &&
      result.secondRoomId &&
      result.secondRoomId !== result.firstRoomId &&
      displayedRoomId === result.secondRoomId &&
      result.firstOpponentCount >= 1 &&
      result.secondOpponentCount === 0
    ),
  };
} finally {
  await context?.close().catch(() => {});
  await browser.close();
}

const output = writeSmokeArtifact('poker-room-create-isolation-smoke.json', result);
console.log(JSON.stringify({ ...result, output }, null, 2));
if (!result.ok) process.exitCode = 1;
