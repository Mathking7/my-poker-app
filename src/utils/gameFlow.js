import { CHIP_UNIT, quantizeChipAmount, toFiniteNumber } from './chipMath.js';

export const TRANSITION_TIMING = {
  handStartMs: 1350,
  actionHoldMs: 1100,
  streetBaseMs: 1300,
  streetCardGapMs: 420,
  showdownIntroMs: 1800,
  showdownRevealMs: 1800,
  winnerHoldMs: 3900,
  transitionCompletionGraceMs: 250,
};

export const PHASE_INFO = {
  waiting: {
    label: '等待开局',
    shortLabel: '等待',
    detail: '等待玩家就绪',
  },
  'pre-flop': {
    label: '翻牌前',
    shortLabel: '翻前',
    detail: '盲注已下，等待行动',
  },
  flop: {
    label: '翻牌圈',
    shortLabel: '翻牌',
    detail: '三张公共牌已发出',
  },
  turn: {
    label: '转牌圈',
    shortLabel: '转牌',
    detail: '第四张公共牌已发出',
  },
  river: {
    label: '河牌圈',
    shortLabel: '河牌',
    detail: '第五张公共牌已发出',
  },
  showdown: {
    label: '摊牌结算',
    shortLabel: '摊牌',
    detail: '亮牌并分配奖池',
  },
};

export const getPhaseInfo = (status) => {
  return PHASE_INFO[status] || {
    label: '对局中',
    shortLabel: '进行中',
    detail: '等待下一步行动',
  };
};

export const getCommunityCountForStatus = (status) => {
  if (status === 'flop') return 3;
  if (status === 'turn') return 4;
  if (status === 'river' || status === 'showdown') return 5;
  return 0;
};

export const getTransitionDuration = ({ type, toStatus, cardCount = 0 }) => {
  if (type === 'hand-start') return TRANSITION_TIMING.handStartMs;
  if (type === 'action-hold') return TRANSITION_TIMING.actionHoldMs;
  if (type === 'showdown') return TRANSITION_TIMING.showdownIntroMs;
  if (type === 'street') {
    return TRANSITION_TIMING.streetBaseMs + Math.max(1, cardCount) * TRANSITION_TIMING.streetCardGapMs;
  }
  if (toStatus === 'showdown') return TRANSITION_TIMING.showdownIntroMs;
  return TRANSITION_TIMING.streetBaseMs;
};

export const createGameTransition = ({
  id = null,
  type,
  fromStatus = null,
  toStatus,
  now = Date.now(),
  message = '',
  cardCount = 0,
  totalPot = 0,
  autoAdvance = false,
}) => {
  const durationMs = getTransitionDuration({ type, toStatus, cardCount });
  return {
    id: id || `${now}-${type}-${fromStatus || 'none'}-${toStatus}`,
    type,
    fromStatus,
    toStatus,
    message,
    cardCount,
    totalPot,
    autoAdvance,
    startedAt: now,
    endsAt: now + durationMs,
    durationMs,
  };
};

export const isTransitionActive = (transition, now = Date.now()) => {
  return Boolean(transition?.endsAt && Number(transition.endsAt) > now);
};

export const getTransitionProgress = (transition, now = Date.now()) => {
  if (!transition?.startedAt || !transition?.endsAt) return 1;
  const startedAt = Number(transition.startedAt);
  const endsAt = Number(transition.endsAt);
  const duration = Math.max(1, endsAt - startedAt);
  return Math.min(1, Math.max(0, (now - startedAt) / duration));
};

export const shouldRevealAllInHands = (room) => {
  if (!room || !['pre-flop', 'flop', 'turn', 'river'].includes(room.status)) return false;
  const contenders = (room.players || []).filter(player => !player.folded);
  const actionablePlayers = contenders.filter(player => !player.allIn);
  if (contenders.length < 2 || actionablePlayers.length > 1) return false;
  if (actionablePlayers.length === 0) return true;
  const loneActionPlayer = actionablePlayers[0];
  return quantizeChipAmount(loneActionPlayer.bet || 0, 'floor') >= quantizeChipAmount(room.currentBet || 0, 'floor');
};

export const shouldAutoAdvanceAfterTransition = (room) => {
  if (room?.transition?.type === 'action-hold') return true;
  return shouldRevealAllInHands(room);
};

export const shouldSkipShowdownReveal = (room) => {
  if (!room || room.status !== 'showdown' || !room.allInRunout) return false;
  return (room.players || []).some(player => !player.folded && player.showCards && player.hand?.length);
};

