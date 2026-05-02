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

async function injectIsolationMarker(page, roomId) {
  return page.evaluate(async ({ roomId }) => {
    const {
      getRoomSnapshot,
      setRoomDocument,
    } = await import('/src/services/roomRepository.js');

    const snapshot = await getRoomSnapshot(roomId);
    if (!snapshot.exists()) throw new Error(`room ${roomId} was not created`);
    const room = snapshot.data();
    const now = Date.now();
    const markerUid = `smoke-marker-${now}`;
    const markerPlayer = {
      uid: markerUid,
      name: 'IsoMarker',
      chips: 970,
      hand: [],
      bet: 30,
      folded: false,
      allIn: false,
      hasActed: true,
      isSittingOut: false,
      waitingNextHand: false,
      lastAction: 'call',
      isAi: true,
      aiStyle: 'balanced',
      lastSeenAt: now,
      disconnectedAt: null,
      isOnline: true,
      totalContribution: 30,
    };

    await setRoomDocument(roomId, {
      ...room,
      players: [
        ...(Array.isArray(room.players) ? room.players : []),
        markerPlayer,
      ],
      pot: Number(room.pot || 0) + 30,
      logs: [
        ...(Array.isArray(room.logs) ? room.logs : []),
        `smoke isolation marker ${markerUid}`,
      ],
      isolationSmokeMarker: markerUid,
      updatedAt: now,
    }, { merge: false });

    return markerUid;
  }, { roomId });
}

async function readRoomIsolationState(page, roomId, markerUid) {
  return page.evaluate(async ({ roomId, markerUid }) => {
    const { getRoomSnapshot } = await import('/src/services/roomRepository.js');
    const snapshot = await getRoomSnapshot(roomId);
    const room = snapshot.exists() ? snapshot.data() : null;
    const players = Array.isArray(room?.players) ? room.players : [];
    return {
      exists: Boolean(room),
      playerCount: players.length,
      hasMarker: room?.isolationSmokeMarker === markerUid ||
        players.some((player) => player.uid === markerUid || player.name === 'IsoMarker') ||
        (Array.isArray(room?.logs) && room.logs.some((entry) => String(entry).includes(markerUid))),
    };
  }, { roomId, markerUid });
}

const browser = await launchSmokeBrowser();
let context;
let result = {
  ok: false,
  firstRoomId: null,
  secondRoomId: null,
  markerUid: null,
  firstOpponentCount: 0,
  secondOpponentCount: 0,
  secondRoomState: null,
};

try {
  context = await createSmokeContext(browser, { width: 1280, height: 820 });
  const page = await context.newPage();

  result.firstRoomId = await createRoom(page, `Iso${Date.now() % 10000}`, { isPublic: false });
  await page.waitForSelector('.poker-room-chip', { timeout: 30_000 });

  result.markerUid = await injectIsolationMarker(page, result.firstRoomId);
  await sleep(1200);

  result.firstOpponentCount = await page.evaluate(() => document.querySelectorAll('.poker-opponent-card').length);
  await page.locator('.poker-header-actions button').last().click();
  await page.waitForSelector('[data-testid="create-public-room"]', { timeout: 20_000 });

  result.secondRoomId = await createRoomFromCurrentLobby(page);
  await sleep(1200);
  result.secondOpponentCount = await page.evaluate(() => document.querySelectorAll('.poker-opponent-card').length);
  const displayedRoomId = await getRoomIdFromHeader(page);
  result.secondRoomState = await readRoomIsolationState(page, result.secondRoomId, result.markerUid);

  result = {
    ...result,
    displayedRoomId,
    ok: Boolean(
      result.firstRoomId &&
      result.secondRoomId &&
      result.markerUid &&
      result.secondRoomId !== result.firstRoomId &&
      displayedRoomId === result.secondRoomId &&
      result.firstOpponentCount >= 1 &&
      result.secondRoomState?.exists &&
      result.secondRoomState.playerCount === 1 &&
      !result.secondRoomState.hasMarker &&
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
