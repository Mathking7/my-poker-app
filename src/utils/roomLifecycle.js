export const PUBLIC_ROOM_RETENTION_POLICY = 'public-empty-30m';
export const DEFAULT_PRIVATE_ROOM_RETENTION = '24h';
export const USER_ROOM_HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const ROOM_HISTORY_SCHEMA_VERSION = 1;

export const ROOM_RETENTION_OPTIONS = [
  { value: '1h', label: '1小时', shortLabel: '1h', durationMs: 60 * 60 * 1000 },
  { value: '24h', label: '24小时', shortLabel: '24h', durationMs: 24 * 60 * 60 * 1000 },
  { value: '7d', label: '7天', shortLabel: '7天', durationMs: 7 * 24 * 60 * 60 * 1000 },
  { value: '30d', label: '30天', shortLabel: '30天', durationMs: 30 * 24 * 60 * 60 * 1000 },
];

export const toLifecycleMillis = (value) => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
};

export const getRetentionOption = (value) => {
  return ROOM_RETENTION_OPTIONS.find((option) => option.value === value) ||
    ROOM_RETENTION_OPTIONS.find((option) => option.value === DEFAULT_PRIVATE_ROOM_RETENTION);
};

export const normalizeRoomRetentionPolicy = (value, isPublic = false) => {
  if (isPublic) return PUBLIC_ROOM_RETENTION_POLICY;
  return getRetentionOption(value)?.value || DEFAULT_PRIVATE_ROOM_RETENTION;
};

export const getRoomRetentionMs = (roomOrPolicy, isPublic = false) => {
  if (typeof roomOrPolicy === 'string') {
    if (roomOrPolicy === PUBLIC_ROOM_RETENTION_POLICY) return 30 * 60 * 1000;
    return getRetentionOption(roomOrPolicy)?.durationMs || getRetentionOption(DEFAULT_PRIVATE_ROOM_RETENTION).durationMs;
  }

  const room = roomOrPolicy || {};
  const policy = room.retentionPolicy ||
    room.settings?.roomRetention ||
    normalizeRoomRetentionPolicy(null, isPublic || room.isPublic);
  return getRoomRetentionMs(policy, isPublic || room.isPublic);
};

export const getRoomRetentionLabel = (roomOrPolicy, isPublic = false) => {
  if (typeof roomOrPolicy === 'string') {
    if (roomOrPolicy === PUBLIC_ROOM_RETENTION_POLICY) return '公开房间空置30分钟';
    return getRetentionOption(roomOrPolicy)?.label || getRetentionOption(DEFAULT_PRIVATE_ROOM_RETENTION).label;
  }

  const room = roomOrPolicy || {};
  if (isPublic || room.isPublic) return '空置30分钟';
  const policy = room.retentionPolicy || room.settings?.roomRetention || DEFAULT_PRIVATE_ROOM_RETENTION;
  return getRetentionOption(policy)?.label || getRetentionOption(DEFAULT_PRIVATE_ROOM_RETENTION).label;
};

export const getRoomLifecycleState = (room = {}, now = Date.now(), options = {}) => {
  const activeHumanCount = Math.max(0, Number(options.activeHumanCount || 0));
  const lastHumanActiveAt = toLifecycleMillis(room.lastHumanActiveAt) ||
    toLifecycleMillis(room.updatedAt) ||
    toLifecycleMillis(room.createdAt) ||
    now;
  const retentionMs = getRoomRetentionMs(room);
  const emptySince = activeHumanCount > 0
    ? 0
    : (toLifecycleMillis(room.emptySince) || lastHumanActiveAt || now);
  const archiveAt = activeHumanCount > 0
    ? 0
    : (toLifecycleMillis(room.archiveAt) || emptySince + retentionMs);
  const ttlAt = activeHumanCount > 0
    ? 0
    : (toLifecycleMillis(room.ttlAt) || archiveAt);
  const isExpired = activeHumanCount <= 0 && ttlAt > 0 && now >= ttlAt;

  return {
    activeHumanCount,
    lastHumanActiveAt,
    emptySince,
    archiveAt,
    ttlAt,
    retentionMs,
    retentionLabel: getRoomRetentionLabel(room),
    status: activeHumanCount > 0 ? 'active' : (isExpired ? 'expired' : 'retaining'),
    isEmpty: activeHumanCount <= 0,
    isExpired,
  };
};