export const getShowdownAutoStartDelay = (room, now = Date.now()) => {
  if (!room || room.status !== 'showdown') return 0;
  const maxSeq = Math.max(-1, ...((room.players || []).map(player => player.showSequence ?? -1)));
  const revealDelay = !shouldSkipShowdownReveal(room) && maxSeq >= 0
    ? (maxSeq + 1) * TRANSITION_TIMING.showdownRevealMs
    : 0;
  const transitionDelay = isTransitionActive(room.transition, now)
    ? Math.max(0, Number(room.transition.endsAt) - now)
    : 0;
  return transitionDelay + revealDelay + TRANSITION_TIMING.winnerHoldMs;
};

const getRaiseBounds = (minAmount, maxAmount) => {
  const rawMin = Math.max(0, Math.floor(toFiniteNumber(minAmount)));
  const rawMax = Math.max(0, Math.floor(toFiniteNumber(maxAmount, rawMin)));
  const max = quantizeChipAmount(rawMax, 'floor');
  const min = Math.min(max, quantizeChipAmount(rawMin, 'ceil'));
  return { min, max };
};

export const clampRaiseAmount = (amount, minAmount, maxAmount) => {
  const { min, max } = getRaiseBounds(minAmount, maxAmount);
  const value = quantizeChipAmount(amount, 'nearest');
  return Math.min(max, Math.max(min, value));
};

export const getRaiseIncrementAmount = (totalAmount, playerBet = 0) => {
  const committed = quantizeChipAmount(playerBet || 0, 'floor');
  return Math.max(0, quantizeChipAmount(toFiniteNumber(totalAmount) - committed, 'nearest'));
};

export const getRaiseIncrementBounds = ({ playerBet = 0, minRaiseTarget = 0, maxBet = 0 }) => {
  const committed = quantizeChipAmount(playerBet || 0, 'floor');
  const max = Math.max(0, quantizeChipAmount(toFiniteNumber(maxBet) - committed, 'floor'));
  const min = Math.min(max, Math.max(0, quantizeChipAmount(toFiniteNumber(minRaiseTarget) - committed, 'ceil')));
  return { min, max };
};

export const getTotalRaiseAmountFromIncrement = ({ incrementAmount, playerBet = 0, minRaiseTarget = 0, maxBet = 0 }) => {
  const committed = quantizeChipAmount(playerBet || 0, 'floor');
  return clampRaiseAmount(committed + toFiniteNumber(incrementAmount), minRaiseTarget, maxBet);
};

const getRaiseAnchor = (minAmount, potAmount, maxAmount) => {
  const { min, max } = getRaiseBounds(minAmount, maxAmount);
  return clampRaiseAmount(toFiniteNumber(potAmount, min), min, max);
};

const getRaiseSliderAnchor = (minAmount, potAmount, maxAmount) => {
  const { min, max } = getRaiseBounds(minAmount, maxAmount);
  if (max <= min) return max > 0 ? 100 : 0;

  const anchor = getRaiseAnchor(min, potAmount, max);
  if (anchor <= min) return 0;
  if (anchor >= max) return 100;

  const potRatio = (anchor - min) / Math.max(1, max - min);
  return Math.min(92, Math.max(8, 8 + 84 * Math.pow(potRatio, 0.55)));
};

const roundSliderValue = (value) => Math.round(value * 100) / 100;

export const getNonlinearRaiseAmount = ({ sliderValue, minAmount, potAmount, maxAmount }) => {
  const { min, max } = getRaiseBounds(minAmount, maxAmount);
  if (max <= min) return max;

  const anchor = getRaiseAnchor(min, potAmount, max);
  const slider = Math.min(100, Math.max(0, toFiniteNumber(sliderValue)));
  const anchorSlider = getRaiseSliderAnchor(min, anchor, max);

  if (anchor <= min) {
    const t = slider / 100;
    return clampRaiseAmount(Math.round(min + (max - min) * Math.pow(t, 2.1)), min, max);
  }

  if (anchor >= max) {
    const t = slider / 100;
    return clampRaiseAmount(Math.round(min + (max - min) * Math.pow(t, 1.2)), min, max);
  }

  if (slider <= anchorSlider) {
    const span = Math.max(0, anchor - min);
    const t = anchorSlider <= 0 ? 1 : slider / anchorSlider;
    return clampRaiseAmount(Math.round(min + span * Math.pow(t, 1.08)), min, max);
  }

  const t = (slider - anchorSlider) / (100 - anchorSlider);
  return clampRaiseAmount(Math.round(anchor + (max - anchor) * Math.pow(t, 1.6)), min, max);
};

