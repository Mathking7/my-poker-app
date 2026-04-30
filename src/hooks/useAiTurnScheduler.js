import { useEffect, useRef } from 'react';

import { isTransitionActive } from '../utils/gameFlow';
import { isGameInProgress } from '../utils/roomMaintenance';
import { decidePokerAiActionAsync, getAiThinkDelay } from '../utils/pokerAi';
import { getAiActionKey } from '../utils/pokerAiTurn';

export const useAiTurnScheduler = ({
  roomId,
  roomData,
  roomDataRef,
  canManageRoom,
  actionSignal,
  getActionSourceToken,
  playerNeedsAction,
  commitPlayerActionState,
  advanceGameState,
}) => {
  const aiActionInFlightRef = useRef(null);

  useEffect(() => {
    const currentAiPlayer = roomData?.players?.[roomData?.turnIndex];
    const sourceToken = getActionSourceToken(roomData, roomData?.turnIndex);
    if (
      !currentAiPlayer?.isAi ||
      !sourceToken ||
      !playerNeedsAction(currentAiPlayer, roomData) ||
      !canManageRoom ||
      !isGameInProgress(roomData?.status)
    ) {
      return undefined;
    }

    const actionKey = getAiActionKey(roomId, sourceToken);
    if (aiActionInFlightRef.current === actionKey) return undefined;
    aiActionInFlightRef.current = actionKey;

    let cancelled = false;
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const timeoutId = setTimeout(async () => {
      let rejectedAttempts = 0;
      try {
        while (!cancelled) {
          const currentRoom = roomDataRef.current;
          const aiIndex = currentRoom?.turnIndex;
          const aiPlayer = currentRoom?.players?.[aiIndex];
          if (
            !currentRoom ||
            !aiPlayer?.isAi ||
            aiPlayer.uid !== currentAiPlayer.uid ||
            !playerNeedsAction(aiPlayer, currentRoom) ||
            !isGameInProgress(currentRoom.status)
          ) {
            break;
          }

          if (
            currentRoom.isPaused ||
            currentRoom.transition?.pausedAt ||
            isTransitionActive(currentRoom.transition)
          ) {
            await wait(350);
            continue;
          }

          try {
            const decision = await decidePokerAiActionAsync(currentRoom, aiPlayer);
            if (cancelled) break;

            const actionCommit = await commitPlayerActionState(currentRoom, decision.actionType, decision.amount, {
              expectedUid: aiPlayer.uid,
              fallbackRaiseToCall: true,
            });
            if (actionCommit?.state) {
              if (!actionCommit.advanced) {
                await advanceGameState(actionCommit.state);
              }
              break;
            }
          } catch (err) {
            console.error('AI Action Error:', err);
            break;
          }

          const latestRoom = roomDataRef.current;
          const latestPlayer = latestRoom?.players?.[latestRoom?.turnIndex];
          if (
            !latestPlayer?.isAi ||
            latestPlayer.uid !== currentAiPlayer.uid ||
            !playerNeedsAction(latestPlayer, latestRoom)
          ) {
            break;
          }

          rejectedAttempts += 1;
          if (rejectedAttempts >= 8) break;
          await wait(350);
        }
      } finally {
        if (aiActionInFlightRef.current === actionKey) {
          aiActionInFlightRef.current = null;
        }
      }
    }, getAiThinkDelay());

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      if (aiActionInFlightRef.current === actionKey) {
        aiActionInFlightRef.current = null;
      }
    };
    // The scheduler intentionally captures the latest action helpers for the current action signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionSignal, canManageRoom, roomId]);
};
