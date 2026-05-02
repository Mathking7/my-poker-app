import { quantizeChipAmount } from './chipMath.js';

export const MAX_HAND_ACTIONS = 160;
export const MAX_HAND_HISTORY = 24;

export const STREET_LABELS = {
  waiting: '等待',
  'pre-flop': '翻牌前',
  flop: '翻牌',
  turn: '转牌',
  river: '河牌',
  showdown: '摊牌',
};

export const ACTION_LABELS = {
  SB: '小盲',
  BB: '大盲',
  fold: '弃牌',
  check: '过牌',
  call: '跟注',
  raise: '加注',
  allin: '全下',
  timeout: '超时',
};

export const getStreetLabel = (status) => STREET_LABELS[status] || status || '未知轮次';

export const getActionLabel = (actionType) => ACTION_LABELS[actionType] || actionType || '行动';

export const appendHandAction = (room, action) => {
  const nextAction = {
    id: action.id || `${room.handCount || 0}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    handNumber: room.handCount || 0,
    street: room.status || 'waiting',
    streetLabel: getStreetLabel(room.status),
    at: Date.now(),
    ...action,
  };
  room.handActions = [...(room.handActions || []), nextAction].slice(-MAX_HAND_ACTIONS);
  return nextAction;
};

export const createBlindAction = ({ room, player, actionType, amount, now = Date.now() }) => ({
  id: `${room.handCount || 0}:blind:${actionType}:${player?.uid || 'unknown'}`,
  handNumber: room.handCount || 0,
  street: 'pre-flop',
  streetLabel: getStreetLabel('pre-flop'),
  at: now,
  playerUid: player?.uid || '',
  playerName: player?.name || '玩家',
  actionType,
  actionLabel: getActionLabel(actionType),
  amount: quantizeChipAmount(amount || 0, 'floor'),
  totalBet: quantizeChipAmount(player?.bet || 0, 'floor'),
  potAfter: quantizeChipAmount(room.pot || 0, 'floor'),
});

const getPlayerStartSeat = (room, player) => {
  return (room.handSeats || []).find((seat) => seat.uid === player.uid) || null;
};

const buildWinnerSummary = (settlement) => {
  const winners = (settlement?.pots || [])
    .flatMap((pot) => (pot.winners || []).map((winner) => ({
      ...winner,
      potLabel: pot.label,
      potAmount: pot.amount,
    })));
  if (!winners.length) return '无人赢得底池';
  return winners.map((winner) => `${winner.name} +${winner.amount}`).join('，');
};

export const buildHandHistoryEntry = (room = {}, settlement = {}, now = Date.now()) => {
  const players = Array.isArray(room.players) ? room.players : [];
  const activeSeats = players
    .filter((player) => !player.isKicked)
    .map((player, seatIndex) => {
      const startSeat = getPlayerStartSeat(room, player);
      return {
        uid: player.uid,
        name: player.name || '玩家',
        seatIndex,
        isAi: Boolean(player.isAi),
        folded: Boolean(player.folded),
        allIn: Boolean(player.allIn),
        startChips: quantizeChipAmount(startSeat?.startChips ?? player.chips, 'floor'),
        endChips: quantizeChipAmount(player.chips || 0, 'floor'),
        contribution: quantizeChipAmount(player.totalContribution || 0, 'floor'),
        winAmount: quantizeChipAmount(player.winAmount || 0, 'floor'),
        rankName: player.rankName || '',
        shownCards: player.showCards ? (player.hand || []) : [],
      };
    });
  const winners = (settlement?.pots || []).flatMap((pot) => (pot.winners || []).map((winner) => ({
    uid: winner.uid,
    name: winner.name,
    rankName: winner.rankName || '',
    amount: quantizeChipAmount(winner.amount || 0, 'floor'),
    potLabel: pot.label || '底池',
  })));
  const startedAt = room.handStartedAt || room.createdAt || now;
  const summary = buildWinnerSummary(settlement);

  return {
    id: `${room.id || 'room'}-${room.handCount || 0}-${now}`,
    roomId: room.id || '',
    handNumber: room.handCount || 0,
    startedAt,
    endedAt: now,
    status: room.status || 'showdown',
    board: Array.isArray(room.communityCards) ? room.communityCards : [],
    totalPot: quantizeChipAmount(settlement?.totalPot || 0, 'floor'),
    totalAwarded: quantizeChipAmount(settlement?.totalAwarded || 0, 'floor'),
    pots: settlement?.pots || [],
    winners,
    players: activeSeats,
    actions: Array.isArray(room.handActions) ? room.handActions : [],
    summary,
  };
};

export const appendHandHistoryEntry = (room, entry) => {
  room.handHistory = [entry, ...(room.handHistory || [])].slice(0, MAX_HAND_HISTORY);
  room.lastHandSummary = {
    handNumber: entry.handNumber,
    endedAt: entry.endedAt,
    summary: entry.summary,
    totalPot: entry.totalPot,
    winners: entry.winners.slice(0, 4),
  };
  return room.handHistory;
};
