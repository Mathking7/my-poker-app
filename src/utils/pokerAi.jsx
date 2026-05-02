/* eslint-disable react-refresh/only-export-components -- This is a utility module; it uses .jsx to stay compatible with existing imports. */
import { CHIP_UNIT, quantizeChipAmount } from './chipMath';
import { clampRaiseAmount, getPlayerBettingOptions } from './gameFlow';
import {
  AI_PLAYER_NAMES,
  AI_POSTFLOP_TUNING,
  AI_PREFLOP_TUNING,
  AI_SIMULATION_ITERATIONS,
  AI_THINK_TIMING,
  getAiSimulationIterations,
} from './pokerAiConfig';
import { evaluate7Cards } from './pokerLogic';

export const AI_THINK_MIN_MS = AI_THINK_TIMING.minMs;
export const AI_THINK_MAX_MS = AI_THINK_TIMING.maxMs;

const SUITS = ['♠', '♥', '♣', '♦'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const RANK_VALUE = Object.fromEntries(RANKS.map((rank, index) => [rank, index + 2]));
const RANK_BY_VALUE = Object.fromEntries(Object.entries(RANK_VALUE).map(([rank, value]) => [value, rank]));

const HAND_RANK_STRENGTH = {
  高牌: 0.12,
  一对: 0.42,
  两对: 0.68,
  三条: 0.78,
  顺子: 0.84,
  同花: 0.86,
  葫芦: 0.94,
  四条: 0.98,
  同花顺: 1,
};

const getRank = (card) => card?.[1] || '';
const getSuit = (card) => card?.[0] || '';
const rankValue = (card) => RANK_VALUE[getRank(card)] || 0;
const clamp01 = (value) => Math.min(1, Math.max(0, value));
const safeRandom = (random) => (typeof random === 'function' ? random : Math.random);

const createFullDeck = () => {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push(`${suit}${rank}`);
  }
  return deck;
};

const shuffleInPlace = (cards, random = Math.random) => {
  const roll = safeRandom(random);
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(roll() * (index + 1));
    [cards[index], cards[swapIndex]] = [cards[swapIndex], cards[index]];
  }
  return cards;
};

const chooseCumulativeIndex = (cumulativeWeights, totalWeight, random = Math.random) => {
  if (!cumulativeWeights.length) return -1;
  if (totalWeight <= 0) return Math.floor(safeRandom(random)() * cumulativeWeights.length);
  const needle = safeRandom(random)() * totalWeight;
  let low = 0;
  let high = cumulativeWeights.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (cumulativeWeights[mid] < needle) low = mid + 1;
    else high = mid;
  }
  return low;
};

export const createAiPlayer = ({ existingPlayers = [], initialChips = 1000, now = Date.now() } = {}) => {
  const usedNames = new Set(existingPlayers.map((player) => player.name));
  const nameSeed = AI_PLAYER_NAMES.find((name) => !usedNames.has(name)) || `AI-${existingPlayers.filter((player) => player.isAi).length + 1}`;
  return {
    uid: `ai-${now}-${Math.random().toString(36).slice(2, 7)}`,
    name: nameSeed,
    chips: quantizeChipAmount(initialChips, 'floor'),
    hand: [],
    bet: 0,
    folded: false,
    allIn: false,
    hasActed: false,
    isSittingOut: false,
    waitingNextHand: false,
    lastAction: null,
    isAi: true,
    aiStyle: 'balanced',
    lastSeenAt: now,
    disconnectedAt: null,
    isOnline: true,
  };
};

export const getAiThinkDelay = () => (
  AI_THINK_MIN_MS + Math.floor(Math.random() * (AI_THINK_MAX_MS - AI_THINK_MIN_MS + 1))
);

export const buildAiDecisionSnapshot = (room, aiPlayer) => {
  const aiUid = aiPlayer?.uid;
  return {
    id: room?.id,
    status: room?.status,
    handCount: room?.handCount || 0,
    dealerIndex: room?.dealerIndex ?? -1,
    turnIndex: room?.turnIndex ?? -1,
    pot: quantizeChipAmount(room?.pot || 0, 'floor'),
    currentBet: quantizeChipAmount(room?.currentBet || 0, 'floor'),
    minRaise: quantizeChipAmount(room?.minRaise || CHIP_UNIT * 2, 'ceil'),
    communityCards: [...(room?.communityCards || [])],
    lastAggressorUid: room?.lastAggressorUid || null,
    handAggressorUid: room?.handAggressorUid || null,
    players: (room?.players || []).map((player) => ({
      uid: player.uid,
      name: player.name,
      isAi: Boolean(player.isAi),
      aiStyle: player.aiStyle,
      hand: player.uid === aiUid ? [...(aiPlayer?.hand || player.hand || [])] : [],
      bet: quantizeChipAmount(player.bet || 0, 'floor'),
      chips: quantizeChipAmount(player.chips || 0, 'floor'),
      folded: Boolean(player.folded),
      allIn: Boolean(player.allIn),
      hasActed: Boolean(player.hasActed),
      isSittingOut: Boolean(player.isSittingOut),
      waitingNextHand: Boolean(player.waitingNextHand),
      lastAction: player.lastAction || null,
      totalContribution: quantizeChipAmount(
        player.totalContribution != null ? player.totalContribution : (player.bet || 0),
        'floor',
      ),
    })),
  };
};

