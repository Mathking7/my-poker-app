import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  MAX_INITIAL_CHIPS,
  MAX_TIME_LIMIT,
  MIN_INITIAL_CHIPS,
  MIN_TIME_LIMIT,
  getBigBlindForHand,
  getSmallBlindForHand,
  normalizeGameSettings,
} from '../src/utils/gameSettings.js';
import {
  EMPTY_ROOM_TTL_MS,
  PLAYER_STALE_MS,
  applyRoomMaintenance,
  getActivePlayerCount,
  isRoomExpired,
  shouldMarkLegacyRoom,
  stampPlayerPresence,
} from '../src/utils/roomMaintenance.js';

const importJsxAsModule = async (path) => {
  const source = fs.readFileSync(path, 'utf8');
  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`);
};

const { createDeck, evaluate7Cards } = await importJsxAsModule(new URL('../src/utils/pokerLogic.jsx', import.meta.url));

const unlimited = '\u65e0\u9650';

assert.deepEqual(normalizeGameSettings({ initialChips: -1, timeLimit: 1, allowJoinDuringGame: 1 }), {
  initialChips: MIN_INITIAL_CHIPS,
  timeLimit: MIN_TIME_LIMIT,
  allowJoinDuringGame: true,
  doubleBlinds: false,
  autoTopUp: false,
});
assert.equal(normalizeGameSettings({ initialChips: 999999 }).initialChips, MAX_INITIAL_CHIPS);
assert.equal(normalizeGameSettings({ timeLimit: 999999 }).timeLimit, MAX_TIME_LIMIT);
assert.equal(normalizeGameSettings({ timeLimit: unlimited }).timeLimit, unlimited);
assert.equal(getSmallBlindForHand({ doubleBlinds: false }, 20), 10);
assert.equal(getBigBlindForHand({ doubleBlinds: false }, 20), 20);
assert.equal(getSmallBlindForHand({ doubleBlinds: true }, 1), 10);
assert.equal(getBigBlindForHand({ doubleBlinds: true }, 5), 20);
assert.equal(getSmallBlindForHand({ doubleBlinds: true }, 6), 20);
assert.equal(getBigBlindForHand({ doubleBlinds: true }, 6), 40);

const now = 1_000_000;
assert.equal(shouldMarkLegacyRoom({ players: [{ uid: 'a' }] }), true);
assert.equal(isRoomExpired({ players: [{ uid: 'a' }] }, now), false);
assert.equal(isRoomExpired({ players: [] }, now), true);
assert.equal(isRoomExpired({ presenceMigrationStartedAt: now - EMPTY_ROOM_TTL_MS - 1, players: [{ uid: 'a' }] }, now), true);
const active = stampPlayerPresence({ uid: 'a', name: 'A' }, now);
const stale = stampPlayerPresence({ uid: 'b', name: 'B', isSittingOut: false, folded: false, allIn: false }, now - PLAYER_STALE_MS - 1);
assert.equal(getActivePlayerCount({ players: [active, stale] }, now), 1);
assert.equal(getActivePlayerCount({
  presence: { b: { lastSeenAt: now } },
  players: [{ uid: 'b', name: 'B', isSittingOut: false }],
}, now), 1);
const maintenanceResult = applyRoomMaintenance({
  isPublic: false,
  hostUid: 'b',
  creatorUid: 'b',
  status: 'flop',
  logs: [],
  players: [active, stale],
}, now, 'a');
assert.equal(maintenanceResult.changed, true);
assert.equal(maintenanceResult.shouldAdvance, true);
assert.equal(maintenanceResult.room.hostUid, 'a');
const staleAfter = maintenanceResult.room.players.find((player) => player.uid === 'b');
assert.equal(staleAfter.isSittingOut, true);
assert.equal(staleAfter.folded, true);
assert.equal(staleAfter.hasActed, true);
assert.equal(staleAfter.isOnline, false);

const deck = createDeck();
assert.equal(deck.length, 52);
assert.equal(new Set(deck).size, 52);
assert.equal(evaluate7Cards(['♠A', '♥A'], ['♣A', '♦A', '♠K', '♥2', '♣3']).rankName, '四条');
assert.equal(evaluate7Cards(['♠A', '♥2'], ['♣3', '♦4', '♠5', '♥K', '♣9']).rankName, '顺子');
assert.equal(evaluate7Cards(['♠A', '♠K'], ['♠Q', '♠J', '♠T', '♥2', '♣3']).rankName, '同花顺');

console.log('logic tests passed');
