import React, { useCallback, useState, useEffect } from 'react';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, getDoc, getDocs, collection, onSnapshot, deleteDoc } from 'firebase/firestore';

import { auth, db, globalAppId, isFirebaseInitialized } from './firebase';
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

export default function App() {
  const [user, setUser] = useState(null);
  const [activeRoomId, setActiveRoomId] = useState('');
  const [roomData, setRoomData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const getRoomsRef = useCallback(() => {
    return collection(db, 'artifacts', globalAppId, 'public', 'data', 'rooms');
  }, []);

  const sweepExpiredRooms = useCallback(async () => {
    const now = Date.now();
    const snapshot = await getDocs(getRoomsRef());
    for (const roomDoc of snapshot.docs) {
      const data = roomDoc.data();
      if (isRoomExpired(data, now)) {
        await deleteDoc(roomDoc.ref);
      } else if (shouldMarkLegacyRoom(data)) {
        await setDoc(roomDoc.ref, { presenceMigrationStartedAt: now, updatedAt: now }, { merge: true });
      }
    }
  }, [getRoomsRef]);

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
    const roomRef = doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', activeRoomId);
    const unsubscribe = onSnapshot(roomRef, (docSnap) => {
      if (docSnap.exists()) {
        setRoomData(docSnap.data());
      } else {
        setErrorMsg('房间不存在或已解散');
        setActiveRoomId('');
        setRoomData(null);
      }
    }, (err) => {
      console.error("Snapshot Error:", err);
    });
    return () => unsubscribe();
  }, [user, activeRoomId]);

  // 获取公开房间列表并清理僵尸房。私密房也在这里一起清理，只是不展示。
  const handleFetchPublicRooms = async (gameType = 'texas') => {
    try {
      const now = Date.now();
      const snapshot = await getDocs(getRoomsRef());
      const rooms = [];
      for (const d of snapshot.docs) {
        const data = d.data();
        if (isRoomExpired(data, now)) {
          await deleteDoc(d.ref);
          continue;
        }
        if (shouldMarkLegacyRoom(data)) {
          await setDoc(d.ref, { presenceMigrationStartedAt: now, updatedAt: now }, { merge: true });
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

  const createUniqueRoomId = async () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = String(Math.floor(1000 + Math.random() * 9000));
      const roomRef = doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', candidate);
      const existingRoom = await getDoc(roomRef);
      if (!existingRoom.exists()) return candidate;
    }
    throw new Error('Unable to allocate a unique room id');
  };

  const handleCreateRoom = async (playerName, gameType, isPublic, settings) => {
    if (!user) {
      setErrorMsg('登录尚未完成，请稍后再试');
      return;
    }
    try {
      const normalizedSettings = normalizeGameSettings(settings);
      const newRoomId = await createUniqueRoomId();
      const now = Date.now();
      const initialData = {
        id: newRoomId, 
        hostUid: isPublic ? null : user.uid, 
        creatorUid: user.uid,
        createdAt: now,
        updatedAt: now,
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
        logs: [`房间创建成功 (房号: ${newRoomId})`],
        gameType,
        isPublic, 
        settings: normalizedSettings, 
        joinRequests: [], 
        players: [stampPlayerPresence({ 
          uid: user.uid, name: playerName, chips: normalizedSettings.initialChips,
          hand: [], bet: 0, folded: false, allIn: false, hasActed: false, isSittingOut: false, waitingNextHand: false
        }, now)]
      };
      await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', newRoomId), initialData);
      setActiveRoomId(newRoomId);
    } catch (err) {
      console.error("Create Room Error:", err);
      setErrorMsg('创建失败');
    }
  };

  const handleJoinRoom = async (playerName, joinRoomId) => {
    if (!playerName.trim() || !joinRoomId.trim()) return;
    if (!user) {
      setErrorMsg('登录尚未完成，请稍后再试');
      return;
    }
    try {
      const now = Date.now();
      const roomRef = doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', joinRoomId);
      const docSnap = await getDoc(roomRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        const roomSettings = normalizeGameSettings(data.settings);
        const players = data.players || [];
        const existingPlayer = players.find(p => p.uid === user.uid);
        if (isRoomExpired(data, now)) {
          await deleteDoc(roomRef);
          setErrorMsg('房间已过期并被清理');
          return;
        }
        if (!existingPlayer && players.length >= MAX_PLAYERS) {
          setErrorMsg('房间人数已满');
          return;
        }
        if (!existingPlayer && !isJoinableStatus(data.status) && !roomSettings.allowJoinDuringGame) {
          setErrorMsg('该房间正在对局中，且不允许中途加入');
          return;
        }
        if (!data.isPublic && !data.hostUid) {
          const activeHost = players.find(p => isPlayerActive(p, now, null, data));
          if (activeHost) {
            data.hostUid = activeHost.uid;
            await setDoc(roomRef, { hostUid: activeHost.uid, updatedAt: now }, { merge: true });
          }
        }
        if (!data.isPublic && data.hostUid && !existingPlayer) {
           const existingRequests = data.joinRequests || [];
           const nextRequest = stampJoinRequestPresence({ uid: user.uid, name: playerName, requestedAt: now }, now);
           const newRequests = existingRequests.some(req => req.uid === user.uid)
             ? existingRequests.map(req => req.uid === user.uid ? { ...req, ...nextRequest } : req)
             : [...existingRequests, nextRequest];
           await setDoc(roomRef, { joinRequests: newRequests, updatedAt: now }, { merge: true });
           setActiveRoomId(joinRoomId); 
           return;
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
          await setDoc(roomRef, { players: newPlayers, updatedAt: now }, { merge: true });
        } else {
          const isMidHand = !isJoinableStatus(data.status);
          const newPlayers = [...players, { 
            uid: user.uid, name: playerName, chips: roomSettings.initialChips, 
            hand: [], bet: 0, folded: isMidHand, allIn: false, hasActed: isMidHand, isSittingOut: false, waitingNextHand: isMidHand,
            lastSeenAt: now, disconnectedAt: null, isOnline: true
          }];
          await setDoc(roomRef, { players: newPlayers, settings: roomSettings, logs: [...(data.logs || []), `${playerName} ${isMidHand ? '加入观战，将在下一局入座。' : '加入了房间。'}`], updatedAt: now }, { merge: true });
        }
        setActiveRoomId(joinRoomId);
      } else {
        setErrorMsg('房间不存在');
      }
    } catch (err) {
      console.error("Join Room Error:", err);
      setErrorMsg('加入失败');
    }
  };

  if (!activeRoomId || !roomData) {
    return <Lobby onCreateRoom={handleCreateRoom} onJoinRoom={handleJoinRoom} onFetchPublicRooms={handleFetchPublicRooms} errorMsg={errorMsg} />;
  }
  return <PokerGame user={user} roomId={activeRoomId} roomData={roomData} onLeaveRoom={() => setActiveRoomId('')} />;
}
