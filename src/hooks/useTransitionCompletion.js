import { useEffect, useRef } from 'react';

import {
  TRANSITION_TIMING,
  isTransitionActive,
  shouldAutoAdvanceAfterTransition,
} from '../utils/gameFlow';
import { getMaintenanceManagerUid } from '../utils/roomMaintenance';
import { shouldCommitTransitionCompletionState } from '../utils/pokerGameEngine';

export const useTransitionCompletion = ({
  advanceGameState,
  commitRoomState,
  roomData,
  roomDataRef,
  roomId,
  transitionReadySignal = false,
  userUid,
}) => {
  const transitionCompletionInFlightRef = useRef(null);
  const handlersRef = useRef({ advanceGameState, commitRoomState });

  useEffect(() => {
    handlersRef.current = { advanceGameState, commitRoomState };
  }, [advanceGameState, commitRoomState]);

  useEffect(() => {
    transitionCompletionInFlightRef.current = null;
  }, [roomData?.transition?.id]);

  useEffect(() => {
    if (!roomData?.transition?.id || !userUid || !roomId) return undefined;
    if (roomData.isPaused || roomData.transition.pausedAt) return undefined;

    const delay = Math.max(
      0,
      Number(roomData.transition.endsAt || 0) - Date.now() + TRANSITION_TIMING.transitionCompletionGraceMs,
    );
    const timeoutId = setTimeout(async () => {
      const currentRoom = roomDataRef.current;
      if (!currentRoom?.transition || currentRoom.transition.id !== roomData.transition.id) return;
      if (currentRoom.isPaused || currentRoom.transition.pausedAt) return;

      const now = Date.now();
      if (isTransitionActive(currentRoom.transition, now)) return;

      const managerUid = getMaintenanceManagerUid(currentRoom, now, userUid);
      if (managerUid !== userUid) return;

      const completedTransition = currentRoom.transition;
      if (transitionCompletionInFlightRef.current === completedTransition.id) return;
      transitionCompletionInFlightRef.current = completedTransition.id;
      const nextState = { ...currentRoom, transition: null, updatedAt: now };
      try {
        if (shouldAutoAdvanceAfterTransition({ ...nextState, transition: completedTransition })) {
          await handlersRef.current.advanceGameState({ ...nextState, transition: completedTransition });
        } else {
          await handlersRef.current.commitRoomState(
            nextState,
            shouldCommitTransitionCompletionState(completedTransition.id, nextState),
          );
        }
      } catch (err) {
        transitionCompletionInFlightRef.current = null;
        console.error('Transition Completion Error:', err);
      }
    }, delay);

    return () => clearTimeout(timeoutId);
  }, [
    roomData?.isPaused,
    roomData?.transition?.endsAt,
    roomData?.transition?.id,
    roomData?.transition?.pausedAt,
    roomDataRef,
    roomId,
    transitionReadySignal,
    userUid,
  ]);
};
