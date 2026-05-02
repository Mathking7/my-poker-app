import {
  createSmokeContext,
  launchSmokeBrowser,
  sleep,
  writeSmokeArtifact,
} from './poker-smoke-harness.mjs';

const browser = await launchSmokeBrowser();
let context;
let result = { ok: false };

try {
  context = await createSmokeContext(browser, { width: 1280, height: 820 });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="text"]', { timeout: 30_000 });
  await page.locator('input[type="text"]').first().fill(`Hist${Date.now() % 10000}`);
  await sleep(20_000);

  const roomId = String(1000 + Math.floor(Math.random() * 9000));
  await page.evaluate(async ({ roomId }) => {
    const { auth } = await import('/src/firebase.js');
    const { setUserRoomHistoryDocument } = await import('/src/services/roomRepository.js');
    for (let attempt = 0; attempt < 80 && !auth.currentUser?.uid; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('anonymous auth did not finish');
    const now = Date.now();
    await setUserRoomHistoryDocument(uid, roomId, {
      id: roomId,
      roomId,
      roomInstanceId: `${roomId}-smoke`,
      isPublic: false,
      gameType: 'texas',
      status: 'showdown',
      canRejoin: false,
      lifecycleStatus: 'deleted',
      lastVisitedAt: now,
      updatedAt: now,
      historyTtlAt: now + 30 * 24 * 60 * 60 * 1000,
      retentionLabel: '个人历史',
      playerNames: ['Alice', 'Bob'],
      activePlayerCount: 0,
      totalPlayerCount: 2,
      handCount: 8,
      lastHandSummary: {
        handNumber: 8,
        endedAt: now,
        summary: 'Alice +120',
        totalPot: 120,
        winners: [{ uid: 'alice', name: 'Alice', amount: 120, rankName: '一对' }],
      },
      recentHands: [{
        id: `${roomId}-8`,
        roomId,
        handNumber: 8,
        startedAt: now - 60_000,
        endedAt: now,
        board: ['♠A', '♥K', '♦7', '♣2', '♠9'],
        totalPot: 120,
        totalAwarded: 120,
        heroCards: ['♠5', '♥5'],
        heroPlayerUid: uid,
        heroPlayerName: 'Me',
        heroRankName: '一对',
        pots: [],
        winners: [{ uid: 'alice', name: 'Alice', amount: 120, rankName: '一对' }],
        players: [
          { uid: 'alice', name: 'Alice', shownCards: ['♣Q', '♦Q'], rankName: '一对', winAmount: 120 },
          { uid: 'bob', name: 'Bob', shownCards: ['♣J', '♦T'], rankName: '高牌', winAmount: 0 },
        ],
        actions: [
          { id: 'a1', handNumber: 8, street: 'river', streetLabel: '河牌', at: now - 10_000, playerUid: 'alice', playerName: 'Alice', actionType: 'call', actionLabel: '跟注', amount: 20, totalBet: 20, potAfter: 120 },
        ],
        summary: 'Alice +120',
      }],
    }, { merge: false });
  }, { roomId });

  await page.locator('[data-testid="open-room-history"]').click();
  await page.waitForSelector('[data-testid="close-room-history"]', { timeout: 20_000 });
  await page.waitForSelector(`text=房号: ${roomId}`, { timeout: 20_000 });
  await page.locator('button').filter({ hasText: '查看牌局记录' }).first().click();
  await page.waitForSelector('text=我的手牌', { timeout: 20_000 });
  await page.waitForSelector('text=♠5', { timeout: 20_000 });
  await page.waitForSelector('text=♣Q', { timeout: 20_000 });
  const bodyText = await page.textContent('body');

  result = {
    ok: bodyText.includes(roomId) &&
      bodyText.includes('我的手牌') &&
      bodyText.includes('♠5') &&
      bodyText.includes('♥5') &&
      bodyText.includes('♣Q') &&
      bodyText.includes('♦Q') &&
      bodyText.includes('Alice +120'),
    roomId,
  };
} finally {
  await context?.close().catch(() => {});
  await browser.close();
}

const output = writeSmokeArtifact('poker-personal-history-smoke.json', result);
console.log(JSON.stringify({ ...result, output }, null, 2));
if (!result.ok) process.exitCode = 1;
