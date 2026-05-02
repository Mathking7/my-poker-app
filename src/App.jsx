import React, { useCallback, useState, useEffect } from 'react';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';

import { auth, isFirebaseInitialized } from './firebase';
import Lobby from './components/Lobby';
import PokerGame from './components/PokerGame';
import {
  getActivePlayerCount,
  isRoomExpired,
  isPlayerActive,
  shouldMarkLegacyRoom,
  stampJoinRequestPresence,
  stampPlayerPresence,
} from './utils/roomMaintenance';
import { MAX_PLAYERS, isJoinableStatus, normalizeGameSettings } from './utils/gameSettings';
import { buildInitialRoomData, createRoomIdCandidate } from './utils/roomCreation';
import { normalizePokerRoom } from './utils/pokerRoomSchema';
import {
  applyRoomLifecycle,
  buildPublicRoomIndex,
  buildUserRoomHistory,
  getRoomLifecycleState,
  hasLifecycleChanged,
} from './utils/roomLifecycle';
import {
  deletePublicRoomIndexDocument,
  deleteUserRoomHistoryDocument,
  getPublicRoomIndexSnapshot,
  getRoomSnapshot,
  getRoomsSnapshot,
  getUserRoomHistorySnapshot,
  mergeRoomDocument,
  runRoomTransaction,
  setPublicRoomIndexDocument,
  setUserRoomHistoryDocument,
  subscribeRoom,
} from './services/roomRepository';
import { deleteRoomWithIndexes } from './services/roomLifecycleActions';

