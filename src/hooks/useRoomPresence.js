import { useEffect } from 'react';

import { setRoomDocument } from '../services/roomRepository';
import { PRESENCE_HEARTBEAT_MS } from '../utils/roomMaintenance';

export const useRoomPresence = ({ roomId, userUid }) => {
  useEffect(() => {
    if (!userUid || !roomId) return undefined;

    const sendPresence = async () => {
      const now = Date.now();
      try {
        await setRoomDocument(roomId, {
          presence: {
            [userUid]: {
              lastSeenAt: now,
              isOnline: true,
            },
          },
          updatedAt: now,
        }, { merge: true });
      } catch (err) {
        console.error('Presence Heartbeat Error:', err);
      }
    };

    sendPresence();
    const heartbeatId = setInterval(sendPresence, PRESENCE_HEARTBEAT_MS);
    return () => clearInterval(heartbeatId);
  }, [roomId, userUid]);
};