export const getSliderValueForRaiseAmount = ({ amount, minAmount, potAmount, maxAmount }) => {
  const { min, max } = getRaiseBounds(minAmount, maxAmount);
  if (max <= min) return max > 0 ? 100 : 0;

  const anchor = getRaiseAnchor(min, potAmount, max);
  const value = clampRaiseAmount(amount, min, max);
  const anchorSlider = getRaiseSliderAnchor(min, anchor, max);

  if (anchor <= min) {
    const t = Math.min(1, Math.max(0, (value - min) / Math.max(1, max - min)));
    return roundSliderValue(100 * Math.pow(t, 1 / 2.1));
  }

  if (anchor >= max) {
    const t = Math.min(1, Math.max(0, (value - min) / Math.max(1, max - min)));
    return roundSliderValue(100 * Math.pow(t, 1 / 1.2));
  }

  if (value <= anchor) {
    const span = Math.max(1, anchor - min);
    const t = Math.min(1, Math.max(0, (value - min) / span));
    return roundSliderValue(anchorSlider * Math.pow(t, 1 / 1.08));
  }

  const t = Math.min(1, Math.max(0, (value - anchor) / Math.max(1, max - anchor)));
  return roundSliderValue(anchorSlider + (100 - anchorSlider) * Math.pow(t, 1 / 1.6));
};

export const getFullPotSliderMark = ({ fullPotRaiseTarget = 0, minRaiseTarget = 0, maxBet = 0 }) => {
  const target = quantizeChipAmount(fullPotRaiseTarget, 'floor');
  const min = quantizeChipAmount(minRaiseTarget, 'ceil');
  const max = quantizeChipAmount(maxBet, 'floor');

  if (target <= min || target >= max) {
    return {
      visible: false,
      position: null,
    };
  }

  return {
    visible: true,
    position: getSliderValueForRaiseAmount({
      amount: target,
      minAmount: min,
      potAmount: target,
      maxAmount: max,
    }),
  };
};

const getTrackedContribution = (player) => quantizeChipAmount(
  player?.totalContribution != null ? player.totalContribution : (player?.bet || 0),
  'floor',
);

export const getPlayerBettingOptions = (room, playerOrUid) => {
  const players = room?.players || [];
  const player = typeof playerOrUid === 'string'
    ? players.find((candidate) => candidate.uid === playerOrUid)
    : playerOrUid;

  if (!room || !player) {
    return {
      callAmount: 0,
      rawCallAmount: 0,
      effectiveCallAmount: 0,
      maxBet: 0,
      minRaiseSize: CHIP_UNIT * 2,
      minRaiseTarget: 0,
      potAfterCall: 0,
      potAfterEffectiveCall: 0,
      contestablePotAfterCall: 0,
      canRaise: false,
      hasOpponentToRaiseAgainst: false,
      facingShortAllInAfterActing: false,
      isCallingAllIn: false,
      isFacingCoveringAllIn: false,
    };
  }

  const currentBet = quantizeChipAmount(room.currentBet || 0, 'floor');
  const playerBet = quantizeChipAmount(player.bet || 0, 'floor');
  const playerChips = quantizeChipAmount(player.chips || 0, 'floor');
  const rawCallAmount = Math.max(0, currentBet - playerBet);
  const effectiveCallAmount = Math.min(rawCallAmount, playerChips);
  const callAmount = effectiveCallAmount;
  const maxBet = playerBet + playerChips;
  const minRaiseSize = Math.max(CHIP_UNIT, quantizeChipAmount(room.minRaise || CHIP_UNIT * 2, 'ceil'));
  const minRaiseTarget = Math.min(currentBet + minRaiseSize, maxBet);
  const hasChipsBeyondCall = playerChips > callAmount;
  const hasHigherBetAvailable = maxBet > currentBet;
  const hasOpponentToRaiseAgainst = players.some((candidate) => (
    candidate.uid !== player.uid &&
    !candidate.folded &&
    !candidate.allIn &&
    !candidate.isSittingOut &&
    quantizeChipAmount(candidate.chips || 0, 'floor') > 0
  ));
  const facingShortAllInAfterActing = Boolean(
    player.hasActed &&
    rawCallAmount > 0 &&
    rawCallAmount < minRaiseSize
  );
  const isCallingAllIn = rawCallAmount > 0 && playerChips > 0 && effectiveCallAmount >= playerChips;
  const isFacingCoveringAllIn = rawCallAmount > effectiveCallAmount;
  const potAfterEffectiveCall = quantizeChipAmount((room.pot || 0) + effectiveCallAmount, 'floor');
  const playerContributionAfterCall = getTrackedContribution(player) + effectiveCallAmount;
  const trackedPotAfterCall = players.reduce((sum, candidate) => (
    sum + getTrackedContribution(candidate) + (candidate.uid === player.uid ? effectiveCallAmount : 0)
  ), 0);
  const untrackedDeadPot = Math.max(0, potAfterEffectiveCall - trackedPotAfterCall);
  const contestablePotAfterCall = Math.min(
    potAfterEffectiveCall,
    quantizeChipAmount(players.reduce((sum, candidate) => {
      const contributionAfterCall = getTrackedContribution(candidate) +
        (candidate.uid === player.uid ? effectiveCallAmount : 0);
      return sum + Math.min(contributionAfterCall, playerContributionAfterCall);
    }, untrackedDeadPot), 'floor'),
  );

  return {
    callAmount,
    rawCallAmount,
    effectiveCallAmount,
    maxBet,
    minRaiseSize,
    minRaiseTarget,
    potAfterCall: potAfterEffectiveCall,
    potAfterEffectiveCall,
    contestablePotAfterCall,
    canRaise: Boolean(
      !player.folded &&
      !player.allIn &&
      !player.isSittingOut &&
      hasChipsBeyondCall &&
      hasHigherBetAvailable &&
      hasOpponentToRaiseAgainst &&
      !facingShortAllInAfterActing
    ),
    hasOpponentToRaiseAgainst,
    facingShortAllInAfterActing,
    isCallingAllIn,
    isFacingCoveringAllIn,
  };
};