const getActiveOpponents = (room, aiUid) => (room?.players || []).filter((player) => (
  player.uid !== aiUid &&
  !player.folded &&
  !player.isSittingOut
));

const getActiveSeatOrder = (players = [], dealerIndex = -1) => {
  if (!players.length) return [];
  const start = Number.isInteger(dealerIndex) && dealerIndex >= 0 && dealerIndex < players.length
    ? dealerIndex
    : players.length - 1;
  const order = [];
  for (let offset = 1; offset <= players.length; offset += 1) {
    const index = (start + offset) % players.length;
    const player = players[index];
    if (player && !player.folded && !player.isSittingOut) order.push(player.uid);
  }
  return order;
};

const getPositionValue = (room, aiUid) => {
  const order = getActiveSeatOrder(room?.players || [], room?.dealerIndex ?? -1);
  if (order.length <= 1) return 0.5;
  const index = order.indexOf(aiUid);
  if (index === -1) return 0.5;
  return clamp01(index / (order.length - 1));
};

const getHoleProfile = (holeCards = []) => {
  if (holeCards.length < 2) {
    return {
      high: 0,
      low: 0,
      pair: false,
      suited: false,
      gap: 0,
      connected: false,
      broadwayCount: 0,
      ace: false,
    };
  }
  const [first, second] = holeCards;
  const high = Math.max(rankValue(first), rankValue(second));
  const low = Math.min(rankValue(first), rankValue(second));
  const pair = high === low;
  const suited = getSuit(first) === getSuit(second);
  const gap = Math.abs(high - low);
  return {
    high,
    low,
    pair,
    suited,
    gap,
    connected: gap <= 1,
    broadwayCount: [high, low].filter((value) => value >= 10).length,
    ace: high === 14,
  };
};

const estimatePreflopStrength = (holeCards = []) => {
  const profile = getHoleProfile(holeCards);
  if (!profile.high) return 0.4;

  let score = 0.24 + (profile.high - 2) * 0.026 + (profile.low - 2) * 0.017;
  if (profile.pair) score = 0.46 + ((profile.high - 2) / 12) * 0.44;
  if (profile.suited) score += 0.035;
  if (profile.connected) score += 0.025;
  if (profile.gap === 2) score += 0.012;
  if (profile.gap >= 3) score -= 0.015 * Math.min(4, profile.gap - 2);
  if (profile.ace) score += profile.low >= 10 ? 0.03 : 0.015;
  if (profile.broadwayCount === 2) score += 0.035;
  if (!profile.pair && profile.low <= 5 && profile.gap >= 4) score -= 0.045;
  if (!profile.pair && profile.high <= 9 && profile.gap >= 3 && !profile.suited) score -= 0.045;

  return clamp01(score);
};

const getRankCounts = (cards = []) => {
  const counts = {};
  cards.forEach((card) => {
    const value = rankValue(card);
    if (value) counts[value] = (counts[value] || 0) + 1;
  });
  return counts;
};

const getSuitCounts = (cards = []) => {
  const counts = {};
  cards.forEach((card) => {
    const suit = getSuit(card);
    if (suit) counts[suit] = (counts[suit] || 0) + 1;
  });
  return counts;
};

const expandRanksForWheel = (values) => {
  const unique = [...new Set(values)].sort((a, b) => a - b);
  if (unique.includes(14)) unique.unshift(1);
  return [...new Set(unique)];
};

const getStraightPotential = (cards = []) => {
  const ranks = expandRanksForWheel(cards.map(rankValue).filter(Boolean));
  let bestWindow = 0;
  let openEnded = false;
  let gutshot = false;
  for (let start = 1; start <= 10; start += 1) {
    const window = [start, start + 1, start + 2, start + 3, start + 4];
    const hits = window.filter((value) => ranks.includes(value)).length;
    bestWindow = Math.max(bestWindow, hits);
    if (hits === 4) {
      const missing = window.find((value) => !ranks.includes(value));
      if (missing === start || missing === start + 4) openEnded = true;
      else gutshot = true;
    }
  }
  return { bestWindow, openEnded, gutshot };
};

