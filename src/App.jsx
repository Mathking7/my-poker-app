import React, { useState, useEffect } from 'react';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, getDoc, getDocs, collection, onSnapshot, query, where, deleteDoc } from 'firebase/firestore';

import { auth, db, globalAppId, isFirebaseInitialized } from './firebase';
import Lobby from './components/Lobby';
import PokerGame from './components/PokerGame';

export default function App() {
  const [user, setUser] = useState(null);
  const [activeRoomId, setActiveRoomId] = useState('');
  const [roomData, setRoomData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

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

  // 获取公开房间列表并清理僵尸房
  const handleFetchPublicRooms = async () => {
    try {
      const roomsRef = collection(db, 'artifacts', globalAppId, 'public', 'data', 'rooms');
      const snapshot = await getDocs(roomsRef);
      const rooms = [];
      for (const d of snapshot.docs) {
        const data = d.data();
        if (data.isPublic) {
          if (!data.players || data.players.length === 0) {
            await deleteDoc(d.ref); // 清理空房
          } else {
            rooms.push(data);
          }
        }
      }
      return rooms;
    } catch (err) {
      console.error(err);
      return [];
    }
  };

  const handleCreateRoom = async (playerName, gameType, isPublic, settings) => {
    const newRoomId = String(Math.floor(1000 + Math.random() * 9000));
    const initialData = {
      id: newRoomId, 
      hostUid: isPublic ? null : user.uid, 
      creatorUid: user.uid,
      status: 'waiting', 
      isPaused: false,
      pot: 0, 
      currentBet: 0, 
      turnIndex: 0, 
      dealerIndex: 0,
      handCount: 0,
      communityCards: [], 
      deck: [], 
      logs: [`房间创建成功 (房号: ${newRoomId})`],
      gameType,
      isPublic, 
      settings, 
      joinRequests: [], 
      players: [{ 
        uid: user.uid, name: playerName, chips: settings.initialChips,
        hand: [], bet: 0, folded: false, allIn: false, hasActed: false, isSittingOut: false
      }]
    };
    try {
      await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', newRoomId), initialData);
      setActiveRoomId(newRoomId);
    } catch (err) { setErrorMsg('创建失败'); }
  };

  const handleJoinRoom = async (playerName, joinRoomId) => {
    if (!playerName.trim() || !joinRoomId.trim()) return;
    try {
      const roomRef = doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', joinRoomId);
      const docSnap = await getDoc(roomRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (!data.isPublic && data.hostUid && !data.players.find(p => p.uid === user.uid)) {
           const newRequests = data.joinRequests || [];
           await setDoc(roomRef, { joinRequests: [...newRequests, { uid: user.uid, name: playerName }] }, { merge: true });
           setActiveRoomId(joinRoomId); 
           return;
        }
        if (!data.players.find(p => p.uid === user.uid)) {
          const newPlayers = [...data.players, { 
            uid: user.uid, name: playerName, chips: data.settings.initialChips, 
            hand: [], bet: 0, folded: data.status !== 'waiting', allIn: false, hasActed: data.status !== 'waiting', isSittingOut: false
          }];
          await setDoc(roomRef, { players: newPlayers, logs: [...data.logs, `${playerName} 加入了房间。`] }, { merge: true });
        }
        setActiveRoomId(joinRoomId);
      } else {
        setErrorMsg('房间不存在');
      }
    } catch (err) { setErrorMsg('加入失败'); }
  };

  if (!activeRoomId || !roomData) {
    return <Lobby onCreateRoom={handleCreateRoom} onJoinRoom={handleJoinRoom} onFetchPublicRooms={handleFetchPublicRooms} errorMsg={errorMsg} />;
  }
  return <PokerGame user={user} roomId={activeRoomId} roomData={roomData} onLeaveRoom={() => setActiveRoomId('')} />;
}