import { quantizeChipAmount } from './chipMath.js';
import { getPlayerBettingOptions } from './gameFlow.js';

export const AI_TURN_LEASE_MS = 12000;

export const getAiActionKey = (roomId, sourceToken) => {
  if (!roomId || !sourceToken) return '';
  return [
    roomId,
    sourceToken.handCount,
    sourceToken.status,
    sourceToken.turnIndex,
    sourceToken.playerUid,
    sourceToken.currentBet,
    sourceToken.pot,
    sourceToken.playerBet,
    sourceToken.playerChips,
    sourceToken.playerHasActed,
    sourceToken.playerFolded,
    sourceToken.playerAllIn,
  ].join(':');
};

export const isAiTurnLeaseActive = (lease, actionKey, now = Date.now()) => {
  return Boolean(
    lease &&
    lease.actionKey === actionKey &&
    Number(lease.expiresAt || 0) > now
  );
};

export const buildAiTurnLease = ({
  actionKey,
  sourceToken,
  claimedBy,
  previousLease = null,
  now = Date.now(),
  durationMs = AI_TURN_LEASE_MS,
}) => ({
  actionKey,
  playerUid: sourceToken?.playerUid || '',
  claimedBy: claimedBy || '',
  claimedAt: now,
  expiresAt: now + durationMs,
  attempt: previousLease?.actionKey === actionKey ? Number(previousLease.attempt || 0) + 1 : 1,
});

export const getSafeAiRecoveryDecision = (room, aiPlayer) => {
  const options = getPlayerBettingOptions(room, aiPlayer);
  const callAmount = quantizeChipAmount(options.callAmount || 0, 'floor');
  if (callAmount <= 0) return { actionType: 'call', amount: 0, reason: 'recovery-check' };

  const stack = quantizeChipAmount(aiPlayer?.chips || 0, 'floor');
  const pot = quantizeChipAmount(room?.pot || 0, 'floor');
  const isSmallPrice = callAmount <= Math.max(10, stack * 0.08) && callAmount <= Math.max(10, pot * 0.18);
  return isSmallPrice
    ? { actionType: 'call', amount: 0, reason: 'recovery-small-call' }
    : { actionType: 'fold', amount: 0, reason: 'recovery-fold' };
};