const analyzeBoardTexture = (communityCards = []) => {
  const boardRanks = communityCards.map(rankValue).filter(Boolean);
  const suitCounts = Object.values(getSuitCounts(communityCards));
  const rankCounts = Object.values(getRankCounts(communityCards));
  const straight = getStraightPotential(communityCards);
  const maxSuitCount = Math.max(0, ...suitCounts);
  const paired = rankCounts.some((count) => count >= 2);
  const monotone = communityCards.length >= 3 && maxSuitCount >= 3;
  const twoTone = communityCards.length >= 3 && maxSuitCount === 2;
  const highCard = Math.max(0, ...boardRanks);
  const wetness = clamp01(
    (maxSuitCount >= 3 ? 0.34 : (maxSuitCount === 2 ? 0.16 : 0)) +
    (straight.bestWindow >= 4 ? 0.36 : (straight.bestWindow === 3 ? 0.16 : 0)) +
    (paired ? 0.08 : 0) +
    (highCard <= 10 ? 0.08 : 0),
  );

  return {
    highCard,
    paired,
    monotone,
    twoTone,
    wetness,
    dryness: 1 - wetness,
    highCardPressure: highCard >= 13 ? 0.12 : (highCard === 12 ? 0.07 : 0),
  };
};

const getPairQuality = (holeCards, communityCards, rankCounts) => {
  const boardRanks = communityCards.map(rankValue).filter(Boolean);
  const boardHigh = Math.max(0, ...boardRanks);
  const holeRanks = holeCards.map(rankValue);
  const pairRanks = Object.entries(rankCounts)
    .filter(([, count]) => count >= 2)
    .map(([rank]) => Number(rank))
    .sort((a, b) => b - a);
  const pairRank = pairRanks[0] || 0;
  const pocketPair = holeRanks[0] && holeRanks[0] === holeRanks[1];

  if (pocketPair && holeRanks[0] > boardHigh) return { label: 'overpair', bonus: 0.24 };
  if (pairRank >= boardHigh) return { label: 'topPair', bonus: 0.18 };
  if (boardRanks.filter((rank) => rank > pairRank).length <= 1) return { label: 'middlePair', bonus: 0.06 };
  return { label: 'weakPair', bonus: -0.08 };
};

const analyzeHandShape = (holeCards = [], communityCards = []) => {
  const allCards = [...holeCards, ...communityCards];
  const evaluation = evaluate7Cards(holeCards, communityCards);
  const rankCounts = getRankCounts(allCards);
  const suitCounts = getSuitCounts(allCards);
  const boardTexture = analyzeBoardTexture(communityCards);
  const madeBase = HAND_RANK_STRENGTH[evaluation.rankName] ?? 0.18;
  const pairQuality = evaluation.rankName === '一对'
    ? getPairQuality(holeCards, communityCards, rankCounts)
    : { label: '', bonus: 0 };
  const maxSuitCount = Math.max(0, ...Object.values(suitCounts));
  const hasFlush = evaluation.rankName === '同花' || evaluation.rankName === '同花顺';
  const straight = getStraightPotential(allCards);
  const streetComplete = communityCards.length >= 5;

  const flushDraw = !streetComplete && !hasFlush && maxSuitCount >= 4;
  const backdoorFlush = communityCards.length === 3 && !hasFlush && maxSuitCount === 3;
  const openEnded = !streetComplete && evaluation.rankName !== '顺子' && evaluation.rankName !== '同花顺' && straight.openEnded;
  const gutshot = !streetComplete && evaluation.rankName !== '顺子' && evaluation.rankName !== '同花顺' && straight.gutshot;
  const profile = getHoleProfile(holeCards);
  const overcards = communityCards.length > 0
    ? holeCards.map(rankValue).filter((value) => value > boardTexture.highCard).length
    : 0;

  const drawStrength = clamp01(
    (flushDraw ? 0.22 : 0) +
    (openEnded ? 0.18 : 0) +
    (gutshot ? 0.08 : 0) +
    (backdoorFlush ? 0.035 : 0) +
    (overcards === 2 && communityCards.length === 3 ? 0.08 : 0) +
    (profile.suited && communityCards.length === 3 ? 0.02 : 0),
  );
  const madeStrength = clamp01(madeBase + pairQuality.bonus + (profile.high === 14 && evaluation.rankName === '高牌' ? 0.04 : 0));
  const blockerScore = clamp01(
    (profile.ace ? 0.09 : 0) +
    (profile.broadwayCount >= 2 ? 0.05 : 0) +
    (boardTexture.monotone && holeCards.some((card) => getSuit(card) === getSuit(communityCards[0]) && rankValue(card) >= 12) ? 0.08 : 0),
  );

  return {
    evaluation,
    madeStrength,
    drawStrength,
    totalStrength: clamp01(madeStrength + drawStrength * (streetComplete ? 0 : 0.75)),
    pairQuality: pairQuality.label,
    flushDraw,
    openEnded,
    gutshot,
    overcards,
    blockerScore,
    boardTexture,
  };
};

