import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const smokeConfig = {
  baseUrl: process.env.SMOKE_BASE_URL || 'http://127.0.0.1:5173/',
  browserPath: process.env.SMOKE_BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  outputDir: process.env.SMOKE_OUTPUT_DIR || 'D:\\codexroot',
  authWaitMs: Number(process.env.SMOKE_AUTH_WAIT_MS || 20_000),
  actionTimeoutMs: Number(process.env.SMOKE_ACTION_TIMEOUT_MS || 40_000),
};

export async function loadChromium() {
  try {
    const { chromium } = await import('playwright');
    return chromium;
  } catch (error) {
    const roots = (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean);
    try {
      const require = createRequire(import.meta.url);
      const resolved = require.resolve('playwright', { paths: [process.cwd(), ...roots] });
      const module = await import(pathToFileURL(resolved).href);
      return module.chromium || module.default?.chromium;
    } catch {
      throw new Error([
        'Playwright is required for browser smoke tests.',
        'Install it as a dev dependency or point NODE_PATH to the bundled Codex runtime, for example:',
        "$env:NODE_PATH='C:\\Users\\26808\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules'",
        `Original error: ${error.message}`,
      ].join('\n'));
    }
  }
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function launchSmokeBrowser() {
  const chromium = await loadChromium();
  return chromium.launch({
    headless: true,
    executablePath: smokeConfig.browserPath,
  });
}

export async function createSmokeContext(browser, viewport) {
  return browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    isMobile: viewport.width < 900,
    hasTouch: viewport.width < 900,
  });
}

export async function createRoom(page, playerName = `Host${Date.now() % 10000}`, options = {}) {
  const isPublic = options.isPublic !== false;
  await page.goto(smokeConfig.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="text"]', { timeout: 30_000 });
  await page.locator('input[type="text"]').first().fill(playerName);
  await sleep(smokeConfig.authWaitMs);
  await page.locator(isPublic ? '[data-testid="create-public-room"]' : '[data-testid="create-private-room"]').click();
  await page.waitForSelector('[data-testid="confirm-create-room"]', { timeout: 10_000 });
  await page.locator('[data-testid="confirm-create-room"]').click();
  await page.waitForSelector('.poker-room-chip', { timeout: 30_000 });
  await page.waitForFunction(() => !document.querySelector('.fixed.inset-0'), null, { timeout: 10_000 }).catch(() => {});
  return (await page.locator('.poker-room-chip .tracking-widest').first().textContent()).trim();
}

export async function joinRoom(page, roomId, playerName = `Guest${Date.now() % 10000}`) {
  await page.goto(smokeConfig.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="text"]', { timeout: 30_000 });
  await page.locator('input[type="text"]').first().fill(playerName);
  await sleep(smokeConfig.authWaitMs);
  await page.locator('input[maxlength="4"]').fill(roomId);
  await page.locator('input[maxlength="4"]').evaluate((element) => {
    element.parentElement.querySelector('button').click();
  });
  await page.waitForSelector('.poker-room-chip', { timeout: 30_000 });
}

export async function clickIfEnabled(page, selector) {
  const handle = await page.$(selector);
  if (!handle) return false;
  const disabled = await handle.evaluate((element) => element.disabled || element.getAttribute('aria-disabled') === 'true');
  if (disabled) return false;
  await handle.click({ force: true }).catch(() => {});
  return true;
}

export function intersects(a, b) {
  return Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
}

export async function getRect(page, selector) {
  return page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
  }, selector);
}

export async function getRects(page, selector) {
  return page.evaluate((sel) => (
    [...document.querySelectorAll(sel)].map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    }).filter((rect) => rect.width > 0 && rect.height > 0)
  ), selector);
}

export async function startHand(page) {
  await page.waitForSelector('.poker-board-center button:not([disabled])', { timeout: 30_000 });
  await page.locator('.poker-board-center button:not([disabled])').first().click();
}

export async function driveToStreetTransition(pages) {
  const deadline = Date.now() + smokeConfig.actionTimeoutMs;
  while (Date.now() < deadline) {
    const reached = await pages[0].evaluate(() => {
      const banner = document.querySelector('.poker-transition-banner');
      const communityCards = document.querySelectorAll('.poker-community-cards > .bg-white').length;
      return Boolean(banner && communityCards >= 3);
    }).catch(() => false);
    if (reached) return true;

    let clicked = false;
    for (const page of pages) {
      clicked = await clickIfEnabled(page, '.poker-call-button:not([disabled])');
      if (clicked) break;
    }
    await sleep(clicked ? 700 : 250);
  }
  return false;
}

export async function getCommonLayoutBoxes(page) {
  return {
    transitionBanner: await getRect(page, '.poker-transition-banner'),
    community: await getRect(page, '.poker-community-cards'),
    opponent: await getRect(page, '.poker-opponent-card'),
    opponentActionBubbles: await getRects(page, '.poker-opponent-bet, .poker-opponent-win'),
    opponentTimers: await getRects(page, '.poker-opponent-timer-ring'),
    opponentsStrip: await getRect(page, '.poker-opponents-strip'),
    pot: await getRect(page, '.poker-pot-pill'),
    selfPanel: await getRect(page, '.poker-self-panel'),
    startButton: await getRect(page, '.poker-board-center button:not([disabled])'),
  };
}

export function writeSmokeArtifact(name, result) {
  fs.mkdirSync(smokeConfig.outputDir, { recursive: true });
  const outputPath = path.join(smokeConfig.outputDir, name);
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  return outputPath;
}

export function artifactPath(name) {
  fs.mkdirSync(smokeConfig.outputDir, { recursive: true });
  return path.join(smokeConfig.outputDir, name);
}
