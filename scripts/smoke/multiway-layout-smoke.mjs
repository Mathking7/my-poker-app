import {
  artifactPath,
  clickIfEnabled,
  createRoom,
  createSmokeContext,
  joinRoom,
  launchSmokeBrowser,
  sleep,
  startHand,
  writeSmokeArtifact,
} from './poker-smoke-harness.mjs';

const viewports = [
  { name: 'desktop', width: 1366, height: 900 },
  { name: 'square', width: 900, height: 900 },
  { name: 'portrait', width: 390, height: 844 },
  { name: 'landscape', width: 844, height: 390 },
];

const importantSelectors = [
  '.poker-action-controls',
  '.poker-self-panel',
  '.poker-pot-pill',
  '.poker-phase-pill',
  '.poker-table-clock',
  '.poker-transition-banner',
  '.poker-community-cards',
];

const viewportForRole = Object.fromEntries(viewports.map((viewport) => [viewport.name, viewport]));

function intersects(a, b) {
  return Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
}

async function waitForAllPlayers(pages, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const counts = await Promise.all(pages.map((page) => page.evaluate(() => (
      document.querySelectorAll('.poker-opponent-card').length
    )).catch(() => 0)));
    if (counts.every((count) => count >= 3)) return { ok: true, counts };
    await sleep(350);
  }
  const counts = await Promise.all(pages.map((page) => page.evaluate(() => (
    document.querySelectorAll('.poker-opponent-card').length
  )).catch(() => 0)));
  return { ok: false, counts };
}

async function clickFirstEnabled(pages, selector, timeoutMs = 35_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const page of pages) {
      if (await clickIfEnabled(page, selector)) return page;
    }
    await sleep(140);
  }
  return null;
}

async function driveToTransition(pages, minCommunityCards, timeoutMs = 55_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const reached = await Promise.any(pages.map((page) => page.evaluate((minCards) => {
      const banner = document.querySelector('.poker-transition-banner');
      const communityCards = document.querySelectorAll('.poker-community-cards > .bg-white').length;
      return Boolean(banner && communityCards >= minCards);
    }, minCommunityCards))).catch(() => false);
    if (reached) return true;

    await clickFirstEnabled(pages, '.poker-call-button:not([disabled])', 900);
    await sleep(180);
  }
  return false;
}

async function toggleMobileRaiseIfAvailable(pages) {
  const snapshots = [];
  for (const page of pages) {
    const viewportName = await page.evaluate(() => window.innerWidth < 900 ? `${window.innerWidth}x${window.innerHeight}` : '');
    if (!viewportName) continue;
    if (await clickIfEnabled(page, '.poker-mobile-raise-toggle:not([disabled])')) {
      await sleep(300);
      snapshots.push(await collectLayout(page, 'mobile-raise-open'));
      await clickIfEnabled(page, '.poker-mobile-raise-toggle:not([disabled])');
      await sleep(160);
    }
  }
  return snapshots;
}

async function collectLayout(page, label) {
  return page.evaluate(({ label, importantSelectors }) => {
    const rectFor = (element) => {
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
    };
    const isVisible = (rect) => Boolean(
      rect &&
      rect.width > 0 &&
      rect.height > 0 &&
      rect.right > 0 &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.top < window.innerHeight
    );
    const inViewport = (rect) => Boolean(
      rect &&
      rect.left >= -1 &&
      rect.top >= -1 &&
      rect.right <= window.innerWidth + 1 &&
      rect.bottom <= window.innerHeight + 1
    );
    const overlaps = (a, b) => Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
    const rects = Object.fromEntries(importantSelectors.map((selector) => [selector, rectFor(document.querySelector(selector))]));
    const visibleOpponentCards = [...document.querySelectorAll('.poker-opponent-card')]
      .map(rectFor)
      .filter(isVisible);
    const visibleActionBubbles = [...document.querySelectorAll('.poker-action-bubble')]
      .map((element) => ({
        rect: rectFor(element),
        text: element.textContent.trim(),
        whiteSpace: getComputedStyle(element).whiteSpace,
        writingMode: getComputedStyle(element).writingMode,
      }))
      .filter((item) => isVisible(item.rect));
    const textFitIssues = [...document.querySelectorAll(
      '.poker-main-actions button, .poker-action-status-label, .poker-action-status-timer, .poker-phase-pill, .poker-pot-pill, .poker-transition-card',
    )]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        return element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2;
      })
      .map((element) => ({
        selector: element.className || element.tagName,
        text: element.textContent.trim().slice(0, 80),
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      }));
    const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    const transition = rects['.poker-transition-banner'];
    const community = rects['.poker-community-cards'];
    const pot = rects['.poker-pot-pill'];
    const actionDock = rects['.poker-action-controls'];
    const selfPanel = rects['.poker-self-panel'];
    const phase = rects['.poker-phase-pill'];
    const clock = rects['.poker-table-clock'];

    const overlapPairs = {
      actionDockSelfPanel: overlaps(actionDock, selfPanel),
      transitionCommunity: overlaps(transition, community),
      transitionPot: overlaps(transition, pot),
      transitionActionDock: overlaps(transition, actionDock),
      transitionSelfPanel: overlaps(transition, selfPanel),
      phasePot: overlaps(phase, pot),
      clockPot: overlaps(clock, pot),
      potVisibleOpponent: visibleOpponentCards.some((rect) => overlaps(pot, rect)),
      actionDockCommunity: overlaps(actionDock, community),
      selfPanelCommunity: overlaps(selfPanel, community),
    };
    const offscreenFixedElements = Object.entries(rects)
      .filter(([selector, rect]) => selector !== '.poker-table-clock' && isVisible(rect) && !inViewport(rect))
      .map(([selector, rect]) => ({ selector, rect }));
    const actionBubbleIssues = visibleActionBubbles.filter((bubble) => (
      bubble.whiteSpace !== 'nowrap' ||
      !bubble.writingMode.startsWith('horizontal') ||
      !inViewport(bubble.rect)
    ));

    return {
      label,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      statusClass: document.querySelector('.poker-game-shell')?.className || '',
      opponentCount: document.querySelectorAll('.poker-opponent-card').length,
      communityCardCount: document.querySelectorAll('.poker-community-cards > .bg-white').length,
      hasTransition: Boolean(document.querySelector('.poker-transition-banner')),
      overflow,
      overlapPairs,
      offscreenFixedElements,
      textFitIssues,
      visibleActionBubbles,
      rects,
    };
  }, { label, importantSelectors });
}

