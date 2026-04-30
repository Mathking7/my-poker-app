import {
  artifactPath,
  createRoom,
  createSmokeContext,
  launchSmokeBrowser,
  sleep,
  writeSmokeArtifact,
} from './poker-smoke-harness.mjs';

async function addAiOpponent(page, targetCount) {
  const deadline = Date.now() + 80_000;
  while (Date.now() < deadline) {
    const count = await page.evaluate(() => document.querySelectorAll('.poker-opponent-card').length);
    if (count >= targetCount) return count;

    await page.locator('.poker-header-actions button[title*="AI"]').click().catch(() => {});
    await sleep(650);
  }
  return page.evaluate(() => document.querySelectorAll('.poker-opponent-card').length);
}

const browser = await launchSmokeBrowser();
let context;
let result = {
  ok: false,
  roomId: null,
  opponentCount: 0,
};

try {
  context = await createSmokeContext(browser, { width: 390, height: 844 });
  const page = await context.newPage();
  result.roomId = await createRoom(page, `Mob${Date.now() % 10000}`, { isPublic: false });
  result.opponentCount = await addAiOpponent(page, 7);
  await sleep(1000);

  const beforeScroll = await page.evaluate(() => {
    const strip = document.querySelector('.poker-opponents-strip');
    const row = document.querySelector('.poker-opponents-row');
    const cards = [...document.querySelectorAll('.poker-opponent-card')];
    const firstRect = cards[0]?.getBoundingClientRect();
    const lastRect = cards.at(-1)?.getBoundingClientRect();
    return {
      hasStrip: Boolean(strip),
      cardCount: cards.length,
      stripClientWidth: strip?.clientWidth || 0,
      stripScrollWidth: strip?.scrollWidth || 0,
      rowScrollWidth: row?.scrollWidth || 0,
      firstVisible: Boolean(firstRect && firstRect.left >= -2 && firstRect.right <= window.innerWidth + 2),
      lastVisibleBeforeScroll: Boolean(lastRect && lastRect.left >= -2 && lastRect.right <= window.innerWidth + 2),
    };
  });

  await page.evaluate(() => {
    const strip = document.querySelector('.poker-opponents-strip');
    if (strip) strip.scrollLeft = strip.scrollWidth;
  });
  await sleep(450);

  const afterScroll = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.poker-opponent-card')];
    const lastRect = cards.at(-1)?.getBoundingClientRect();
    const strip = document.querySelector('.poker-opponents-strip');
    return {
      scrollLeft: strip?.scrollLeft || 0,
      lastVisibleAfterScroll: Boolean(lastRect && lastRect.left >= -2 && lastRect.right <= window.innerWidth + 2),
      textFitIssues: [...document.querySelectorAll('.poker-opponent-card, .poker-player-name')]
        .filter((element) => element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2)
        .map((element) => element.textContent.trim().slice(0, 80)),
    };
  });

  const screenshot = artifactPath('poker-mobile-opponents-scroll.png');
  await page.screenshot({ path: screenshot, fullPage: true });

  result = {
    ...result,
    beforeScroll,
    afterScroll,
    screenshot,
    ok: Boolean(
      result.roomId &&
      beforeScroll.hasStrip &&
      beforeScroll.cardCount >= 7 &&
      beforeScroll.stripScrollWidth > beforeScroll.stripClientWidth + 24 &&
      beforeScroll.firstVisible &&
      !beforeScroll.lastVisibleBeforeScroll &&
      afterScroll.scrollLeft > 24 &&
      afterScroll.lastVisibleAfterScroll &&
      afterScroll.textFitIssues.length === 0
    ),
  };
} finally {
  await context?.close().catch(() => {});
  await browser.close();
}

const output = writeSmokeArtifact('poker-mobile-opponents-smoke.json', result);
console.log(JSON.stringify({ ...result, output }, null, 2));
if (!result.ok) process.exitCode = 1;