const getAllCombos = (deck) => {
  const combos = [];
  for (let first = 0; first < deck.length; first += 1) {
    for (let second = first + 1; second < deck.length; second += 1) {
      combos.push([deck[first], deck[second]]);
    }
  }
  return combos;
};

const getOpponentRangeWeight = (hand, room, opponent, context) => {
  const preflop = estimatePreflopStrength(hand);
  const profile = getHoleProfile(hand);
  const communityCards = room?.communityCards || [];
  const action = opponent?.lastAction;
  const pressureBet = quantizeChipAmount(opponent?.bet || 0, 'floor');
  const currentBet = quantizeChipAmount(room?.currentBet || 0, 'floor');
  const handShape = communityCards.length >= 3 ? analyzeHandShape(hand, communityCards) : null;

  let weight = 0.18 + preflop * 1.25;
  if (profile.pair) weight += 0.12;
  if (profile.suited && profile.connected) weight += 0.08;
  if (profile.high <= 9 && profile.gap >= 4 && !profile.suited && !profile.pair) weight *= 0.55;

  if (currentBet > 0 && pressureBet >= currentBet) weight *= 0.78 + preflop * 0.65;
  if (action === 'raise' || action === 'allin') {
    weight *= communityCards.length >= 3
      ? 0.55 + (handShape?.madeStrength || 0) * 1.45 + (handShape?.drawStrength || 0) * 0.75
      : 0.55 + preflop * 1.2;
  } else if (action === 'call') {
    weight *= communityCards.length >= 3
      ? 0.7 + (handShape?.madeStrength || 0) * 0.75 + (handShape?.drawStrength || 0) * 0.65
      : 0.7 + preflop * 0.65;
  } else if (action === 'check') {
    weight *= communityCards.length >= 3
      ? 1.15 - (handShape?.madeStrength || 0) * 0.3
      : 1;
  }

  if (context.multiway) weight *= 0.95 + preflop * 0.12;
  return Math.max(0.02, weight);
};

const createOpponentRange = (baseDeck, room, opponent, context) => {
  let totalWeight = 0;
  const cumulativeWeights = [];
  const combos = getAllCombos(baseDeck).map((hand) => {
    const weight = getOpponentRangeWeight(hand, room, opponent, context);
    totalWeight += weight;
    cumulativeWeights.push(totalWeight);
    return hand;
  });
  return { combos, cumulativeWeights, totalWeight };
};

const drawOpponentHandFromRange = (range, usedCards, random) => {
  if (!range?.combos?.length) return [];
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const index = chooseCumulativeIndex(range.cumulativeWeights, range.totalWeight, random);
    const hand = range.combos[index];
    if (hand?.length === 2 && !usedCards.has(hand[0]) && !usedCards.has(hand[1])) return hand;
  }

  const start = Math.floor(safeRandom(random)() * range.combos.length);
  for (let offset = 0; offset < range.combos.length; offset += 1) {
    const hand = range.combos[(start + offset) % range.combos.length];
    if (hand?.length === 2 && !usedCards.has(hand[0]) && !usedCards.has(hand[1])) return hand;
  }
  return [];
};

const estimateStaticEquity = ({ holeCards = [], communityCards = [], opponentCount = 1 }) => {
  if (communityCards.length < 3) return estimatePreflopStrength(holeCards);
  const shape = analyzeHandShape(holeCards, communityCards);
  const multiwayPenalty = Math.min(0.18, Math.max(0, opponentCount - 1) * 0.07);
  return clamp01(shape.totalStrength + shape.drawStrength * 0.25 + shape.blockerScore * 0.08 - multiwayPenalty);
};

const estimateHandEquity = ({ room, aiPlayer, opponentCount = 1, iterations = 320, random = Math.random }) => {
  const holeCards = aiPlayer?.hand || [];
  const communityCards = room?.communityCards || [];
  if (holeCards.length < 2) return 0.4;
  if (iterations <= 0) return estimateStaticEquity({ holeCards, communityCards, opponentCount });

  const knownCards = new Set([...holeCards, ...communityCards]);
  const baseDeck = createFullDeck().filter((card) => !knownCards.has(card));
  const opponents = getActiveOpponents(room, aiPlayer.uid);
  const activeOpponents = opponents.slice(0, Math.max(1, opponentCount));
  const context = { multiway: activeOpponents.length > 1 };
  const opponentRanges = activeOpponents.map((opponent) => createOpponentRange(baseDeck, room, opponent, context));
  let equity = 0;
  let completed = 0;

  for (let run = 0; run < iterations; run += 1) {
    const usedCards = new Set(knownCards);
    const opponentHands = [];
    let valid = true;

    for (const range of opponentRanges) {
      const hand = drawOpponentHandFromRange(range, usedCards, random);
      if (hand.length < 2) {
        valid = false;
        break;
      }
      opponentHands.push(hand);
      usedCards.add(hand[0]);
      usedCards.add(hand[1]);
    }
    if (!valid) continue;

    const deck = shuffleInPlace(baseDeck.filter((card) => !usedCards.has(card)), random);
    const board = [...communityCards];
    while (board.length < 5) {
      const card = deck.pop();
      if (!card) {
        valid = false;
        break;
      }
      board.push(card);
    }
    if (!valid) continue;

    const aiScore = evaluate7Cards(holeCards, board).score;
    const scores = [aiScore, ...opponentHands.map((hand) => evaluate7Cards(hand, board).score)];
    const bestScore = Math.max(...scores);
    if (aiScore === bestScore) {
      const tiedCount = scores.filter((score) => score === bestScore).length;
      equity += 1 / tiedCount;
    }
    completed += 1;
  }

  if (completed === 0) return estimateStaticEquity({ holeCards, communityCards, opponentCount });
  const simulated = equity / completed;
  const staticEstimate = estimateStaticEquity({ holeCards, communityCards, opponentCount });
  return clamp01(simulated * 0.78 + staticEstimate * 0.22);
};

