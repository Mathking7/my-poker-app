import { quantizeChipAmount } from './chipMath.js';
import {
  clampRaiseAmount,
  createGameTransition,
  getPlayerBettingOptions,
  isTransitionActive,
} from './gameFlow.js';
import { isGameInProgress, stampPlayerPresence } from './roomMaintenance.js';

export const addLog = (data, msg, maxEntries = 50) => {
  let newLogs = [...(data.logs || []), msg];
  if (newLogs.length > maxEntries) newLogs = newLogs.slice(newLogs.length - maxEntries);
  return newLogs;
};

export const getPendingChipUpdate = (player) => {
  const mode = player?.pendingChipMode;
  if (mode !== 'set' && mode !== 'add' && mode !== 'subtract') return null;
  const amount = quantizeChipAmount(player?.pendingChipAmount || 0, 'floor');
  if ((mode === 'add' || mode === 'subtract') && amount <= 0) return null;
  return { mode, amount };
};

export const clearPendingChipUpdate = (player) => {
  delete player.pendingChipMode;
  delete player.pendingChipAmount;
  delete player.pendingChipUpdatedAt;
};

export const getPendingChipLabel = (pending) => {
  if (!pending) return '';
  if (pending.mode === 'set') return `设为 ${pending.amount}`;
  if (pending.mode === 'subtract') return `减少 ${pending.amount}`;
  return `增加 ${pending.amount}`;
};

export const playerNeedsAction = (player, room) => Boolean(
  player &&
  !player.folded &&
  !player.allIn &&
  !player.isSittingOut &&
  (
    !player.hasActed ||
    quantizeChipAmount(player.bet || 0, 'floor') < quantizeChipAmount(room?.currentBet || 0, 'floor')
  ),
);

const streetRank = {
  waiting: -1,
  'pre-flop': 0,
  flop: 1,
  turn: 2,
  river: 3,
  showdown: 4,
};

export const getStreetRank = (status) => streetRank[status] ?? -1;

export const shouldCommitTransitionState = (nextState) => (latest) => {
  if (!latest) return true;
  if (latest.isPaused && !nextState.isPaused) return false;
  if ((latest.handCount || 0) !== (nextState.handCount || 0)) {
    return (latest.handCount || 0) < (nextState.handCount || 0);
  }
  const transition = nextState.transition;
  if (!transition) return true;

  if (transition.type === 'action-hold') {
    const hasSameActionHoldSlot = (
      latest.transition?.type === 'action-hold' &&
      latest.transition.fromStatus === transition.fromStatus &&
      latest.transition.toStatus === transition.toStatus
    );
    if (hasSameActionHoldSlot && (
      latest.transition.id === transition.id ||
      isTransitionActive(latest.transition)
    )) return false;
    if (getStreetRank(latest.status) > getStreetRank(transition.toStatus)) return false;
  }

  if (transition.type === 'street') {
    if (
      latest.transition?.type === 'street' &&
      latest.transition.fromStatus === transition.fromStatus &&
      latest.transition.toStatus === transition.toStatus
    ) return false;
    const latestRank = getStreetRank(latest.status);
    const fromRank = getStreetRank(transition.fromStatus);
    const targetRank = getStreetRank(transition.toStatus);
    const latestCommunityCount = (latest.communityCards || []).length;
    const nextCommunityCount = (nextState.communityCards || []).length;
    if (latestRank > fromRank && latestRank >= targetRank && latestCommunityCount >= nextCommunityCount) return false;
  }

  if (transition.type === 'showdown') {
    if (latest.status === 'showdown' || latest.settlement?.id) return false;
    if (getStreetRank(latest.status) > getStreetRank(transition.fromStatus)) return false;
  }

  return true;
};

export const shouldCommitSettlementState = (nextState) => (latest) => {
  if (!latest) return true;
  if (latest.isPaused && !nextState.isPaused) return false;
  if ((latest.handCount || 0) !== (nextState.handCount || 0)) {
    return (latest.handCount || 0) < (nextState.handCount || 0);
  }
  return !latest.settlement?.id;
};

