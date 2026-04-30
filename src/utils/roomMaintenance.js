export const PRESENCE_HEARTBEAT_MS = 15000;
export const PLAYER_STALE_MS = 45000;
export const EMPTY_ROOM_TTL_MS = 3 * 60 * 1000;

export const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
};

export const isGameInProgress = (status) => status !== 'waiting' && status !== 'showdown';

export const stampPlayerPresence = (player, now = Date.now()) => ({
  ...player,
  lastSeenAt: now,
  disconnectedAt: null,
  isOnline: true,
});

export const stampJoinRequestPresence = (request, now = Date.now()) => ({
  ...request,
  lastSeenAt: now,
});

export const getPresenceEntry = (room, uid) => {
  return room?.presence?.[uid] || null;
};

export const getPlayerLastSeenAt = (room, player) => {
  const presenceLastSeenAt = toMillis(getPresenceEntry(room, player?.uid)?.lastSeenAt);
  return presenceLastSeenAt || toMillis(player?.lastSeenAt);
};

export const isPlayerActive = (player, now = Date.now(), activeUid = null, room = null) => {
  if (!player) return false;
  if (player.isAi) return false;
  if (activeUid && player.uid === activeUid) return true;
  const lastSeenAt = getPlayerLastSeenAt(room, player);
  return lastSeenAt > 0 && now - lastSeenAt <= PLAYER_STALE_MS;
};

export const getActivePlayers = (room, now = Date.now(), activeUid = null) => {
  return (room?.players || []).filter((player) => isPlayerActive(player, now, activeUid, room));
};

export const getActivePlayerCount = (room, now = Date.now(), activeUid = null) => {
  return getActivePlayers(room, now, activeUid).length;
};

export const hasPresenceData = (room) => {
  return (room?.players || []).some((player) => !player.isAi && getPlayerLastSeenAt(room, player) > 0);
};

export const shouldMarkLegacyRoom = (room) => {
  return Boolean(room?.players?.length) && !hasPresenceData(room) && !toMillis(room.presenceMigrationStartedAt);
};

export const getLastRoomPresenceAt = (room) => {
  const playerTimes = (room?.players || []).map((player) => getPlayerLastSeenAt(room, player));
  return Math.max(0, ...playerTimes);
};

export const isRoomExpired = (room, now = Date.now()) => {
  const players = room?.players || [];
  if (players.length === 0) return true;
  if (getActivePlayerCount(room, now) > 0) return false;

  const lastPresenceAt = getLastRoomPresenceAt(room);
  if (lastPresenceAt > 0) return now - lastPresenceAt > EMPTY_ROOM_TTL_MS;

  const migrationStartedAt = toMillis(room?.presenceMigrationStartedAt);
  return migrationStartedAt > 0 && now - migrationStartedAt > EMPTY_ROOM_TTL_MS;
};

const appendMaintenanceLog = (logs = [], message) => {
  const nextLogs = [...logs, message];
  return nextLogs.length > 50 ? nextLogs.slice(nextLogs.length - 50) : nextLogs;
};

export const getMaintenanceManagerUid = (room, now = Date.now(), activeUid = null) => {
  const activePlayers = getActivePlayers(room, now, activeUid);
  if (activePlayers.length === 0) return null;

  const activeUids = new Set(activePlayers.map((player) => player.uid));
  const preferredOrder = [
    room?.hostUid,
    room?.creatorUid,
    ...(room?.players || []).map((player) => player.uid),
  ].filter(Boolean);

  return preferredOrder.find((uid) => activeUids.has(uid)) || activePlayers[0].uid;
};

export const applyRoomMaintenance = (room, now = Date.now(), activeUid = null) => {
  const players = room?.players || [];
  if (players.length === 0) {
    return { room, changed: false, shouldAdvance: false, stalePlayerNames: [] };
  }

  let changed = false;
  let shouldAdvance = false;
  const stalePlayerNames = [];
  const statusInProgress = isGameInProgress(room.status);

  const nextPlayers = players.map((player) => {
    if (player.isAi) return player;

    if (player.uid === activeUid) {
      if (!isPlayerActive(player, now, activeUid) || player.isOnline !== true) {
        changed = true;
        return stampPlayerPresence(player, now);
      }
      return player;
    }

    const lastSeenAt = getPlayerLastSeenAt(room, player);
    const migrationStartedAt = toMillis(room.presenceMigrationStartedAt);
    const isKnownStale = lastSeenAt > 0 && now - lastSeenAt > PLAYER_STALE_MS;
    const isLegacyStale = lastSeenAt === 0 && migrationStartedAt > 0 && now - migrationStartedAt > PLAYER_STALE_MS;
    const shouldMarkStale = isKnownStale || isLegacyStale;
    if (!shouldMarkStale) return player;

    const nextPlayer = { ...player, isOnline: false, disconnectedAt: player.disconnectedAt || now };
    let playerChanged = player.isOnline !== false || !player.disconnectedAt;

    if (!player.isSittingOut) {
      nextPlayer.isSittingOut = true;
      playerChanged = true;
      stalePlayerNames.push(player.name || '未知玩家');
    }

    if (statusInProgress && !player.folded && !player.allIn) {
      nextPlayer.folded = true;
      nextPlayer.hasActed = true;
      nextPlayer.lastAction = 'fold';
      shouldAdvance = true;
      playerChanged = true;
    }

    if (playerChanged) changed = true;
    return nextPlayer;
  });

  let nextRoom = changed ? { ...room, players: nextPlayers, updatedAt: now } : room;

  if (!toMillis(room.presenceMigrationStartedAt) && nextPlayers.some((player) => !player.isAi && getPlayerLastSeenAt(room, player) === 0)) {
    nextRoom = {
      ...nextRoom,
      presenceMigrationStartedAt: now,
      updatedAt: now,
    };
    changed = true;
  }

  if (!room.isPublic && (!room.hostUid || !isPlayerActive(nextPlayers.find((player) => player.uid === room.hostUid), now, activeUid, room))) {
    const nextHost = nextPlayers.find((player) => isPlayerActive(player, now, activeUid, room));
    if (nextHost && nextHost.uid !== room.hostUid) {
      nextRoom = {
        ...nextRoom,
        hostUid: nextHost.uid,
        updatedAt: now,
      };
      changed = true;
    }
  }

  if (stalePlayerNames.length > 0) {
    nextRoom = {
      ...nextRoom,
      logs: appendMaintenanceLog(nextRoom.logs, `系统检测到 ${stalePlayerNames.join('、')} 已离线，自动转为观战。`),
      updatedAt: now,
    };
  }

  return { room: nextRoom, changed, shouldAdvance, stalePlayerNames };
};
