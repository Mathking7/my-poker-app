import {
  deletePublicRoomIndexDocument,
  deleteRoomDocument,
  setUserRoomHistoryDocument,
} from './roomRepository';
import { buildUserRoomHistory } from '../utils/roomLifecycle';

export const deleteRoomWithIndexes = async (roomTarget, roomId) => {
  await deleteRoomDocument(roomTarget);
  if (roomId) {
    await deletePublicRoomIndexDocument(roomId).catch(() => {});
  }
};

export const markUserRoomHistoryClosed = async ({
  uid,
  roomId,
  roomData,
  existingRecentHands = [],
  now = Date.now(),
  reason = 'deleted',
}) => {
  if (!uid || !roomId || !roomData) return null;
  const historyData = buildUserRoomHistory(roomData, uid, now, {
    activeHumanCount: 0,
    existingRecentHands,
  });
  if (!historyData) return null;

  const closedHistory = {
    ...historyData,
    canRejoin: false,
    lifecycleStatus: reason,
    roomDeletedAt: now,
    expiresAt: now,
  };
  await setUserRoomHistoryDocument(uid, roomId, closedHistory, { merge: true });
  return closedHistory;
};
