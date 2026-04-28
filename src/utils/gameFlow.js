export const TRANSITION_TIMING = {
  handStartMs: 1200,
  streetBaseMs: 1150,
  streetCardGapMs: 360,
  showdownIntroMs: 1800,
  showdownRevealMs: 1800,
  winnerHoldMs: 3800,
};

export const PHASE_INFO = {
  waiting: {
    label: '等待开局',
    shortLabel: '等待',
    detail: '等待玩家就绪',
  },
  'pre-flop': {
    label: '翻牌前',
    shortLabel: 'Pre-Flop',
    detail: '盲注已下，等待行动',
  },
  flop: {
    label: '翻牌圈',
    shortLabel: 'Flop',
    detail: '三张公共牌已发出',
  },
  turn: {
    label: '转牌圈',
    shortLabel: 'Turn',
    detail: '第四张公共牌已发出',
  },
  river: {
    label: '河牌圈',
    shortLabel: 'River',
    detail: '第五张公共牌已发出',
  },
  showdown: {
    label: '摊牌结算',
    shortLabel: 'Showdown',
    detail: '亮牌并分配奖池',
  },
};

export const getPhaseInfo = (status) => {
  return PHASE_INFO[status] || {
    label: '对局中',
    shortLabel: 'Playing',
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
  if (type === 'showdown') return TRANSITION_TIMING.showdownIntroMs;
  if (type === 'street') {
    return TRANSITION_TIMING.streetBaseMs + Math.max(1, cardCount) * TRANSITION_TIMING.streetCardGapMs;
  }
  if (toStatus === 'showdown') return TRANSITION_TIMING.showdownIntroMs;
  return TRANSITION_TIMING.streetBaseMs;
};

export const createGameTransition = ({
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
    id: `${now}-${type}-${fromStatus || 'none'}-${toStatus}`,
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

export const shouldAutoAdvanceAfterTransition = (room) => {
  if (!room || !['pre-flop', 'flop', 'turn', 'river'].includes(room.status)) return false;
  const contenders = (room.players || []).filter(player => !player.folded);
  const actionablePlayers = contenders.filter(player => !player.allIn);
  return contenders.length >= 2 && actionablePlayers.length <= 1;
};

export const getShowdownAutoStartDelay = (room, now = Date.now()) => {
  if (!room || room.status !== 'showdown') return 0;
  const maxSeq = Math.max(...((room.players || []).map(player => player.showSequence ?? -1)));
  const revealDelay = maxSeq >= 0 ? (maxSeq + 1) * TRANSITION_TIMING.showdownRevealMs : 0;
  const transitionDelay = isTransitionActive(room.transition, now)
    ? Math.max(0, Number(room.transition.endsAt) - now)
    : 0;
  return transitionDelay + revealDelay + TRANSITION_TIMING.winnerHoldMs;
};

export const buildSettlementPots = (players, contenders, totalPot) => {
  const contributionMap = {};
  (players || []).forEach(player => {
    contributionMap[player.uid] = Math.max(0, Number(player.totalContribution || 0));
  });

  const winByUid = {};
  const pots = [];
  let remainingPot = Math.max(0, Number(totalPot || 0));
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

    if (amount <= 0) break;

    const baseShare = Math.floor(amount / winners.length);
    const remainder = amount % winners.length;
    const potWinners = winners.map((winner, winnerIndex) => {
      const award = baseShare + (winnerIndex === 0 ? remainder : 0);
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
