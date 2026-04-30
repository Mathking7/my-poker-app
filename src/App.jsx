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
  deleteRoomDocument,
  getRoomSnapshot,
  getRoomsSnapshot,
  mergeRoomDocument,
  runRoomTransaction,
  subscribeRoom,
} from './services/roomRepository';

export default function App() {
  const [user, setUser] = useState(null);
  const [activeRoomId, setActiveRoomId] = useState('');
  const [roomData, setRoomData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const sweepExpiredRooms = useCallback(async () => {
    const now = Date.now();
    const snapshot = await getRoomsSnapshot();
    for (const roomDoc of snapshot.docs) {
      const data = roomDoc.data();
      if (isRoomExpired(data, now)) {
        await deleteRoomDocument(roomDoc.ref);
      } else if (shouldMarkLegacyRoom(data)) {
        await mergeRoomDocument(roomDoc.ref, { presenceMigrationStartedAt: now, updatedAt: now });
      }
    }
  }, []);

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

  // 获取公开房间列表并清理僵尸房。私密房也在这里一起清理，只是不展示。
  const handleFetchPublicRooms = async (gameType = 'texas') => {
    try {
      const now = Date.now();
      const snapshot = await getRoomsSnapshot();
      const rooms = [];
      for (const d of snapshot.docs) {
        const data = normalizePokerRoom(d.data(), { roomId: d.id });
        if (isRoomExpired(data, now)) {
          await deleteRoomDocument(d.ref);
          continue;
        }
        if (shouldMarkLegacyRoom(data)) {
          await mergeRoomDocument(d.ref, { presenceMigrationStartedAt: now, updatedAt: now });
          continue;
        }
        if (data.isPublic && data.gameType === gameType && getActivePlayerCount(data, now) > 0) {
          rooms.push({ ...data, activePlayerCount: getActivePlayerCount(data, now) });
        }
      }
      return rooms;
    } catch (err) {
      console.error(err);
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
          await deleteRoomDocument(normalizedRoomId);
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
           await mergeRoomDocument(normalizedRoomId, { joinRequests: newRequests, updatedAt: now });
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
          await mergeRoomDocument(normalizedRoomId, { players: newPlayers, updatedAt: now });
        } else {
          const isMidHand = !isJoinableStatus(data.status);
          const newPlayers = [...players, { 
            uid: user.uid, name: playerName, chips: roomSettings.initialChips, 
            hand: [], bet: 0, folded: isMidHand, allIn: false, hasActed: isMidHand, isSittingOut: false, waitingNextHand: isMidHand,
            lastSeenAt: now, disconnectedAt: null, isOnline: true
          }];
          await mergeRoomDocument(normalizedRoomId, { players: newPlayers, settings: roomSettings, logs: [...(data.logs || []), `${playerName} ${isMidHand ? '加入观战，将在下一局入座。' : '加入了房间。'}`], updatedAt: now });
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
    return <Lobby onCreateRoom={handleCreateRoom} onJoinRoom={handleJoinRoom} onFetchPublicRooms={handleFetchPublicRooms} errorMsg={errorMsg} />;
  }
  return <PokerGame user={user} roomId={activeRoomId} roomData={activeRoomData} onLeaveRoom={handleLeaveRoom} />;
}