export const shouldCommitGameProgressState = (nextState) => (latest) => {
  if (!latest) return true;
  if (latest.isPaused && !nextState.isPaused) return false;
  if ((latest.handCount || 0) !== (nextState.handCount || 0)) {
    return (latest.handCount || 0) < (nextState.handCount || 0);
  }
  return true;
};

export const shouldCommitTransitionCompletionState = (transitionId, nextState) => (latest) => {
  if (!latest?.transition?.id || latest.transition.id !== transitionId) return false;
  return shouldCommitGameProgressState(nextState)(latest);
};

export const getActionSourceToken = (state, playerIndex = state?.turnIndex) => {
  const player = state?.players?.[playerIndex];
  if (!state || !player) return null;
  return {
    handCount: state.handCount || 0,
    status: state.status || '',
    turnIndex: playerIndex,
    playerUid: player.uid,
    currentBet: quantizeChipAmount(state.currentBet || 0, 'floor'),
    pot: quantizeChipAmount(state.pot || 0, 'floor'),
    playerBet: quantizeChipAmount(player.bet || 0, 'floor'),
    playerChips: quantizeChipAmount(player.chips || 0, 'floor'),
    playerHasActed: Boolean(player.hasActed),
    playerFolded: Boolean(player.folded),
    playerAllIn: Boolean(player.allIn),
  };
};

export const isSameActionSource = (state, token) => {
  if (!state || !token) return false;
  if (
    state.isPaused ||
    !isGameInProgress(state.status) ||
    state.transition?.pausedAt ||
    isTransitionActive(state.transition)
  ) return false;
  const latestToken = getActionSourceToken(state, state.turnIndex);
  if (!latestToken || !playerNeedsAction(state.players?.[state.turnIndex], state)) return false;
  return Object.keys(token).every((key) => latestToken[key] === token[key]);
};

export const getNextPlayerIndex = (players, startIndex, predicate) => {
  if (!players.length) return -1;
  for (let step = 1; step <= players.length; step += 1) {
    const index = (startIndex + step) % players.length;
    if (predicate(players[index], index)) return index;
  }
  return -1;
};

export const getFirstPlayerIndex = (players, predicate) => {
  return players.findIndex((player, index) => predicate(player, index));
};

export const getActiveSeatIndexes = (players) => {
  return players
    .map((player, index) => ({ player, index }))
    .filter(({ player }) => !player.folded)
    .map(({ index }) => index);
};

export const getNextActionIndex = (players, startIndex) => {
  return getNextPlayerIndex(players, startIndex, (player) => !player.folded && !player.allIn);
};

export const applyActionHoldTransition = (nextState, message = '本轮行动完成') => {
  const holdNow = Date.now();
  nextState.turnIndex = -1;
  nextState.updatedAt = holdNow;
  nextState.transition = createGameTransition({
    id: `${nextState.handCount || 0}:action-hold:${nextState.status}`,
    type: 'action-hold',
    fromStatus: nextState.status,
    toStatus: nextState.status,
    now: holdNow,
    message,
    totalPot: nextState.pot,
  });
};

export const applyImmediatePostActionProgress = (nextState) => {
  const activeContenders = nextState.players.filter((player) => !player.folded);
  const hasRecentVisibleAction = nextState.players.some((player) => player.lastAction);

  if (activeContenders.length === 1) {
    if (!hasRecentVisibleAction) return false;
    applyActionHoldTransition(nextState);
    return true;
  }

  const needToAct = nextState.players.filter((player) => !player.folded && !player.allIn);
  const isRoundComplete = needToAct.every((player) => player.hasActed && player.bet === nextState.currentBet);
  const mustWait = (needToAct.length >= 2 && !isRoundComplete) ||
                  (needToAct.length === 1 && needToAct[0].bet < nextState.currentBet);

  if (mustWait) {
    let nextTurn = getNextActionIndex(nextState.players, nextState.turnIndex);
    if (nextTurn === -1) {
      nextTurn = getFirstPlayerIndex(nextState.players, (player) => !player.folded && !player.allIn);
    }
    if (nextTurn === -1) return false;
    nextState.turnIndex = nextTurn;
    nextState.updatedAt = Date.now();
    return true;
  }

  if (hasRecentVisibleAction) {
    applyActionHoldTransition(nextState);
    return true;
  }

  return false;
};