function layoutPasses(snapshot) {
  const hardOverlaps = [
    'actionDockSelfPanel',
    'transitionCommunity',
    'transitionPot',
    'transitionActionDock',
    'transitionSelfPanel',
    'phasePot',
    'clockPot',
    'potVisibleOpponent',
    'actionDockCommunity',
    'selfPanelCommunity',
  ].filter((key) => snapshot.overlapPairs[key]);

  return {
    ok: (
      snapshot.opponentCount >= 3 &&
      !snapshot.overflow &&
      hardOverlaps.length === 0 &&
      snapshot.offscreenFixedElements.length === 0 &&
      snapshot.textFitIssues.length === 0
    ),
    hardOverlaps,
  };
}

const browser = await launchSmokeBrowser();
const contexts = [];
const pages = [];
const snapshots = [];
let roomId = null;
let reachedFlopTransition = false;
let reachedTurnTransition = false;
let allPlayersJoined = { ok: false, counts: [] };

try {
  for (const viewport of viewports) {
    const context = await createSmokeContext(browser, viewport);
    contexts.push(context);
    const page = await context.newPage();
    page.__viewportName = viewport.name;
    pages.push(page);
  }

  roomId = await createRoom(pages[0], `Multi${Date.now() % 10000}`);
  for (const [index, page] of pages.slice(1).entries()) {
    await joinRoom(page, roomId, `P${index + 2}-${viewportForRole[page.__viewportName].name}`);
    allPlayersJoined = await waitForAllPlayers(pages, 20_000);
  }
  allPlayersJoined = await waitForAllPlayers(pages);

  for (const page of pages) {
    snapshots.push({
      role: page.__viewportName,
      stage: 'waiting',
      screenshot: artifactPath(`poker-multiway-${page.__viewportName}-waiting.png`),
      layout: await collectLayout(page, 'waiting'),
    });
    await page.screenshot({ path: snapshots.at(-1).screenshot, fullPage: true });
  }

  await startHand(pages[0]);
  await sleep(1450);

  snapshots.push(...(await toggleMobileRaiseIfAvailable(pages)).map((layout, index) => ({
    role: `mobile-raise-${index}`,
    stage: 'mobile-raise-open',
    screenshot: null,
    layout,
  })));

  reachedFlopTransition = await driveToTransition(pages, 3);
  await sleep(450);

  for (const page of pages) {
    snapshots.push({
      role: page.__viewportName,
      stage: 'flop-transition',
      screenshot: artifactPath(`poker-multiway-${page.__viewportName}-flop-transition.png`),
      layout: await collectLayout(page, 'flop-transition'),
    });
    await page.screenshot({ path: snapshots.at(-1).screenshot, fullPage: true });
  }

  reachedTurnTransition = await driveToTransition(pages, 4);
  await sleep(450);

  for (const page of pages) {
    snapshots.push({
      role: page.__viewportName,
      stage: 'turn-transition',
      screenshot: artifactPath(`poker-multiway-${page.__viewportName}-turn-transition.png`),
      layout: await collectLayout(page, 'turn-transition'),
    });
    await page.screenshot({ path: snapshots.at(-1).screenshot, fullPage: true });
  }
} finally {
  await Promise.all(contexts.map((context) => context.close().catch(() => {})));
  await browser.close();
}

const assessed = snapshots.map((snapshot) => ({
  ...snapshot,
  assessment: layoutPasses(snapshot.layout),
}));
const ok = Boolean(
  roomId &&
  allPlayersJoined.ok &&
  reachedFlopTransition &&
  reachedTurnTransition &&
  assessed.every((snapshot) => snapshot.assessment.ok)
);
const output = writeSmokeArtifact('poker-multiway-layout-smoke.json', {
  ok,
  roomId,
  allPlayersJoined,
  reachedFlopTransition,
  reachedTurnTransition,
  snapshots: assessed,
});

console.log(JSON.stringify({
  ok,
  output,
  roomId,
  allPlayersJoined,
  reachedFlopTransition,
  reachedTurnTransition,
  failures: assessed
    .filter((snapshot) => !snapshot.assessment.ok)
    .map((snapshot) => ({
      role: snapshot.role,
      stage: snapshot.stage,
      hardOverlaps: snapshot.assessment.hardOverlaps,
      overflow: snapshot.layout.overflow,
      offscreenFixedElements: snapshot.layout.offscreenFixedElements,
      textFitIssues: snapshot.layout.textFitIssues,
    })),
}, null, 2));

if (!ok) process.exitCode = 1;