export const applyRoomLifecycle = (room = {}, now = Date.now(), options = {}) => {
  const activeHumanCount = Math.max(0, Number(options.activeHumanCount || 0));
  const retentionPolicy = normalizeRoomRetentionPolicy(
    room.retentionPolicy || room.settings?.roomRetention,
    room.isPublic,
  );
  const retentionMs = getRoomRetentionMs(retentionPolicy, room.isPublic);

  if (activeHumanCount > 0) {
    return {
      ...room,
      retentionPolicy,
      lastHumanActiveAt: now,
      emptySince: null,
      archiveAt: null,
      ttlAt: null,
      lifecycleStatus: 'active',
    };
  }

  const emptySince = toLifecycleMillis(room.emptySince) ||
    toLifecycleMillis(room.lastHumanActiveAt) ||
    toLifecycleMillis(room.updatedAt) ||
    toLifecycleMillis(room.createdAt) ||
    now;
  const archiveAt = emptySince + retentionMs;

  return {
    ...room,
    retentionPolicy,
    emptySince,
    archiveAt,
    ttlAt: archiveAt,
    lifecycleStatus: now >= archiveAt ? 'expired' : 'retaining',
  };
};

export const hasLifecycleChanged = (before = {}, after = {}) => {
  return before.retentionPolicy !== after.retentionPolicy ||
    toLifecycleMillis(before.lastHumanActiveAt) !== toLifecycleMillis(after.lastHumanActiveAt) ||
    toLifecycleMillis(before.emptySince) !== toLifecycleMillis(after.emptySince) ||
    toLifecycleMillis(before.archiveAt) !== toLifecycleMillis(after.archiveAt) ||
    toLifecycleMillis(before.ttlAt) !== toLifecycleMillis(after.ttlAt) ||
    before.lifecycleStatus !== after.lifecycleStatus;
};

const getPlayerDisplayNames = (players = []) => {
  return players
    .filter((player) => !player.isKicked)
    .slice(0, 6)
    .map((player) => player.name || '玩家');
};

const sanitizeRecentHandActions = (actions = [], maxActions = 80) => {
  return actions.slice(-maxActions).map((action) => ({
    id: String(action.id || ''),
    handNumber: Number(action.handNumber || 0),
    street: action.street || '',
    streetLabel: action.streetLabel || '',
    at: toLifecycleMillis(action.at),
    playerUid: action.playerUid || '',
    playerName: action.playerName || '玩家',
    actionType: action.actionType || '',
    actionLabel: action.actionLabel || '',
    amount: Number(action.amount || 0),
    targetBet: Number(action.targetBet || 0),
    totalBet: Number(action.totalBet || 0),
    potAfter: Number(action.potAfter || 0),
    allIn: Boolean(action.allIn),
  }));
};

export const sanitizeRecentHands = (handHistory = [], maxHands = 8) => {
  if (!Array.isArray(handHistory)) return [];
  return handHistory.slice(0, maxHands).map((hand) => ({
    id: String(hand.id || ''),
    roomId: String(hand.roomId || ''),
    handNumber: Number(hand.handNumber || 0),
    startedAt: toLifecycleMillis(hand.startedAt),
    endedAt: toLifecycleMillis(hand.endedAt),
    status: hand.status || 'showdown',
    board: Array.isArray(hand.board) ? hand.board : [],
    totalPot: Number(hand.totalPot || 0),
    totalAwarded: Number(hand.totalAwarded || 0),
    pots: Array.isArray(hand.pots) ? hand.pots : [],
    winners: Array.isArray(hand.winners) ? hand.winners : [],
    players: Array.isArray(hand.players)
      ? hand.players.map((player) => ({
          uid: player.uid || '',
          name: player.name || '玩家',
          isAi: Boolean(player.isAi),
          folded: Boolean(player.folded),
          allIn: Boolean(player.allIn),
          contribution: Number(player.contribution || 0),
          winAmount: Number(player.winAmount || 0),
          rankName: player.rankName || '',
          shownCards: Array.isArray(player.shownCards) ? player.shownCards : [],
        }))
      : [],
    actions: sanitizeRecentHandActions(hand.actions || []),
    summary: hand.summary || '',
  }));
};

export const getRecentHandIdentity = (hand = {}) => {
  if (hand.id) return String(hand.id);
  return `${Number(hand.handNumber || 0)}:${toLifecycleMillis(hand.endedAt) || ''}`;
};

const getExistingPersonalHand = (existingRecentHands = [], hand = {}) => {
  const handIdentity = getRecentHandIdentity(hand);
  return existingRecentHands.find((existingHand) => (
    getRecentHandIdentity(existingHand) === handIdentity ||
    (
      Number(existingHand.handNumber || 0) === Number(hand.handNumber || 0) &&
      toLifecycleMillis(existingHand.endedAt) === toLifecycleMillis(hand.endedAt)
    )
  )) || null;
};

const sanitizeHeroCards = (cards = []) => {
  return Array.isArray(cards)
    ? cards.filter(Boolean).slice(0, 2).map((card) => String(card))
    : [];
};

const shouldReadHeroCardsFromCurrentRoom = (room = {}, hand = {}) => {
  if (!hand?.handNumber) return false;
  if (Number(room.handCount || 0) !== Number(hand.handNumber || 0)) return false;
  return room.status === 'showdown' || Boolean(room.settlement?.id);
};

