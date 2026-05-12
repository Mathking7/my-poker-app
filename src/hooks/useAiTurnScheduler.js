import { useEffect, useRef } from 'react';

import { isTransitionActive } from '../utils/gameFlow';
import { isGameInProgress } from '../utils/roomMaintenance';
import { decidePokerAiActionAsync, getAiThinkDelay } from '../utils/pokerAi';
import {
  buildAiTurnLease,
  getAiActionKey,
  getSafeAiRecoveryDecision,
  isAiTurnLeaseActive,
} from '../utils/pokerAiTurn';
import { runRoomTransaction } from '../services/roomRepository';

const AI_STALL_RECOVERY_MS = 5500;
const AI_RETRY_WAIT_MS = 350;

export const useAiTurnScheduler = ({
  roomId,
  roomData,
  roomDataRef,
  canDriveAiTurn,
  driverUid,
  actionSignal,
  getActionSourceToken,
  playerNeedsAction,
  commitPlayerActionState,
  advanceGameState,
  transitionReadySignal = false,
}) => {
  const aiActionInFlightRef = useRef(null);

  useEffect(() => {
    const currentAiPlayer = roomData?.players?.[roomData?.turnIndex];
    const sourceToken = getActionSourceToken(roomData, roomData?.turnIndex);
    if (
      !currentAiPlayer?.isAi ||
      !sourceToken ||
      !playerNeedsAction(currentAiPlayer, roomData) ||
      !canDriveAiTurn ||
      !driverUid ||
      !isGameInProgress(roomData?.status) ||
      roomData?.isPaused ||
      roomData?.transition?.pausedAt ||
      isTransitionActive(roomData?.transition)
    ) {
      return undefined;
    }

    const actionKey = getAiActionKey(roomId, sourceToken);
    if (aiActionInFlightRef.current === actionKey) return undefined;
    aiActionInFlightRef.current = actionKey;

    let cancelled = false;
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const activeLease = isAiTurnLeaseActive(roomData?.aiTurnLease, actionKey)
      ? roomData.aiTurnLease
      : null;
    const leaseDelay = activeLease && activeLease.claimedBy !== driverUid
      ? Math.max(120, Number(activeLease.expiresAt || 0) - Date.now() + 120)
      : 0;

    const timeoutId = setTimeout(async () => {
      let recoveryTimeoutId = null;
      let rejectedAttempts = 0;
      const getErrorMessage = (err) => err?.message || String(err);

      const writeAiDiagnostics = async (diagnostics = {}) => {
        await runRoomTransaction(roomId, async (transaction, roomRef) => {
          const snapshot = await transaction.get(roomRef);
          const latest = snapshot.exists() ? snapshot.data() : null;
          if (!latest) return false;
          transaction.update(roomRef, {
            aiDiagnostics: {
              ...(latest.aiDiagnostics || {}),
              ...diagnostics,
            },
          });
          return true;
        }).catch((err) => console.error('AI Diagnostics Error:', err));
      };

      const claimAiLease = async () => {
        try {
          return await runRoomTransaction(roomId, async (transaction, roomRef) => {
            const snapshot = await transaction.get(roomRef);
            const latest = snapshot.exists() ? snapshot.data() : null;
            const latestToken = getActionSourceToken(latest, latest?.turnIndex);
            const latestAiPlayer = latest?.players?.[latest?.turnIndex];
            const now = Date.now();
            const existingLease = latest?.aiTurnLease || null;
            if (
              !latest ||
              !latestAiPlayer?.isAi ||
              latestAiPlayer.uid !== currentAiPlayer.uid ||
              !latestToken ||
              getAiActionKey(roomId, latestToken) !== actionKey ||
              !playerNeedsAction(latestAiPlayer, latest) ||
              !isGameInProgress(latest.status) ||
              latest.isPaused ||
              latest.transition?.pausedAt ||
              isTransitionActive(latest.transition)
            ) {
              return { claimed: false, reason: 'stale-turn' };
            }

            if (
              isAiTurnLeaseActive(existingLease, actionKey, now) &&
              existingLease.claimedBy &&
              existingLease.claimedBy !== driverUid
            ) {
              return { claimed: false, reason: 'leased', retryAt: existingLease.expiresAt };
            }

            const lease = buildAiTurnLease({
              actionKey,
              sourceToken: latestToken,
              claimedBy: driverUid,
              previousLease: existingLease,
              now,
            });
            transaction.update(roomRef, {
              aiTurnLease: lease,
              aiDiagnostics: {
                ...(latest.aiDiagnostics || {}),
                lastLeaseActionKey: actionKey,
                lastLeaseClaimedBy: driverUid,
                lastLeaseClaimedAt: now,
                lastLeaseAttempt: lease.attempt,
                lastLeaseStatus: 'claimed',
              },
            });
            return { claimed: true, lease };
          });
        } catch (err) {
          console.error('AI Lease Claim Error:', err);
          await writeAiDiagnostics({
            lastLeaseActionKey: actionKey,
            lastLeaseClaimedBy: driverUid,
            lastLeaseErrorAt: Date.now(),
            lastLeaseError: getErrorMessage(err),
            lastLeaseStatus: 'claim-error',
          });
          return { claimed: false, reason: 'claim-error' };
        }
      };

      const clearAiLease = async (diagnostics = {}) => {
        await runRoomTransaction(roomId, async (transaction, roomRef) => {
          const snapshot = await transaction.get(roomRef);
          const latest = snapshot.exists() ? snapshot.data() : null;
          if (!latest?.aiTurnLease || latest.aiTurnLease.actionKey !== actionKey) return false;
          transaction.update(roomRef, {
            aiTurnLease: null,
            aiDiagnostics: {
              ...(latest.aiDiagnostics || {}),
              ...diagnostics,
            },
          });
          return true;
        }).catch((err) => console.error('AI Lease Clear Error:', err));
      };

      const getSameLiveAiTurn = () => {
        const latestRoom = roomDataRef.current;
        const latestAiIndex = latestRoom?.turnIndex;
        const latestAiPlayer = latestRoom?.players?.[latestAiIndex];
        const latestToken = getActionSourceToken(latestRoom, latestAiIndex);
        if (
          !latestRoom ||
          !latestAiPlayer?.isAi ||
          latestAiPlayer.uid !== currentAiPlayer.uid ||
          !latestToken ||
          getAiActionKey(roomId, latestToken) !== actionKey ||
          !playerNeedsAction(latestAiPlayer, latestRoom) ||
          !isGameInProgress(latestRoom.status) ||
          latestRoom.isPaused ||
          latestRoom.transition?.pausedAt ||
          isTransitionActive(latestRoom.transition)
        ) {
          return null;
        }
        return { latestRoom, latestAiPlayer };
      };

      const commitAiDecision = async (currentRoom, aiPlayer, decision) => {
        const actionCommit = await commitPlayerActionState(currentRoom, decision.actionType, decision.amount, {
          expectedUid: aiPlayer.uid,
          fallbackRaiseToCall: true,
        });
        if (!actionCommit?.state) return false;
        if (!actionCommit.advanced) {
          await advanceGameState(actionCommit.state);
        }
        await clearAiLease({
          lastActionKey: actionKey,
          lastActionAt: Date.now(),
          lastActionPlayerUid: aiPlayer.uid,
          lastActionType: decision.actionType,
          lastDecisionReason: decision.reason || '',
          lastDecisionWasRecovery: Boolean(decision.reason?.startsWith('recovery-')),
        });
        return true;
      };

      const tryRecoveryDecision = async () => {
        const liveTurn = getSameLiveAiTurn();
        if (!liveTurn) return false;
        return commitAiDecision(
          liveTurn.latestRoom,
          liveTurn.latestAiPlayer,
          getSafeAiRecoveryDecision(liveTurn.latestRoom, liveTurn.latestAiPlayer),
        );
      };

      try {
        recoveryTimeoutId = setTimeout(() => {
          if (cancelled) return;
          tryRecoveryDecision()
            .then((recovered) => {
              if (recovered) {
                return writeAiDiagnostics({
                  lastActionKey: actionKey,
                  lastRecoveryAt: Date.now(),
                  lastRecoveryReason: 'stall-deadline',
                });
              }
              return null;
            })
            .catch((err) => writeAiDiagnostics({
              lastActionKey: actionKey,
              lastRecoveryErrorAt: Date.now(),
              lastRecoveryError: getErrorMessage(err),
            }));
        }, AI_STALL_RECOVERY_MS);

        let leaseResult = null;
        for (let leaseAttempt = 0; leaseAttempt < 3 && !cancelled; leaseAttempt += 1) {
          leaseResult = await claimAiLease();
          if (leaseResult.claimed) break;
          if (leaseResult.reason === 'leased' && leaseResult.retryAt && Date.now() < leaseResult.retryAt) {
            await wait(Math.min(9000, Math.max(120, leaseResult.retryAt - Date.now() + 120)));
            continue;
          }
          break;
        }
        if (!leaseResult?.claimed) {
          if (leaseResult?.reason && leaseResult.reason !== 'stale-turn') {
            await writeAiDiagnostics({
              lastLeaseActionKey: actionKey,
              lastLeaseClaimedBy: driverUid,
              lastLeaseStatus: leaseResult.reason,
              lastLeaseNotClaimedAt: Date.now(),
            });
          }
          return;
        }

        await wait(getAiThinkDelay());
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

            if (await commitAiDecision(currentRoom, aiPlayer, decision)) break;
            if (await tryRecoveryDecision()) break;
          } catch (err) {
            console.error('AI Action Error:', err);
            await writeAiDiagnostics({
              lastActionKey: actionKey,
              lastErrorAt: Date.now(),
              lastError: err?.message || String(err),
            });
            if (await tryRecoveryDecision()) break;
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
          if (rejectedAttempts >= 8) {
            await writeAiDiagnostics({
              lastActionKey: actionKey,
              lastRejectedAt: Date.now(),
              lastRejectedAttempts: rejectedAttempts,
            });
            await tryRecoveryDecision();
            break;
          }
          await wait(AI_RETRY_WAIT_MS);
        }
      } finally {
        clearTimeout(recoveryTimeoutId);
        if (aiActionInFlightRef.current === actionKey) {
          aiActionInFlightRef.current = null;
        }
      }
    }, leaseDelay);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      if (aiActionInFlightRef.current === actionKey) {
        aiActionInFlightRef.current = null;
      }
    };
    // The scheduler intentionally captures the latest action helpers for the current action signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    actionSignal,
    canDriveAiTurn,
    driverUid,
    roomData?.isPaused,
    roomData?.transition?.id,
    roomData?.transition?.pausedAt,
    roomId,
    transitionReadySignal,
  ]);
};
