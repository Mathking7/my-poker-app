import { normalizeGameSettings } from './gameSettings.js';
import { normalizeRoomRetentionPolicy } from './roomLifecycle.js';
import { stampPlayerPresence } from './roomMaintenance.js';

export const ROOM_ID_MIN = 1000;
export const ROOM_ID_COUNT = 9000;

const getCryptoRandomInt = (maxExclusive, cryptoApi = globalThis.crypto) => {
  if (!cryptoApi?.getRandomValues || maxExclusive <= 0) return null;

  const range = 0x100000000;
  const limit = range - (range % maxExclusive);
  const buffer = new Uint32Array(1);

  for (let attempt = 0; attempt < 8; attempt++) {
    cryptoApi.getRandomValues(buffer);
    if (buffer[0] < limit) return buffer[0] % maxExclusive;
  }

  return null;
};

export const createRoomIdCandidate = ({ cryptoApi = globalThis.crypto, random = Math.random } = {}) => {
  const cryptoValue = getCryptoRandomInt(ROOM_ID_COUNT, cryptoApi);
  if (cryptoValue !== null) return String(ROOM_ID_MIN + cryptoValue);

  const fallbackRandom = typeof random === 'function' ? random() : Math.random();
  const fallbackValue = Math.floor(fallbackRandom * ROOM_ID_COUNT);
  const offset = Math.min(ROOM_ID_COUNT - 1, Math.max(0, fallbackValue));

  return String(ROOM_ID_MIN + offset);
};

export const buildInitialRoomData = ({
  roomId,
  user,
  playerName,
  gameType,
  isPublic,
  settings,
  now = Date.now(),
}) => {
  const normalizedSettings = normalizeGameSettings(settings);
  const retentionPolicy = normalizeRoomRetentionPolicy(normalizedSettings.roomRetention, isPublic);

  return {
    id: roomId,
    roomInstanceId: `${roomId}-${now}-${Math.random().toString(36).slice(2, 8)}`,
    hostUid: isPublic ? null : user.uid,
    creatorUid: user.uid,
    createdAt: now,
    updatedAt: now,
    lastHumanActiveAt: now,
    emptySince: null,
    archiveAt: null,
    ttlAt: null,
    lifecycleStatus: 'active',
    retentionPolicy,
    presenceMigrationStartedAt: null,
    status: 'waiting',
    isPaused: false,
    pot: 0,
    currentBet: 0,
    minRaise: 20,
    turnIndex: 0,
    dealerIndex: 0,
    handCount: 0,
    communityCards: [],
    deck: [],
    logs: [`房间创建成功 (房号: ${roomId})`],
    handActions: [],
    handHistory: [],
    handStartedAt: null,
    handSeats: [],
    lastHandSummary: null,
    aiTurnLease: null,
    aiDiagnostics: null,
    gameType,
    isPublic,
    settings: normalizedSettings,
    joinRequests: [],
    players: [stampPlayerPresence({
      uid: user.uid,
      name: playerName,
      chips: normalizedSettings.initialChips,
      hand: [],
      bet: 0,
      folded: false,
      allIn: false,
      hasActed: false,
      isSittingOut: false,
      waitingNextHand: false,
    }, now)],
  };
};
