import {
  artifactPath,
  createRoom,
  createSmokeContext,
  getRect,
  joinRoom,
  launchSmokeBrowser,
  writeSmokeArtifact,
} from './poker-smoke-harness.mjs';

const browser = await launchSmokeBrowser();
let result;

try {
  const hostContext = await createSmokeContext(browser, { width: 1366, height: 900 });
  const guestContext = await createSmokeContext(browser, { width: 390, height: 844 });
  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();

  try {
    const roomId = await createRoom(hostPage);
    await joinRoom(guestPage, roomId);
    const hostActionDock = await getRect(hostPage, '.poker-action-controls');
    const guestActionDock = await getRect(guestPage, '.poker-action-controls');
    const hostScreenshot = artifactPath('poker-quick-room-host.png');
    const guestScreenshot = artifactPath('poker-quick-room-guest.png');
    await hostPage.screenshot({ path: hostScreenshot, fullPage: true });
    await guestPage.screenshot({ path: guestScreenshot, fullPage: true });

    result = {
      ok: Boolean(roomId && hostActionDock && guestActionDock),
      roomId,
      hostActionDock,
      guestActionDock,
      hostScreenshot,
      guestScreenshot,
    };
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
} finally {
  await browser.close();
}

const output = writeSmokeArtifact('poker-quick-room-smoke.json', result);
console.log(JSON.stringify({ ok: result.ok, output, roomId: result.roomId }, null, 2));
if (!result.ok) process.exitCode = 1;
