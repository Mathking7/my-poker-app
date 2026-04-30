import {
  artifactPath,
  createRoom,
  createSmokeContext,
  driveToStreetTransition,
  getCommonLayoutBoxes,
  intersects,
  joinRoom,
  launchSmokeBrowser,
  sleep,
  startHand,
  writeSmokeArtifact,
} from './poker-smoke-harness.mjs';

const viewports = [
  { name: 'portrait', width: 390, height: 844 },
  { name: 'landscape', width: 844, height: 390 },
];

const browser = await launchSmokeBrowser();
const results = [];

const intersectsAny = (box, boxes = []) => boxes.some((item) => intersects(box, item));
const bottomEdge = (box, height = 12) => (
  box ? { ...box, top: Math.max(box.top, box.bottom - height) } : null
);

try {
  for (const viewport of viewports) {
    const hostContext = await createSmokeContext(browser, viewport);
    const guestContext = await createSmokeContext(browser, viewport);
    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    try {
      const roomId = await createRoom(hostPage);
      await joinRoom(guestPage, roomId);
      const waitingBoxes = await getCommonLayoutBoxes(hostPage);
      await startHand(hostPage);
      const reachedStreetTransition = await driveToStreetTransition([hostPage, guestPage]);
      await sleep(250);
      const boxes = await getCommonLayoutBoxes(hostPage);
      const screenshot = artifactPath(`poker-transition-${viewport.name}.png`);
      await hostPage.screenshot({ path: screenshot, fullPage: true });

      results.push({
        viewport,
        roomId,
        reachedStreetTransition,
        startOverSelfPanelBeforeStart: intersects(waitingBoxes.startButton, waitingBoxes.selfPanel),
        transitionOverCommunity: intersects(boxes.transitionBanner, boxes.community),
        transitionOverOpponent: intersects(boxes.transitionBanner, boxes.opponent),
        transitionOverOpponentAction: intersectsAny(boxes.transitionBanner, boxes.opponentActionBubbles),
        transitionOverOpponentTimer: intersectsAny(boxes.transitionBanner, boxes.opponentTimers),
        transitionOverOpponentStrip: intersects(boxes.transitionBanner, bottomEdge(boxes.opponentsStrip)),
        transitionOverPot: intersects(boxes.transitionBanner, boxes.pot),
        horizontalOverflow: await hostPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
        screenshot,
        boxes,
        waitingBoxes,
      });
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  }
} finally {
  await browser.close();
}

const ok = results.every((result) => (
  result.reachedStreetTransition &&
  !result.startOverSelfPanelBeforeStart &&
  !result.transitionOverCommunity &&
  !result.transitionOverOpponent &&
  !result.transitionOverOpponentAction &&
  !result.transitionOverOpponentTimer &&
  !result.transitionOverOpponentStrip &&
  !result.transitionOverPot &&
  !result.horizontalOverflow
));

const output = writeSmokeArtifact('poker-transition-layout-smoke.json', { ok, results });
console.log(JSON.stringify({ ok, output, results: results.map(({ viewport, roomId }) => ({ viewport, roomId })) }, null, 2));
if (!ok) process.exitCode = 1;