const buildPersonalRecentHands = (room = {}, uid, options = {}) => {
  const recentHands = sanitizeRecentHands(room.handHistory || [], options.maxHands || 8);
  if (!uid || !recentHands.length) return recentHands;

  const players = Array.isArray(room.players) ? room.players : [];
  const currentPlayer = players.find((player) => player.uid === uid);
  const existingRecentHands = Array.isArray(options.existingRecentHands) ? options.existingRecentHands : [];

  return recentHands.map((hand) => {
    const existingHand = getExistingPersonalHand(existingRecentHands, hand);
    const publicHero = (hand.players || []).find((player) => player.uid === uid);
    const existingHeroCards = sanitizeHeroCards(existingHand?.heroCards);
    const roomHeroCards = shouldReadHeroCardsFromCurrentRoom(room, hand)
      ? sanitizeHeroCards(currentPlayer?.hand)
      : [];
    const heroCards = existingHeroCards.length ? existingHeroCards : roomHeroCards;

    return {
      ...hand,
      heroCards,
      heroPlayerUid: uid,
      heroPlayerName: publicHero?.name || currentPlayer?.name || existingHand?.heroPlayerName || '',
      heroRankName: publicHero?.rankName || existingHand?.heroRankName || '',
    };
  });
};

export const mergePersonalRecentHands = (handHistory = [], personalRecentHands = []) => {
  if (!Array.isArray(handHistory)) return [];
  if (!Array.isArray(personalRecentHands) || personalRecentHands.length === 0) return handHistory;

  return handHistory.map((hand) => {
    const personalHand = getExistingPersonalHand(personalRecentHands, hand);
    const heroCards = sanitizeHeroCards(personalHand?.heroCards);
    if (!heroCards.length) return hand;

    return {
      ...hand,
      heroCards,
      heroPlayerUid: personalHand.heroPlayerUid || '',
      heroPlayerName: personalHand.heroPlayerName || '',
      heroRankName: personalHand.heroRankName || '',
    };
  });
};

export const buildPublicRoomIndex = (room = {}, now = Date.now(), options = {}) => {
  const lifecycle = getRoomLifecycleState(room, now, options);
  const visible = Boolean(room.isPublic && room.id && !lifecycle.isExpired && lifecycle.activeHumanCount > 0);
  if (!visible) return null;

  const players = Array.isArray(room.players) ? room.players : [];
  return {
    id: String(room.id),
    roomId: String(room.id),
    roomInstanceId: String(room.roomInstanceId || room.id),
    gameType: room.gameType || 'texas',
    status: room.status || 'waiting',
    createdAt: toLifecycleMillis(room.createdAt) || now,
    updatedAt: toLifecycleMillis(room.updatedAt) || now,
    lastHumanActiveAt: lifecycle.lastHumanActiveAt,
    activePlayerCount: lifecycle.activeHumanCount,
    totalPlayerCount: players.filter((player) => !player.isKicked).length,
    maxPlayers: 9,
    handCount: Number(room.handCount || 0),
    pot: Number(room.pot || 0),
    isPublic: true,
    hasAi: players.some((player) => player.isAi),
    playerNames: getPlayerDisplayNames(players),
    retentionLabel: lifecycle.retentionLabel,
  };
};

export const buildUserRoomHistory = (room = {}, uid, now = Date.now(), options = {}) => {
  if (!uid || !room?.id) return null;
  const lifecycle = getRoomLifecycleState(room, now, options);
  const players = Array.isArray(room.players) ? room.players : [];
  const currentPlayer = players.find((player) => player.uid === uid);

  return {
    id: String(room.id),
    roomId: String(room.id),
    roomInstanceId: String(room.roomInstanceId || room.id),
    isPublic: Boolean(room.isPublic),
    gameType: room.gameType || 'texas',
    status: room.status || 'waiting',
    createdAt: toLifecycleMillis(room.createdAt) || now,
    updatedAt: toLifecycleMillis(room.updatedAt) || now,
    lastVisitedAt: now,
    lastHumanActiveAt: lifecycle.lastHumanActiveAt,
    expiresAt: lifecycle.ttlAt || null,
    canRejoin: !lifecycle.isExpired,
    retentionLabel: lifecycle.retentionLabel,
    handCount: Number(room.handCount || 0),
    playerName: currentPlayer?.name || '',
    activePlayerCount: lifecycle.activeHumanCount,
    totalPlayerCount: players.filter((player) => !player.isKicked).length,
    playerNames: getPlayerDisplayNames(players),
    lastHandSummary: room.lastHandSummary || null,
    historySchemaVersion: ROOM_HISTORY_SCHEMA_VERSION,
    recentHands: buildPersonalRecentHands(room, uid, {
      existingRecentHands: options.existingRecentHands,
    }),
    historyTtlAt: now + USER_ROOM_HISTORY_RETENTION_MS,
  };
};