const getPotRaiseTarget = (room, options, fraction) => clampRaiseAmount(
  Math.floor((room.currentBet || 0) + options.potAfterCall * fraction),
  options.minRaiseTarget,
  options.maxBet,
);

const getBetFraction = ({ category, boardTexture, street, random = Math.random }) => {
  const roll = safeRandom(random)();
  if (category === 'thin') return roll < 0.65 ? 1 / 3 : 1 / 2;
  if (category === 'bluff') return street === 'river' ? (roll < 0.55 ? 2 / 3 : 3 / 4) : (roll < 0.7 ? 1 / 3 : 1 / 2);
  if (category === 'semi') return boardTexture.wetness > 0.45 ? (roll < 0.5 ? 2 / 3 : 3 / 4) : (roll < 0.65 ? 1 / 2 : 2 / 3);
  if (boardTexture.wetness > 0.52) return roll < 0.55 ? 3 / 4 : 1;
  return roll < 0.45 ? 1 / 2 : 2 / 3;
};

const getRaiseTarget = (room, options, category, context, random = Math.random) => {
  const fraction = getBetFraction({
    category,
    boardTexture: context.boardTexture || analyzeBoardTexture(room?.communityCards || []),
    street: context.street,
    random,
  });
  const stackPressure = options.maxBet <= Math.max(options.minRaiseTarget, options.potAfterCall * 1.25);
  if (stackPressure && (category === 'value' || context.equity > 0.72)) return options.maxBet;
  return getPotRaiseTarget(room, options, fraction);
};

