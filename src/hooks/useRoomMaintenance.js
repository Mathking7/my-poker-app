import { useEffect } from 'react';

import { setRoomDocument } from '../services/roomRepository';
import { isTransitionActive } from '../utils/gameFlow';
import {
  applyRoomMaintenance,
  getMaintenanceManagerUid,
} from '../utils/roomMaintenance';

export const useRoomMaintenance = ({
  roomId,
  userUid,
  roomDataRef,
  advanceGameState,
}) => {
  useEffect(() => {
    if (!userUid || !roomId) return undefined;

    const runMaintenance = async () => {
      const currentRoom = roomDataRef.current;
      if (!currentRoom?.players?.length) return;

      const now = Date.now();
      if (currentRoom.isPaused) return;
      if (isTransitionActive(currentRoom.transition, now)) return;
      const managerUid = getMaintenanceManagerUid(currentRoom, now, userUid);
      if (managerUid !== userUid) return;

      const result = applyRoomMaintenance(currentRoom, now, userUid);
      if (!result.changed) return;

      try {
        await setRoomDocument(roomId, result.room);
        if (result.shouldAdvance) {
          await advanceGameState(result.room);
        }
      } catch (err) {
        console.error('Room Maintenance Error:', err);
      }
    };

    const firstRunId = setTimeout(runMaintenance, 3000);
    const intervalId = setInterval(runMaintenance, 10000);
    return () => {
      clearTimeout(firstRunId);
      clearInterval(intervalId);
    };
    // advanceGameState intentionally comes from the current render; the interval reads latest room data from roomDataRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, userUid]);
};
