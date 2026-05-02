import { normalizeGameSettings } from './gameSettings.js';
import { normalizeRoomRetentionPolicy } from './roomLifecycle.js';

export const POKER_STATUSES = new Set(['waiting', 'pre-flop', 'flop', 'turn', 'river', 'showdown']);

const toFiniteNumber = (value, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const normalizeBoolean = (value, fallback = false) => {
  return typeof value === 'boolean' ? value : fallback;
};

export const normalizePokerPlayer = (player = {}) => ({
  ...player,
  uid: String(player.uid || ''),
  name: String(player.name || 'Player'),
  chips: Math.max(0, toFiniteNumber(player.chips)),
  hand: Array.isArray(player.hand) ? player.hand : [],
  bet: Math.max(0, toFiniteNumber(player.bet)),
  folded: normalizeBoolean(player.folded),
  allIn: normalizeBoolean(player.allIn),
  hasActed: normalizeBoolean(player.hasActed),
  isSittingOut: normalizeBoolean(player.isSittingOut),
  waitingNextHand: normalizeBoolean(player.waitingNextHand),
  isAi: normalizeBoolean(player.isAi),
  isKicked: normalizeBoolean(player.isKicked),
  isOnline: normalizeBoolean(player.isOnline),
  disconnectedAt: player.disconnectedAt ?? null,
  lastAction: player.lastAction ?? null,
  totalContribution: Math.max(0, toFiniteNumber(player.totalContribution)),
  showCards: normalizeBoolean(player.showCards),
  showSequence: player.showSequence == null ? -1 : toFiniteNumber(player.showSequence, -1),
  highlightCards: Array.isArray(player.highlightCards) ? player.highlightCards : [],
  winAmount: Math.max(0, toFiniteNumber(player.winAmount)),
});

export const normalizePokerRoom = (room = {}, { roomId = room.id } = {}) => {
  const status = POKER_STATUSES.has(room.status) ? room.status : 'waiting';
  const players = Array.isArray(room.players) ? room.players.map(normalizePokerPlayer) : [];

  return {
    ...room,
    id: String(room.id || roomId || ''),
    roomInstanceId: String(room.roomInstanceId || room.id || roomId || ''),
    hostUid: room.hostUid ?? null,
    creatorUid: room.creatorUid || room.hostUid || '',
    createdAt: toFiniteNumber(room.createdAt, Date.now()),
    updatedAt: toFiniteNumber(room.updatedAt, room.createdAt || Date.now()),
    lastHumanActiveAt: room.lastHumanActiveAt ?? room.updatedAt ?? room.createdAt ?? null,
    emptySince: room.emptySince ?? null,
    archiveAt: room.archiveAt ?? null,
    ttlAt: room.ttlAt ?? null,
    lifecycleStatus: room.lifecycleStatus || 'active',
    retentionPolicy: normalizeRoomRetentionPolicy(room.retentionPolicy || room.settings?.roomRetention, room.isPublic),
    status,
    isPublic: normalizeBoolean(room.isPublic),
    isPaused: normalizeBoolean(room.isPaused),
    pot: Math.max(0, toFiniteNumber(room.pot)),
    currentBet: Math.max(0, toFiniteNumber(room.currentBet)),
    minRaise: Math.max(0, toFiniteNumber(room.minRaise, 20)),
    turnIndex: toFiniteNumber(room.turnIndex, 0),
    dealerIndex: toFiniteNumber(room.dealerIndex, 0),
    handCount: Math.max(0, toFiniteNumber(room.handCount)),
    communityCards: Array.isArray(room.communityCards) ? room.communityCards : [],
    deck: Array.isArray(room.deck) ? room.deck : [],
    logs: Array.isArray(room.logs) ? room.logs : [],
    handActions: Array.isArray(room.handActions) ? room.handActions : [],
    handHistory: Array.isArray(room.handHistory) ? room.handHistory : [],
    handStartedAt: room.handStartedAt ?? null,
    handSeats: Array.isArray(room.handSeats) ? room.handSeats : [],
    lastHandSummary: room.lastHandSummary || null,
    settings: normalizeGameSettings(room.settings),
    joinRequests: Array.isArray(room.joinRequests) ? room.joinRequests : [],
    players,
    transition: room.transition || null,
    settlement: room.settlement || null,
    allInRunout: normalizeBoolean(room.allInRunout),
    lastAggressorUid: room.lastAggressorUid ?? null,
    handAggressorUid: room.handAggressorUid ?? null,
    aiTurnLease: room.aiTurnLease || null,
    aiDiagnostics: room.aiDiagnostics || null,
  };
};