export const applyPlayerActionToState = ({
  nextState,
  playerIndex,
  actionType,
  amount = 0,
  addLogEntry = addLog,
}) => {
  const me = nextState.players[playerIndex];
  if (!me || me.folded || me.allIn || me.isSittingOut) return false;

  const actionBettingOptions = getPlayerBettingOptions(nextState, me);
  const callAmount = actionBettingOptions.callAmount;
  const now = Date.now();
  if (me.isAi) {
    me.lastSeenAt = now;
    me.isOnline = true;
    me.disconnectedAt = null;
  } else {
    Object.assign(me, stampPlayerPresence(me, now));
  }

  if (actionType === 'fold') {
    me.folded = true;
    me.lastAction = 'fold';
    nextState.logs = addLogEntry(nextState, `${me.name} 弃牌`);
  } else if (actionType === 'call') {
    const actualCall = Math.min(callAmount, me.chips);
    me.chips -= actualCall;
    me.bet += actualCall;
    nextState.pot += actualCall;
    me.totalContribution = (me.totalContribution || 0) + actualCall;
    if (me.chips === 0) me.allIn = true;
    me.lastAction = me.allIn ? 'allin' : (callAmount === 0 ? 'check' : 'call');
    const actName = callAmount === 0 ? '过牌' : '跟注';
    nextState.logs = addLogEntry(nextState, `${me.name} ${actName} ${actualCall > 0 ? actualCall : ''}`);
  } else if (actionType === 'raise') {
    if (!actionBettingOptions.canRaise) return false;
    const maxBet = actionBettingOptions.maxBet;
    const previousCurrentBet = nextState.currentBet;
    const minRaiseSize = actionBettingOptions.minRaiseSize;
    const minRaiseTarget = actionBettingOptions.minRaiseTarget;
    const requestedAmount = Number(amount);
    if (!Number.isFinite(requestedAmount)) return false;
    const totalToBet = clampRaiseAmount(requestedAmount, minRaiseTarget, maxBet);
    if (totalToBet <= previousCurrentBet) return false;
    if (totalToBet < minRaiseTarget && totalToBet !== maxBet) return false;
    const additionalNeeded = totalToBet - me.bet;
    if (additionalNeeded <= 0) return false;
    const actualPutIn = Math.min(additionalNeeded, me.chips);

    me.chips -= actualPutIn;
    me.bet += actualPutIn;
    nextState.pot += actualPutIn;
    me.totalContribution = (me.totalContribution || 0) + actualPutIn;

    const raiseSize = me.bet - previousCurrentBet;
    nextState.currentBet = Math.max(nextState.currentBet, me.bet);
    if (me.chips === 0) me.allIn = true;
    const isFullRaise = raiseSize >= minRaiseSize;
    me.lastAction = me.allIn ? 'allin' : 'raise';

    if (isFullRaise) {
      nextState.minRaise = raiseSize;
      nextState.lastAggressorUid = me.uid;
      nextState.handAggressorUid = me.uid;
      nextState.players.forEach((player, index) => {
        if (index !== playerIndex && !player.folded && !player.allIn) player.hasActed = false;
      });
    }
    nextState.logs = addLogEntry(nextState, `${me.name} ${isFullRaise ? '加注' : '全下'}到 ${me.bet}`);
  } else {
    return false;
  }

  me.hasActed = true;
  nextState.updatedAt = Date.now();
  return true;
};