export default function App() {
  const [user, setUser] = useState(null);
  const [activeRoomId, setActiveRoomId] = useState('');
  const [roomData, setRoomData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const syncPublicRoomIndex = useCallback(async (room, now = Date.now(), activeHumanCount = null) => {
    if (!room?.id) return;
    const activeCount = activeHumanCount ?? getActivePlayerCount(room, now);
    const indexData = buildPublicRoomIndex(room, now, { activeHumanCount: activeCount });
    if (indexData) {
      await setPublicRoomIndexDocument(room.id, indexData, { merge: true });
    } else if (room.isPublic) {
      await deletePublicRoomIndexDocument(room.id).catch(() => {});
    }
  }, []);

  const syncUserRoomHistory = useCallback(async (room, uid, now = Date.now(), activeHumanCount = null) => {
    if (!room?.id || !uid) return;
    const activeCount = activeHumanCount ?? getActivePlayerCount(room, now, uid);
    const historyData = buildUserRoomHistory(room, uid, now, { activeHumanCount: activeCount });
    if (historyData) {
      await setUserRoomHistoryDocument(uid, room.id, historyData, { merge: true });
    }
  }, []);

  const applyLifecycleMaintenance = useCallback(async (roomRef, room, now = Date.now(), activeHumanCount = null) => {
    const activeCount = activeHumanCount ?? getActivePlayerCount(room, now);
    const lifecycleRoom = applyRoomLifecycle(room, now, { activeHumanCount: activeCount });
    if (!hasLifecycleChanged(room, lifecycleRoom)) return lifecycleRoom;
    await mergeRoomDocument(roomRef, {
      retentionPolicy: lifecycleRoom.retentionPolicy,
      lastHumanActiveAt: lifecycleRoom.lastHumanActiveAt ?? null,
      emptySince: lifecycleRoom.emptySince ?? null,
      archiveAt: lifecycleRoom.archiveAt ?? null,
      ttlAt: lifecycleRoom.ttlAt ?? null,
      lifecycleStatus: lifecycleRoom.lifecycleStatus,
      updatedAt: now,
    });
    return lifecycleRoom;
  }, []);

  const sweepExpiredRooms = useCallback(async () => {
    const now = Date.now();
    const snapshot = await getRoomsSnapshot();
    for (const roomDoc of snapshot.docs) {
      const data = normalizePokerRoom(roomDoc.data(), { roomId: roomDoc.id });
      const activeHumanCount = getActivePlayerCount(data, now);
      const lifecycleRoom = applyRoomLifecycle(data, now, { activeHumanCount });
      const lifecycle = getRoomLifecycleState(lifecycleRoom, now, { activeHumanCount });
      if (isRoomExpired(lifecycleRoom, now) || lifecycle.isExpired) {
        await deleteRoomWithIndexes(roomDoc.ref, roomDoc.id);
      } else if (shouldMarkLegacyRoom(data)) {
        await mergeRoomDocument(roomDoc.ref, { presenceMigrationStartedAt: now, updatedAt: now });
      } else if (hasLifecycleChanged(data, lifecycleRoom)) {
        await applyLifecycleMaintenance(roomDoc.ref, data, now, activeHumanCount);
      }
      await syncPublicRoomIndex(lifecycleRoom, now, activeHumanCount).catch(() => {});
    }
  }, [applyLifecycleMaintenance, syncPublicRoomIndex]);

  useEffect(() => {
    if (!isFirebaseInitialized) return;
    const initAuth = async () => {
      try { await signInAnonymously(auth); } catch (err) { console.error("Auth Error:", err); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isFirebaseInitialized || !user || activeRoomId) return;
    sweepExpiredRooms().catch((err) => console.error("Room Sweep Error:", err));
    const intervalId = setInterval(() => {
      sweepExpiredRooms().catch((err) => console.error("Room Sweep Error:", err));
    }, 60 * 1000);
    return () => clearInterval(intervalId);
  }, [user, activeRoomId, sweepExpiredRooms]);

  useEffect(() => {
    if (!isFirebaseInitialized || !user || !activeRoomId) return;
    let isCurrentSubscription = true;
    const unsubscribe = subscribeRoom(activeRoomId, (docSnap) => {
      if (!isCurrentSubscription) return;
      if (docSnap.exists()) {
        const nextRoomData = normalizePokerRoom(docSnap.data(), { roomId: activeRoomId });
        if (nextRoomData.id !== activeRoomId) {
          console.warn("Room id mismatch, ignoring stale room data", { activeRoomId, dataId: nextRoomData.id });
          setRoomData(null);
          return;
        }
        setRoomData(nextRoomData);
      } else {
        setErrorMsg('房间不存在或已解散');
        setActiveRoomId('');
        setRoomData(null);
      }
    }, (err) => {
      console.error("Snapshot Error:", err);
    });
    return () => {
      isCurrentSubscription = false;
      unsubscribe();
    };
  }, [user, activeRoomId]);

  // 公开大厅只读取公开索引；私密房间必须知道房号或出现在自己的历史记录里。
  const handleFetchPublicRooms = async (gameType = 'texas') => {
    try {
      const now = Date.now();
      let snapshot = await getPublicRoomIndexSnapshot();
      if (snapshot.empty) {
        await sweepExpiredRooms();
        snapshot = await getPublicRoomIndexSnapshot();
      }
      const rooms = [];
      for (const indexDoc of snapshot.docs) {
        const indexData = indexDoc.data();
        if (indexData.gameType && indexData.gameType !== gameType) continue;
        const roomId = indexData.roomId || indexData.id || indexDoc.id;
        const roomSnap = await getRoomSnapshot(roomId);
        if (!roomSnap.exists()) {
          await deletePublicRoomIndexDocument(roomId).catch(() => {});
          continue;
        }
        const data = normalizePokerRoom(roomSnap.data(), { roomId });
        const activeHumanCount = getActivePlayerCount(data, now);
        if (isRoomExpired(data, now)) {
          await deleteRoomWithIndexes(roomId, roomId);
          continue;
        }
        const lifecycleRoom = await applyLifecycleMaintenance(roomId, data, now, activeHumanCount);
        const publicIndex = buildPublicRoomIndex(lifecycleRoom, now, { activeHumanCount });
        if (publicIndex && publicIndex.gameType === gameType) {
          await setPublicRoomIndexDocument(roomId, publicIndex, { merge: true });
          rooms.push(publicIndex);
        } else {
          await deletePublicRoomIndexDocument(roomId).catch(() => {});
        }
      }
      return rooms.sort((a, b) => (b.lastHumanActiveAt || b.updatedAt || 0) - (a.lastHumanActiveAt || a.updatedAt || 0));
    } catch (err) {
      console.error(err);
      return [];
    }
  };

  const handleFetchRoomHistory = async () => {
    if (!user?.uid) return [];
    try {
      const now = Date.now();
      const snapshot = await getUserRoomHistorySnapshot(user.uid);
      const history = [];
      for (const historyDoc of snapshot.docs) {
        const saved = historyDoc.data();
        const hasSavedHands = Boolean(saved.lastHandSummary || saved.recentHands?.length);
        if (saved.historyTtlAt && saved.historyTtlAt < now) {
          await deleteUserRoomHistoryDocument(user.uid, historyDoc.id).catch(() => {});
          continue;
        }
        const roomId = saved.roomId || saved.id || historyDoc.id;
        const roomSnap = await getRoomSnapshot(roomId);
        if (!roomSnap.exists()) {
          if (!hasSavedHands) {
            await deleteUserRoomHistoryDocument(user.uid, roomId).catch(() => {});
            continue;
          }
          const deletedHistory = {
            ...saved,
            roomId,
            id: roomId,
            canRejoin: false,
            lifecycleStatus: saved.lifecycleStatus === 'deleted' ? 'deleted' : 'expired',
            roomDeletedAt: saved.roomDeletedAt || now,
          };
          await setUserRoomHistoryDocument(user.uid, roomId, deletedHistory, { merge: true }).catch(() => {});
          history.push(deletedHistory);
          continue;
        }
        const room = normalizePokerRoom(roomSnap.data(), { roomId });
        const isReusedRoomId = Boolean(
          saved.roomInstanceId &&
          room.roomInstanceId &&
          saved.roomInstanceId !== room.roomInstanceId
        );
        if (isReusedRoomId) {
          if (!hasSavedHands) {
            await deleteUserRoomHistoryDocument(user.uid, roomId).catch(() => {});
            continue;
          }
          const endedHistory = {
            ...saved,
            roomId,
            id: roomId,
            canRejoin: false,
            lifecycleStatus: 'ended',
            roomReused: true,
          };
          await setUserRoomHistoryDocument(user.uid, roomId, endedHistory, { merge: true }).catch(() => {});
          history.push(endedHistory);
          continue;
        }
        const activeHumanCount = getActivePlayerCount(room, now);
        if (isRoomExpired(room, now)) {
          await deleteRoomWithIndexes(roomId, roomId);
          if (!hasSavedHands) {
            await deleteUserRoomHistoryDocument(user.uid, roomId).catch(() => {});
            continue;
          }
          const expiredHistory = { ...saved, roomId, id: roomId, canRejoin: false, lifecycleStatus: 'expired' };
          await setUserRoomHistoryDocument(user.uid, roomId, expiredHistory, { merge: true }).catch(() => {});
          history.push(expiredHistory);
          continue;
        }
        const lifecycleRoom = await applyLifecycleMaintenance(roomId, room, now, activeHumanCount);
        const nextHistory = buildUserRoomHistory(lifecycleRoom, user.uid, saved.lastVisitedAt || now, {
          activeHumanCount,
          existingRecentHands: saved.recentHands,
        });
        history.push(nextHistory || { ...saved, roomId, id: roomId });
      }
      return history
        .filter(Boolean)
        .sort((a, b) => (b.lastVisitedAt || b.updatedAt || 0) - (a.lastVisitedAt || a.updatedAt || 0))
        .slice(0, 20);
    } catch (err) {
      console.error('Room History Error:', err);
      return [];
    }
  };

  const createRoomDocument = async (buildRoomData) => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const candidate = createRoomIdCandidate();
      const createdRoom = await runRoomTransaction(candidate, async (transaction, roomRef) => {
        const existingRoom = await transaction.get(roomRef);
        const now = Date.now();
        if (existingRoom.exists() && !isRoomExpired(existingRoom.data(), now)) return null;

        const data = buildRoomData(candidate, now);
        transaction.set(roomRef, data);
        return { id: candidate, data };
      });
      if (createdRoom) return createdRoom;
    }
    throw new Error('Unable to allocate a unique room id');
  };

  const handleCreateRoom = async (playerName, gameType, isPublic, settings) => {
    if (!user) {
      setErrorMsg('登录尚未完成，请稍后再试');
      return false;
    }
    try {
      const createdRoom = await createRoomDocument((newRoomId, now) => buildInitialRoomData({
        roomId: newRoomId,
        user,
        playerName,
        gameType,
        isPublic,
        settings,
        now,
      }));
      setErrorMsg('');
      setRoomData(createdRoom.data);
      setActiveRoomId(createdRoom.id);
      await Promise.allSettled([
        syncPublicRoomIndex(createdRoom.data, Date.now(), 1),
        syncUserRoomHistory(createdRoom.data, user.uid, Date.now(), 1),
      ]);
      return true;
    } catch (err) {
      console.error("Create Room Error:", err);
      setErrorMsg('创建失败');
      return false;
    }
  };

  const handleJoinRoom = async (playerName, joinRoomId) => {
    const normalizedRoomId = joinRoomId.trim().toUpperCase();
    if (!playerName.trim() || !normalizedRoomId) return false;
    if (!user) {
      setErrorMsg('登录尚未完成，请稍后再试');
      return false;
    }
    try {
      const now = Date.now();
      const docSnap = await getRoomSnapshot(normalizedRoomId);
      if (docSnap.exists()) {
        const data = normalizePokerRoom(docSnap.data(), { roomId: normalizedRoomId });
        const roomSettings = normalizeGameSettings(data.settings);
        const players = data.players || [];
        const existingPlayer = players.find(p => p.uid === user.uid);
        if (isRoomExpired(data, now)) {
          await deleteRoomWithIndexes(normalizedRoomId, normalizedRoomId);
          setErrorMsg('房间已过期并被清理');
          return false;
        }
        if (!existingPlayer && players.length >= MAX_PLAYERS) {
          setErrorMsg('房间人数已满');
          return false;
        }
        if (!existingPlayer && !isJoinableStatus(data.status) && !roomSettings.allowJoinDuringGame) {
          setErrorMsg('该房间正在对局中，且不允许中途加入');
          return false;
        }
        if (!data.isPublic && !data.hostUid) {
          const activeHost = players.find(p => isPlayerActive(p, now, null, data));
          if (activeHost) {
            data.hostUid = activeHost.uid;
            await mergeRoomDocument(normalizedRoomId, { hostUid: activeHost.uid, updatedAt: now });
          }
        }
        if (!data.isPublic && data.hostUid && !existingPlayer) {
           const existingRequests = data.joinRequests || [];
           const nextRequest = stampJoinRequestPresence({ uid: user.uid, name: playerName, requestedAt: now }, now);
           const newRequests = existingRequests.some(req => req.uid === user.uid)
             ? existingRequests.map(req => req.uid === user.uid ? { ...req, ...nextRequest } : req)
             : [...existingRequests, nextRequest];
           const requestedRoom = {
             ...data,
             joinRequests: newRequests,
             lastHumanActiveAt: now,
             emptySince: null,
             archiveAt: null,
             ttlAt: null,
             lifecycleStatus: 'active',
             updatedAt: now,
           };
           await mergeRoomDocument(normalizedRoomId, {
             joinRequests: newRequests,
             lastHumanActiveAt: now,
             emptySince: null,
             archiveAt: null,
             ttlAt: null,
             lifecycleStatus: 'active',
             updatedAt: now,
           });
           await syncUserRoomHistory(requestedRoom, user.uid, now, getActivePlayerCount(requestedRoom, now, user.uid));
           setErrorMsg('');
           setRoomData(null);
           setActiveRoomId(normalizedRoomId);
           return true;
        }
        if (existingPlayer) {
          const newPlayers = players.map(p => {
            if (p.uid !== user.uid) return p;
            const isMidHand = !isJoinableStatus(data.status);
            return stampPlayerPresence({
              ...p,
              name: playerName,
              isSittingOut: isMidHand ? p.isSittingOut : false,
              folded: isMidHand ? true : false,
              hasActed: isMidHand ? true : false,
              waitingNextHand: isMidHand,
            }, now);
          });
          const nextRoom = {
            ...data,
            hostUid: !data.isPublic && !data.hostUid ? user.uid : data.hostUid,
            players: newPlayers,
            lastHumanActiveAt: now,
            emptySince: null,
            archiveAt: null,
            ttlAt: null,
            lifecycleStatus: 'active',
            updatedAt: now,
          };
          await mergeRoomDocument(normalizedRoomId, {
            hostUid: !data.isPublic && !data.hostUid ? user.uid : data.hostUid,
            players: newPlayers,
            lastHumanActiveAt: now,
            emptySince: null,
            archiveAt: null,
            ttlAt: null,
            lifecycleStatus: 'active',
            updatedAt: now,
          });
          await Promise.allSettled([
            syncPublicRoomIndex(nextRoom, now, getActivePlayerCount(nextRoom, now, user.uid)),
            syncUserRoomHistory(nextRoom, user.uid, now, getActivePlayerCount(nextRoom, now, user.uid)),
          ]);
        } else {
          const isMidHand = !isJoinableStatus(data.status);
          const newPlayers = [...players, { 
            uid: user.uid, name: playerName, chips: roomSettings.initialChips, 
            hand: [], bet: 0, folded: isMidHand, allIn: false, hasActed: isMidHand, isSittingOut: false, waitingNextHand: isMidHand,
            lastSeenAt: now, disconnectedAt: null, isOnline: true
          }];
          const nextRoom = {
            ...data,
            hostUid: !data.isPublic && !data.hostUid ? user.uid : data.hostUid,
            players: newPlayers,
            settings: roomSettings,
            logs: [...(data.logs || []), `${playerName} ${isMidHand ? '加入观战，将在下一局入座。' : '加入了房间。'}`],
            lastHumanActiveAt: now,
            emptySince: null,
            archiveAt: null,
            ttlAt: null,
            lifecycleStatus: 'active',
            updatedAt: now,
          };
          await mergeRoomDocument(normalizedRoomId, {
            hostUid: !data.isPublic && !data.hostUid ? user.uid : data.hostUid,
            players: newPlayers,
            settings: roomSettings,
            logs: nextRoom.logs,
            lastHumanActiveAt: now,
            emptySince: null,
            archiveAt: null,
            ttlAt: null,
            lifecycleStatus: 'active',
            updatedAt: now,
          });
          await Promise.allSettled([
            syncPublicRoomIndex(nextRoom, now, getActivePlayerCount(nextRoom, now, user.uid)),
            syncUserRoomHistory(nextRoom, user.uid, now, getActivePlayerCount(nextRoom, now, user.uid)),
          ]);
        }
        setErrorMsg('');
        setRoomData(null);
        setActiveRoomId(normalizedRoomId);
        return true;
      } else {
        setErrorMsg('房间不存在');
        return false;
      }
    } catch (err) {
      console.error("Join Room Error:", err);
      setErrorMsg('加入失败');
      return false;
    }
  };

  const activeRoomData = roomData?.id === activeRoomId && Array.isArray(roomData?.players) ? roomData : null;
  const handleLeaveRoom = () => {
    setActiveRoomId('');
    setRoomData(null);
    setErrorMsg('');
  };

  if (!activeRoomId || !activeRoomData) {
    return (
      <Lobby
        user={user}
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
        onFetchPublicRooms={handleFetchPublicRooms}
        onFetchRoomHistory={handleFetchRoomHistory}
        errorMsg={errorMsg}
      />
    );
  }
  return <PokerGame user={user} roomId={activeRoomId} roomData={activeRoomData} onLeaveRoom={handleLeaveRoom} />;
}
