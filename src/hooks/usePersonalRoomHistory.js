import { useEffect, useRef, useState } from 'react';

import { setUserRoomHistoryDocument, subscribeUserRoomHistoryDocument } from '../services/roomRepository';
import {
  buildUserRoomHistory,
  getRecentHandIdentity,
  toLifecycleMillis,
} from '../utils/roomLifecycle';

const getHandWriteSignature = (hand = {}) => ({
  id: getRecentHandIdentity(hand),
  handNumber: Number(hand.handNumber || 0),
  endedAt: toLifecycleMillis(hand.endedAt),
  status: hand.status || '',
  totalPot: Number(hand.totalPot || 0),
  totalAwarded: Number(hand.totalAwarded || 0),
  summary: hand.summary || '',
  heroCards: Array.isArray(hand.heroCards) ? hand.heroCards : [],
  winners: Array.isArray(hand.winners)
    ? hand.winners.map((winner) => ({
        uid: winner.uid || '',
        amount: Number(winner.amount || 0),
        rankName: winner.rankName || '',
      }))
    : [],
  players: Array.isArray(hand.players)
    ? hand.players.map((player) => ({
        uid: player.uid || '',
        folded: Boolean(player.folded),
        allIn: Boolean(player.allIn),
        winAmount: Number(player.winAmount || 0),
        rankName: player.rankName || '',
        shownCards: Array.isArray(player.shownCards) ? player.shownCards : [],
      }))
    : [],
  actions: Array.isArray(hand.actions)
    ? hand.actions.map((action) => ({
        id: action.id || '',
        street: action.street || '',
        streetLabel: action.streetLabel || '',
        at: toLifecycleMillis(action.at),
        playerUid: action.playerUid || '',
        playerName: action.playerName || '',
        actionType: action.actionType || '',
        actionLabel: action.actionLabel || '',
        amount: Number(action.amount || 0),
        targetBet: Number(action.targetBet || 0),
        totalBet: Number(action.totalBet || 0),
        potAfter: Number(action.potAfter || 0),
        allIn: Boolean(action.allIn),
      }))
    : [],
});

const getHistoryWriteSignature = (historyData = {}) => JSON.stringify({
  roomId: historyData.roomId || '',
  roomInstanceId: historyData.roomInstanceId || '',
  status: historyData.status || '',
  canRejoin: Boolean(historyData.canRejoin),
  handCount: Number(historyData.handCount || 0),
  activePlayerCount: Number(historyData.activePlayerCount || 0),
  totalPlayerCount: Number(historyData.totalPlayerCount || 0),
  expiresAt: toLifecycleMillis(historyData.expiresAt),
  lastHandSummary: historyData.lastHandSummary
    ? {
        handNumber: Number(historyData.lastHandSummary.handNumber || 0),
        endedAt: toLifecycleMillis(historyData.lastHandSummary.endedAt),
        summary: historyData.lastHandSummary.summary || '',
        totalPot: Number(historyData.lastHandSummary.totalPot || 0),
      }
    : null,
  recentHands: Array.isArray(historyData.recentHands)
    ? historyData.recentHands.map(getHandWriteSignature)
    : [],
});

export const usePersonalRoomHistory = ({ roomId, roomData, userUid }) => {
  const scopeKey = `${userUid || ''}:${roomId || ''}`;
  const [personalHistoryState, setPersonalHistoryState] = useState({ scopeKey: '', recentHands: [] });
  const personalRecentHandsRef = useRef([]);
  const syncKeyRef = useRef('');
  const lastPersistedSignatureRef = useRef('');

  useEffect(() => {
    personalRecentHandsRef.current = [];
    syncKeyRef.current = '';
    lastPersistedSignatureRef.current = '';
    if (!userUid || !roomId) return undefined;

    return subscribeUserRoomHistoryDocument(userUid, roomId, (snapshot) => {
      if (!snapshot.exists()) {
        personalRecentHandsRef.current = [];
        lastPersistedSignatureRef.current = '';
        setPersonalHistoryState({ scopeKey, recentHands: [] });
        return;
      }
      const historyData = snapshot.data() || {};
      const recentHands = Array.isArray(historyData.recentHands)
        ? historyData.recentHands
        : [];
      personalRecentHandsRef.current = recentHands;
      lastPersistedSignatureRef.current = getHistoryWriteSignature(historyData);
      setPersonalHistoryState({ scopeKey, recentHands });
    }, (err) => console.error('User Room History Subscribe Error:', err));
  }, [roomId, scopeKey, userUid]);

  useEffect(() => {
    if (!userUid || !roomData?.id) return;
    const latestHand = roomData.handHistory?.[0];
    const latestHandSignature = latestHand ? JSON.stringify(getHandWriteSignature(latestHand)) : '';
    const syncKey = `${roomData.roomInstanceId || roomData.id}:${latestHandSignature || roomData.lastHandSummary?.endedAt || roomData.updatedAt || ''}`;
    if (!latestHand && syncKeyRef.current) return;
    if (syncKeyRef.current === syncKey) return;

    const currentPlayer = (roomData.players || []).find((player) => player.uid === userUid);
    const latestHandIdentity = latestHand ? getRecentHandIdentity(latestHand) : '';
    const hasSavedHeroCards = latestHand
      ? personalRecentHandsRef.current.some((hand) => (
          getRecentHandIdentity(hand) === latestHandIdentity &&
          Array.isArray(hand.heroCards) &&
          hand.heroCards.length > 0
        ))
      : false;
    const canCaptureHeroCards = Boolean(
      latestHand &&
      currentPlayer?.hand?.length >= 2 &&
      Number(roomData.handCount || 0) === Number(latestHand.handNumber || 0) &&
      (roomData.status === 'showdown' || roomData.settlement?.id)
    );
    if (latestHand && currentPlayer && !canCaptureHeroCards && !hasSavedHeroCards) return;

    syncKeyRef.current = syncKey;

    const now = Date.now();
    const activeHumanCount = (roomData.players || []).filter((player) => (
      !player.isAi &&
      !player.isKicked &&
      player.isOnline !== false
    )).length;
    const historyData = buildUserRoomHistory(roomData, userUid, now, {
      activeHumanCount,
      existingRecentHands: personalRecentHandsRef.current,
    });
    if (!historyData) return;
    const nextSignature = getHistoryWriteSignature(historyData);
    if (lastPersistedSignatureRef.current === nextSignature) return;

    lastPersistedSignatureRef.current = nextSignature;
    personalRecentHandsRef.current = historyData.recentHands || [];
    setPersonalHistoryState({ scopeKey, recentHands: personalRecentHandsRef.current });
    setUserRoomHistoryDocument(userUid, roomData.id, historyData, { merge: true })
      .catch((err) => console.error('User Room History Sync Error:', err));
  }, [roomData, scopeKey, userUid]);

  return {
    personalRecentHands: personalHistoryState.scopeKey === scopeKey
      ? personalHistoryState.recentHands
      : [],
    personalRecentHandsRef,
  };
};