const getPreflopDecision = ({ room, aiPlayer, options, equity, random }) => {
  const activeOpponents = getActiveOpponents(room, aiPlayer.uid).length;
  const positionValue = getPositionValue(room, aiPlayer.uid);
  const profile = getHoleProfile(aiPlayer.hand || []);
  const callAmount = options.effectiveCallAmount ?? options.callAmount;
  const rawCallAmount = options.rawCallAmount ?? options.callAmount;
  const currentBet = quantizeChipAmount(room?.currentBet || 0, 'floor');
  const stackBeforeAction = Math.max(CHIP_UNIT, quantizeChipAmount((aiPlayer.chips || 0) + (aiPlayer.bet || 0), 'floor'));
  const potAfterCallForOdds = options.contestablePotAfterCall ?? options.potAfterEffectiveCall ?? options.potAfterCall ?? ((room.pot || 0) + callAmount);
  const potOdds = callAmount > 0 ? callAmount / Math.max(CHIP_UNIT, potAfterCallForOdds) : 0;
  const commitmentPressure = callAmount / stackBeforeAction;
  const pressure = options.isCallingAllIn ? commitmentPressure * 0.35 : commitmentPressure;
  const activeOpponentList = getActiveOpponents(room, aiPlayer.uid);
  const opponentsAtCurrentPrice = activeOpponentList.filter((opponent) => (
    quantizeChipAmount(opponent.bet || 0, 'floor') >= currentBet
  )).length;
  const pendingOpponentCount = Math.max(0, activeOpponents - opponentsAtCurrentPrice);
  const largeRaise = rawCallAmount >= Math.max(CHIP_UNIT * 10, stackBeforeAction * 0.16);
  const offsuitBroadway = !profile.pair && !profile.suited && profile.broadwayCount === 2;
  const weakAce = !profile.pair && profile.ace && profile.low < 11 && !profile.suited;
  const valueSuitedBroadway = profile.suited && (profile.ace || (profile.high >= 13 && profile.low >= 12));
  const speculative = !profile.pair && profile.suited && (profile.connected || profile.gap === 2) && !valueSuitedBroadway;
  const multiwayCommittedPot = largeRaise && opponentsAtCurrentPrice >= 2;
  const headsUpHeavyPressure = largeRaise && activeOpponents === 1 && pressure > 0.22;
  const dominatedRisk = clamp01(
    (largeRaise && activeOpponents > 1 && offsuitBroadway ? 0.18 : 0) +
    (largeRaise && activeOpponents > 1 && weakAce ? 0.18 : 0) +
    (largeRaise && activeOpponents > 2 && !profile.suited && !profile.pair ? 0.04 : 0),
  );
  const fieldBehindPenalty = Math.min(0.06, pendingOpponentCount * 0.015);
  const committedMultiwayPenalty = Math.max(0, opponentsAtCurrentPrice - 1) * (largeRaise ? 0.05 : 0.035);
  const multiwayPricePenalty = fieldBehindPenalty + committedMultiwayPenalty;
  const largeRaisePenalty = largeRaise ? (pressure > 0.24 ? 0.08 : 0.04) : 0;
  const overcallDominationPenalty = multiwayCommittedPot && !profile.pair && !profile.suited
    ? (offsuitBroadway || weakAce ? 0.08 : 0.045)
    : 0;
  const speculativeOvercallPenalty = multiwayCommittedPot && speculative
    ? (pressure > 0.2 ? 0.12 : 0.06)
    : 0;
  const headsUpDominationPenalty = headsUpHeavyPressure && !profile.pair
    ? (offsuitBroadway || weakAce ? 0.17 : (speculative ? 0.07 : 0.035))
    : 0;
  const shallowSpeculativePenalty = speculative && pressure > 0.18 ? 0.08 : 0;
  const coveringAllInDiscount = options.isFacingCoveringAllIn ? 0.045 : 0;
  const impliedOddsCredit = (
    !options.isCallingAllIn &&
    pressure < 0.14 &&
    activeOpponents > 1 &&
    (speculative || (profile.pair && profile.high <= 9))
  ) ? 0.055 : 0;
  const openThreshold = clamp01(
    AI_PREFLOP_TUNING.openThresholdBase -
    positionValue * AI_PREFLOP_TUNING.openPositionDiscount -
    (activeOpponents <= 1 ? AI_PREFLOP_TUNING.openHeadsUpDiscount : 0),
  );
  const raiseThreshold = clamp01(
    AI_PREFLOP_TUNING.raiseThresholdBase -
    positionValue * AI_PREFLOP_TUNING.raisePositionDiscount -
    (activeOpponents <= 1 ? AI_PREFLOP_TUNING.raiseHeadsUpDiscount : 0),
  );

  if (callAmount <= 0) {
    const openChance = clamp01(
      (equity - openThreshold) * AI_PREFLOP_TUNING.openChanceSlope +
      AI_PREFLOP_TUNING.openChanceBase,
    );
    if (options.canRaise && equity >= openThreshold && safeRandom(random)() < openChance) {
      const category = equity >= 0.72 || profile.pair ? 'value' : 'thin';
      return { actionType: 'raise', amount: getRaiseTarget(room, options, category, { street: 'pre-flop', equity }, random), equity };
    }
    return { actionType: 'call', amount: 0, equity };
  }

  const required = clamp01(
    potOdds +
    pressure * (options.isCallingAllIn ? 0.08 : 0.28) +
    multiwayPricePenalty +
    largeRaisePenalty +
    dominatedRisk +
    overcallDominationPenalty +
    speculativeOvercallPenalty +
    headsUpDominationPenalty +
    shallowSpeculativePenalty -
    coveringAllInDiscount -
    impliedOddsCredit,
  );
  if (equity < required) {
    return { actionType: 'fold', amount: 0, equity, reason: 'preflop-price-discipline' };
  }

  const threeBetChance = clamp01(
    (equity - raiseThreshold) * AI_PREFLOP_TUNING.threeBetChanceSlope -
    pressure * AI_PREFLOP_TUNING.threeBetPressurePenalty,
  );
  if (options.canRaise && equity > raiseThreshold && safeRandom(random)() < threeBetChance) {
    return { actionType: 'raise', amount: getRaiseTarget(room, options, 'value', { street: 'pre-flop', equity }, random), equity, reason: 'preflop-value-raise' };
  }

  return { actionType: 'call', amount: 0, equity, reason: 'preflop-priced-call' };
};

