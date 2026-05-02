import {
  artifactPath,
  createRoom,
  createSmokeContext,
  launchSmokeBrowser,
  sleep,
  writeSmokeArtifact,
} from './poker-smoke-harness.mjs';

const browser = await launchSmokeBrowser();
let result = { ok: false };

try {
  const context = await createSmokeContext(browser, { width: 1366, height: 900 });
  const page = await context.newPage();
  const roomId = await createRoom(page, `RoomHist${Date.now() % 10000}`);

  await page.evaluate(async ({ roomId }) => {
    const { auth } = await import('/src/firebase.js');
    const {
      getRoomSnapshot,
      setRoomDocument,
      setUserRoomHistoryDocument,
    } = await import('/src/services/roomRepository.js');

    for (let attempt = 0; attempt < 80 && !auth.currentUser?.uid; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('anonymous auth did not finish');

    const snapshot = await getRoomSnapshot(roomId);
    const room = snapshot.data();
    const now = Date.now();
    const heroCards = ['♠A', '♥A'];
    const board = ['♠2', '♥7', '♦J', '♣4', '♠9'];
    const playerName = room.players?.find((player) => player.uid === uid)?.name || 'Me';
    const handEntry = {
      id: `${roomId}-hero-smoke`,
      roomId,
      handNumber: 1,
      startedAt: now - 60_000,
      endedAt: now,
      status: 'showdown',
      board,
      totalPot: 120,
      totalAwarded: 120,
      pots: [],
      winners: [{ uid, name: playerName, amount: 120, rankName: '一对', potLabel: '主池' }],
      players: [{ uid, name: playerName, shownCards: [], rankName: '一对', winAmount: 120 }],
      actions: [{
        id: 'hero-a1',
        handNumber: 1,
        street: 'river',
        streetLabel: '河牌',
        at: now - 10_000,
        playerUid: uid,
        playerName,
        actionType: 'call',
        actionLabel: '跟注',
        amount: 20,
        totalBet: 20,
        potAfter: 120,
      }],
      summary: `${playerName} +120`,
    };
    const players = (room.players || []).map((player) => (
      player.uid === uid
        ? {
            ...player,
            hand: heroCards,
            folded: false,
            allIn: false,
            showCards: false,
            rankName: '一对',
            winAmount: 120,
          }
        : player
    ));
    const nextRoom = {
      ...room,
      status: 'showdown',
      handCount: 1,
      players,
      communityCards: board,
      pot: 0,
      currentBet: 0,
      settlement: {
        id: 'hero-smoke-settlement',
        totalPot: 120,
        totalAwarded: 120,
        pots: [],
      },
      handHistory: [handEntry],
      lastHandSummary: {
        handNumber: 1,
        endedAt: now,
        summary: handEntry.summary,
        totalPot: 120,
        winners: handEntry.winners,
      },
      updatedAt: now,
    };

    await setUserRoomHistoryDocument(uid, roomId, {
      id: roomId,
      roomId,
      roomInstanceId: room.roomInstanceId || roomId,
      lastVisitedAt: now,
      updatedAt: now,
      historyTtlAt: now + 30 * 24 * 60 * 60 * 1000,
      recentHands: [{
        ...handEntry,
        heroCards,
        heroPlayerUid: uid,
        heroPlayerName: playerName,
        heroRankName: '一对',
      }],
    }, { merge: true });
    await setRoomDocument(roomId, nextRoom, { merge: false });
  }, { roomId });

  await sleep(1500);
  await page.locator('.poker-log-button').click();
  await page.locator('.poker-log-drawer button').filter({ hasText: '牌局历史' }).click();
  await page.waitForSelector('text=我的手牌', { timeout: 20_000 });
  await page.waitForSelector('text=♠A', { timeout: 20_000 });
  const bodyText = await page.textContent('body');
  const screenshot = artifactPath('poker-room-personal-history-smoke.png');
  await page.screenshot({ path: screenshot, fullPage: true });

  result = {
    ok: bodyText.includes('我的手牌') &&
      bodyText.includes('♠A') &&
      bodyText.includes('♥A') &&
      bodyText.includes('+120'),
    roomId,
    screenshot,
  };

  await context.close();
} finally {
  await browser.close();
}

const output = writeSmokeArtifact('poker-room-personal-history-smoke.json', result);
console.log(JSON.stringify({ ok: result.ok, output, roomId: result.roomId }, null, 2));
if (!result.ok) process.exitCode = 1;