const getClockwiseOrderFromButton = (players = [], dealerIndex = -1) => {
  if (!players.length) return [];
  const start = Number.isInteger(dealerIndex) && dealerIndex >= 0 && dealerIndex < players.length
    ? dealerIndex
    : players.length - 1;
  return players.map((_, offset) => (start + 1 + offset) % players.length);
};

const orderWinnersForOddChips = (players, winners, dealerIndex) => {
  if (!Number.isInteger(dealerIndex)) return winners;
  const winnerUids = new Set(winners.map((winner) => winner.uid));
  const orderedUids = getClockwiseOrderFromButton(players, dealerIndex)
    .map((index) => players[index]?.uid)
    .filter((uid) => winnerUids.has(uid));
  if (orderedUids.length !== winners.length) return winners;
  const winnerByUid = new Map(winners.map((winner) => [winner.uid, winner]));
  return orderedUids.map((uid) => winnerByUid.get(uid));
};

export const buildSettlementPots = (players, contenders, totalPot, options = {}) => {
  const contributionMap = {};
  (players || []).forEach(player => {
    contributionMap[player.uid] = quantizeChipAmount(player.totalContribution || 0, 'floor');
  });

  const winByUid = {};
  const pots = [];
  let remainingPot = quantizeChipAmount(totalPot || 0, 'floor');
  let potIndex = 0;

  while (remainingPot > 0) {
    const activeContenders = contenders.filter(contender => contributionMap[contender.uid] > 0);
    if (activeContenders.length === 0) break;

    const maxScore = Math.max(...activeContenders.map(contender => contender._score));
    const winners = activeContenders.filter(contender => contender._score === maxScore);
    const minContribution = Math.min(...winners.map(winner => contributionMap[winner.uid]));

    let amount = 0;
    Object.keys(contributionMap).forEach(uid => {
      const take = Math.min(contributionMap[uid], minContribution);
      amount += take;
      contributionMap[uid] -= take;
    });

    amount = Math.min(quantizeChipAmount(amount, 'floor'), remainingPot);
    if (amount <= 0) break;

    const orderedWinners = orderWinnersForOddChips(players || [], winners, options.dealerIndex);
    const baseShare = quantizeChipAmount(Math.floor(amount / orderedWinners.length), 'floor');
    let remainder = amount - baseShare * orderedWinners.length;
    const potWinners = orderedWinners.map((winner) => {
      const oddChip = remainder >= CHIP_UNIT ? CHIP_UNIT : 0;
      remainder -= oddChip;
      const award = baseShare + oddChip;
      winByUid[winner.uid] = (winByUid[winner.uid] || 0) + award;
      return {
        uid: winner.uid,
        name: winner.name,
        rankName: winner._rankName || '',
        amount: award,
      };
    });

    pots.push({
      id: potIndex,
      label: potIndex === 0 ? '主池' : `边池 ${potIndex}`,
      amount,
      winners: potWinners,
    });

    remainingPot -= amount;
    potIndex += 1;
  }

  return {
    pots,
    winByUid,
    totalAwarded: Object.values(winByUid).reduce((sum, amount) => sum + amount, 0),
  };
};