const getPostflopDecision = ({ room, aiPlayer, options, equity, random }) => {
  const communityCards = room?.communityCards || [];
  const street = room?.status || 'flop';
  const activeOpponents = getActiveOpponents(room, aiPlayer.uid).length;
  const shape = analyzeHandShape(aiPlayer.hand || [], communityCards);
  const boardTexture = shape.boardTexture;
  const callAmount = options.callAmount;
  const potBeforeAction = Math.max(CHIP_UNIT, Number(room?.pot || 0));
  const potAfterCallForOdds = options.contestablePotAfterCall ?? (potBeforeAction + callAmount);
  const potOdds = callAmount > 0 ? callAmount / Math.max(CHIP_UNIT, potAfterCallForOdds) : 0;
  const pressure = callAmount > 0 ? callAmount / Math.max(CHIP_UNIT, aiPlayer.chips + aiPlayer.bet) : 0;
  const positionValue = getPositionValue(room, aiPlayer.uid);
  const hasInitiative = (
    room?.lastAggressorUid === aiPlayer.uid ||
    (!room?.lastAggressorUid && room?.handAggressorUid === aiPlayer.uid && communityCards.length >= 3)
  );
  const multiwayPenalty = Math.max(0, activeOpponents - 1) * AI_POSTFLOP_TUNING.multiwayPenaltyPerOpponent;
  const river = communityCards.length >= 5;
  const valueStrength = Math.max(shape.madeStrength, equity * 0.85);
  const showdownValue = shape.madeStrength + (river ? 0 : shape.drawStrength * 0.45);
  const noShowdownValue = shape.madeStrength < 0.34 && !river;
  const bluffScore = clamp01(
    boardTexture.dryness * 0.2 +
    (hasInitiative ? 0.22 : 0) +
    positionValue * 0.12 +
    shape.blockerScore * 0.65 +
    (activeOpponents <= 1 ? 0.11 : -0.1) -
    multiwayPenalty,
  );
  const semiBluffScore = clamp01(shape.drawStrength * 1.65 + positionValue * 0.08 + (hasInitiative ? 0.08 : 0) - multiwayPenalty);

  if (callAmount <= 0) {
    if (!options.canRaise) return { actionType: 'call', amount: 0, equity, reason: 'cannot-raise' };

    const trapChance = valueStrength > AI_POSTFLOP_TUNING.trapStrongValueThreshold && boardTexture.dryness > 0.55 ? 0.18 : 0.04;
    if (valueStrength >= AI_POSTFLOP_TUNING.valueBetThreshold && safeRandom(random)() > trapChance) {
      const category = valueStrength >= AI_POSTFLOP_TUNING.strongValueThreshold ? 'value' : 'thin';
      return {
        actionType: 'raise',
        amount: getRaiseTarget(room, options, category, { street, boardTexture, equity }, random),
        equity,
        reason: 'value-bet',
      };
    }

    if (!river && semiBluffScore > AI_POSTFLOP_TUNING.semiBluffThreshold && safeRandom(random)() < semiBluffScore) {
      return {
        actionType: 'raise',
        amount: getRaiseTarget(room, options, 'semi', { street, boardTexture, equity }, random),
        equity,
        reason: 'semi-bluff',
      };
    }

    const cBetChance = clamp01(
      (hasInitiative ? 0.44 : 0.11) +
      boardTexture.dryness * 0.18 +
      boardTexture.highCardPressure +
      shape.blockerScore * 0.35 +
      (noShowdownValue ? 0.08 : 0) -
      multiwayPenalty,
    );
    if (safeRandom(random)() < Math.max(cBetChance, river ? bluffScore * 0.42 : bluffScore)) {
      return {
        actionType: 'raise',
        amount: getRaiseTarget(room, options, river ? 'bluff' : 'thin', { street, boardTexture, equity }, random),
        equity,
        reason: river ? 'river-bluff' : 'c-bet',
      };
    }

    return { actionType: 'call', amount: 0, equity, reason: 'check' };
  }

  const largeBet = potOdds >= AI_POSTFLOP_TUNING.largeBetPotOdds || pressure >= AI_POSTFLOP_TUNING.largeBetPressure;
  const requiredEquity = clamp01(potOdds + pressure * 0.28 + multiwayPenalty * 0.35);
  const weakMade = shape.madeStrength < 0.45 && shape.drawStrength < 0.12;
  const dominatedPair = shape.pairQuality === 'weakPair' || (shape.pairQuality === 'middlePair' && largeBet);
  const drawImpliedOddsCredit = !river && shape.drawStrength >= 0.18 && pressure < 0.16
    ? AI_POSTFLOP_TUNING.drawImpliedOddsCredit
    : 0;

  if (
    (equity + drawImpliedOddsCredit < requiredEquity) ||
    (river && showdownValue < requiredEquity + 0.12 && !shape.blockerScore) ||
    (weakMade && equity < requiredEquity + 0.07) ||
    (dominatedPair && largeBet && equity < requiredEquity + 0.12) ||
    (pressure > 0.42 && valueStrength < 0.66)
  ) {
    return { actionType: 'fold', amount: 0, equity, reason: 'disciplined-fold' };
  }

  const raiseForValue = options.canRaise && valueStrength > Math.max(AI_POSTFLOP_TUNING.valueRaiseThreshold, requiredEquity + 0.26);
  const raiseSemiBluff = options.canRaise && !river && semiBluffScore > 0.5 && equity > requiredEquity + 0.05;
  const bluffRaise = options.canRaise && river && shape.madeStrength < 0.34 && bluffScore > AI_POSTFLOP_TUNING.bluffRaiseThreshold && safeRandom(random)() < bluffScore * 0.22;

  if (raiseForValue && safeRandom(random)() < clamp01((valueStrength - 0.62) * 1.45)) {
    return {
      actionType: 'raise',
      amount: getRaiseTarget(room, options, 'value', { street, boardTexture, equity }, random),
      equity,
      reason: 'value-raise',
    };
  }

  if ((raiseSemiBluff && safeRandom(random)() < semiBluffScore * 0.55) || bluffRaise) {
    return {
      actionType: 'raise',
      amount: getRaiseTarget(room, options, bluffRaise ? 'bluff' : 'semi', { street, boardTexture, equity }, random),
      equity,
      reason: bluffRaise ? 'bluff-raise' : 'semi-bluff-raise',
    };
  }

  return { actionType: 'call', amount: 0, equity, reason: 'profitable-call' };
};

