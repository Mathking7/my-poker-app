import {
  artifactPath,
  createRoom,
  createSmokeContext,
  joinRoom,
  launchSmokeBrowser,
  sleep,
  startHand,
  writeSmokeArtifact,
} from './poker-smoke-harness.mjs';

async function collectSnapshot(page, label) {
  return page.evaluate((stageLabel) => {
    const shellClass = document.querySelector('.poker-game-shell')?.className || '';
    const opponent = document.querySelector('.poker-opponent-card');
    const ring = document.querySelector('.poker-opponent-timer-ring');
    const timerSvg = ring?.querySelector('.poker-opponent-timer-svg');
    const timerProgress = ring?.querySelector('.poker-opponent-timer-progress');
    const timerSvgStyle = timerSvg ? getComputedStyle(timerSvg) : null;
    return {
      label: stageLabel,
      statusClass: shellClass,
      statusPreFlop: shellClass.includes('poker-status-pre-flop'),
      opponentRevealedCards: opponent?.querySelectorAll('.poker-card-mobile.bg-white').length || 0,
      opponentText: opponent?.textContent.trim() || '',
      canCall: Boolean(document.querySelector('.poker-call-button:not([disabled])')),
      canRaise: Boolean(document.querySelector('.poker-raise-panel .poker-raise-controls button:not([disabled])')),
      transitionText: document.querySelector('.poker-transition-banner')?.textContent.trim() || '',
      timerDasharray: timerProgress?.style.strokeDasharray || '',
      timerDashoffset: timerProgress?.style.strokeDashoffset || '',
      timerTransform: timerSvgStyle?.transform || '',
    };
  }, label);
}

async function waitForEntry(entries, predicate, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const entry of entries) {
      const snapshot = await collectSnapshot(entry.page, entry.role).catch(() => null);
      if (snapshot && predicate(snapshot)) return { ...entry, snapshot };
    }
    await sleep(250);
  }
  return null;
}

const browser = await launchSmokeBrowser();
const contexts = [];
let result = { ok: false };

try {
  const hostContext = await createSmokeContext(browser, { width: 1366, height: 900 });
  const guestContext = await createSmokeContext(browser, { width: 1366, height: 900 });
  contexts.push(hostContext, guestContext);

  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();
  const roomId = await createRoom(hostPage, `AllinHost${Date.now() % 10000}`, { isPublic: true });
  await joinRoom(guestPage, roomId, `AllinGuest${Date.now() % 10000}`);
  await startHand(hostPage);
  await sleep(2200);

  const timerProbe = await Promise.race([
    hostPage.waitForSelector('.poker-opponent-timer-ring', { timeout: 5000 })
      .then(() => collectSnapshot(hostPage, 'host-timer'))
      .catch(() => null),
    guestPage.waitForSelector('.poker-opponent-timer-ring', { timeout: 5000 })
      .then(() => collectSnapshot(guestPage, 'guest-timer'))
      .catch(() => null),
  ]);

  const raiser = await waitForEntry([
    { page: hostPage, role: 'host' },
    { page: guestPage, role: 'guest' },
  ], (snapshot) => snapshot.canRaise);

  if (!raiser) {
    throw new Error('no active raiser found');
  }

  const callerEntry = raiser.role === 'host'
    ? { page: guestPage, role: 'guest' }
    : { page: hostPage, role: 'host' };

  await raiser.page.locator('.poker-raise-presets button').last().click();
  await sleep(250);
  await raiser.page.locator('.poker-raise-panel .poker-raise-controls button:not([disabled])').click();

  const caller = await waitForEntry([callerEntry], (snapshot) => snapshot.canCall, 45_000);
  if (!caller) {
    throw new Error('all-in caller did not become active');
  }
  await caller.page.locator('.poker-call-button:not([disabled])').click();

  const samples = [];
  let currentRoundReveal = null;
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    const hostSnapshot = await collectSnapshot(hostPage, `host-${samples.length}`);
    const guestSnapshot = await collectSnapshot(guestPage, `guest-${samples.length}`);
    samples.push({ host: hostSnapshot, guest: guestSnapshot });

    currentRoundReveal = [hostSnapshot, guestSnapshot].find((snapshot) => (
      snapshot.statusPreFlop && snapshot.opponentRevealedCards >= 2
    ));
    if (currentRoundReveal) break;
    await sleep(300);
  }

  const screenshot = artifactPath('poker-allin-current-round-smoke.png');
  await (currentRoundReveal?.label?.startsWith('guest') ? guestPage : hostPage).screenshot({
    path: screenshot,
    fullPage: true,
  });

  result = {
    ok: Boolean(
      roomId &&
      currentRoundReveal &&
      timerProbe?.timerDasharray &&
      timerProbe?.timerDashoffset &&
      timerProbe?.timerTransform !== 'none'
    ),
    roomId,
    raiserRole: raiser.role,
    callerRole: caller.role,
    timerProbe,
    currentRoundReveal,
    lastSample: samples.at(-1),
    screenshot,
  };
} catch (error) {
  result.error = error.message;
} finally {
  await Promise.all(contexts.map((context) => context.close().catch(() => {})));
  await browser.close();
}

const output = writeSmokeArtifact('poker-allin-current-round-smoke.json', result);
console.log(JSON.stringify({
  ok: result.ok,
  output,
  roomId: result.roomId,
  raiserRole: result.raiserRole,
  callerRole: result.callerRole,
  currentRoundReveal: result.currentRoundReveal,
}, null, 2));

if (!result.ok) process.exitCode = 1;