export const decidePokerAiAction = (room, aiPlayer, config = {}) => {
  const random = safeRandom(config.random);
  const safeRoom = buildAiDecisionSnapshot(room, aiPlayer);
  const safeAiPlayer = safeRoom.players.find((player) => player.uid === aiPlayer?.uid) || {
    ...aiPlayer,
    hand: [...(aiPlayer?.hand || [])],
  };
  const options = getPlayerBettingOptions(safeRoom, safeAiPlayer);
  if (!safeAiPlayer?.hand?.length || safeAiPlayer.folded || safeAiPlayer.allIn) {
    return { actionType: 'call', amount: 0, equity: 0, reason: 'inactive' };
  }

  const activeOpponents = getActiveOpponents(safeRoom, safeAiPlayer.uid).length;
  const communityCards = safeRoom.communityCards || [];
  const simulationIterations = config.iterations ?? getAiSimulationIterations({
    highQuality: config.highQuality,
    communityCardCount: communityCards.length,
  });
  const simulatedEquity = estimateHandEquity({
    room: safeRoom,
    aiPlayer: safeAiPlayer,
    opponentCount: activeOpponents,
    iterations: simulationIterations,
    random,
  });
  const preflopStrength = estimatePreflopStrength(safeAiPlayer.hand || []);
  const equity = communityCards.length === 0
    ? clamp01(preflopStrength * 0.68 + simulatedEquity * 0.32)
    : simulatedEquity;

  if (communityCards.length === 0) {
    return getPreflopDecision({ room: safeRoom, aiPlayer: safeAiPlayer, options, equity, random });
  }

  return getPostflopDecision({ room: safeRoom, aiPlayer: safeAiPlayer, options, equity, random });
};

let aiWorker = null;
let workerRequestId = 0;

const getAiWorker = () => {
  if (typeof Worker === 'undefined') return null;
  if (!aiWorker) {
    aiWorker = new Worker(new URL('./pokerAi.worker.js', import.meta.url), { type: 'module' });
  }
  return aiWorker;
};

export const terminatePokerAiWorker = () => {
  if (aiWorker) {
    aiWorker.terminate();
    aiWorker = null;
  }
};

export const decidePokerAiActionAsync = (room, aiPlayer, config = {}) => {
  const snapshot = buildAiDecisionSnapshot(room, aiPlayer);
  const fallbackConfig = { ...config, highQuality: false, iterations: config.fallbackIterations ?? AI_SIMULATION_ITERATIONS.workerFallback };
  const fallback = () => decidePokerAiAction(snapshot, aiPlayer, fallbackConfig);
  const worker = config.useWorker === false ? null : getAiWorker();
  if (!worker) return Promise.resolve(fallback());

  const id = `${Date.now()}-${workerRequestId += 1}`;
  const timeoutMs = config.timeoutMs ?? AI_SIMULATION_ITERATIONS.workerTimeoutMs;
  const workerIterations = config.iterations ?? getAiSimulationIterations({
    highQuality: true,
    communityCardCount: (snapshot.communityCards || []).length,
  });

  return new Promise((resolve) => {
    let settled = false;
    const finish = (decision) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      resolve(decision || fallback());
    };
    const handleMessage = (event) => {
      if (event.data?.id !== id) return;
      finish(event.data.decision);
    };
    const handleError = () => finish(fallback());
    const timeoutId = setTimeout(() => finish(fallback()), timeoutMs);

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);
    try {
      worker.postMessage({
        id,
        room: snapshot,
        aiPlayer: snapshot.players.find((player) => player.uid === aiPlayer?.uid) || aiPlayer,
        config: {
          highQuality: true,
          iterations: workerIterations,
        },
      });
    } catch {
      finish(fallback());
    }
  });
};
