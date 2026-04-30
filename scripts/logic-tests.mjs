import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  MAX_INITIAL_CHIPS,
  MAX_TIME_LIMIT,
  MIN_INITIAL_CHIPS,
  MIN_TIME_LIMIT,
  getBigBlindForHand,
  getSmallBlindForHand,
  normalizeGameSettings,
} from '../src/utils/gameSettings.js';
import {
  CHIP_UNIT,
  quantizeChipAmount,
} from '../src/utils/chipMath.js';
import {
  EMPTY_ROOM_TTL_MS,
  PLAYER_STALE_MS,
  applyRoomMaintenance,
  getActivePlayerCount,
  isRoomExpired,
  isPlayerActive,
  shouldMarkLegacyRoom,
  stampPlayerPresence,
} from '../src/utils/roomMaintenance.js';
import {
  buildInitialRoomData,
  createRoomIdCandidate,
} from '../src/utils/roomCreation.js';
import {
  normalizePokerPlayer,
  normalizePokerRoom,
} from '../src/utils/pokerRoomSchema.js';
import {
  pauseTransitionClock,
  resumeTransitionClock,
} from '../src/utils/transitionClock.js';
import {
  TRANSITION_TIMING,
  buildSettlementPots,
  clampRaiseAmount,
  createGameTransition,
  getCommunityCountForStatus,
  getFullPotSliderMark,
  getNonlinearRaiseAmount,
  getPlayerBettingOptions,
  getRaiseIncrementAmount,
  getRaiseIncrementBounds,
  getSliderValueForRaiseAmount,
  getShowdownAutoStartDelay,
  getTotalRaiseAmountFromIncrement,
  getTransitionProgress,
  isTransitionActive,
  shouldAutoAdvanceAfterTransition,
  shouldRevealAllInHands,
  shouldSkipShowdownReveal,
} from '../src/utils/gameFlow.js';
import {
  canPlayerPotentiallyRaise,
  canPlayerTakeAction,
  getActionViewState,
} from '../src/utils/pokerViewState.js';
import {
  getDisplayAction,
  getActionLabel,
  shouldShowActionBubble,
} from '../src/utils/pokerUi.js';
import {
  addLog,
  applyImmediatePostActionProgress,
  applyPlayerActionToState,
  getActionSourceToken,
  getNextActionIndex,
  getPendingChipLabel,
  getPendingChipUpdate,
  isSameActionSource,
  playerNeedsAction,
} from '../src/utils/pokerGameEngine.js';
import {
  AI_PLAYER_NAMES,
  AI_SIMULATION_ITERATIONS,
  AI_THINK_TIMING,
  getAiSimulationIterations,
} from '../src/utils/pokerAiConfig.js';
import {
  getAiActionKey,
} from '../src/utils/pokerAiTurn.js';

const jsxDataUrl = (path) => {
  const source = fs.readFileSync(path, 'utf8');
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
};

const pokerLogicUrl = jsxDataUrl(new URL('../src/utils/pokerLogic.jsx', import.meta.url));
const { createDeck, evaluate7Cards } = await import(pokerLogicUrl);
const pokerAiSource = fs.readFileSync(new URL('../src/utils/pokerAi.jsx', import.meta.url), 'utf8')
  .replace("import { CHIP_UNIT, quantizeChipAmount } from './chipMath';", `import { CHIP_UNIT, quantizeChipAmount } from '${new URL('../src/utils/chipMath.js', import.meta.url).href}';`)
  .replace("import { clampRaiseAmount, getPlayerBettingOptions } from './gameFlow';", `import { clampRaiseAmount, getPlayerBettingOptions } from '${new URL('../src/utils/gameFlow.js', import.meta.url).href}';`)
  .replace("import {\n  AI_PLAYER_NAMES,\n  AI_POSTFLOP_TUNING,\n  AI_PREFLOP_TUNING,\n  AI_SIMULATION_ITERATIONS,\n  AI_THINK_TIMING,\n  getAiSimulationIterations,\n} from './pokerAiConfig';", `import {
  AI_PLAYER_NAMES,
  AI_POSTFLOP_TUNING,
  AI_PREFLOP_TUNING,
  AI_SIMULATION_ITERATIONS,
  AI_THINK_TIMING,
  getAiSimulationIterations,
} from '${new URL('../src/utils/pokerAiConfig.js', import.meta.url).href}';`)
  .replace("import { evaluate7Cards } from './pokerLogic';", `import { evaluate7Cards } from '${pokerLogicUrl}';`);
const { buildAiDecisionSnapshot, decidePokerAiAction } = await import(`data:text/javascript;base64,${Buffer.from(pokerAiSource).toString('base64')}`);

const unlimited = '\u65e0\u9650';
const seededRandom = (seed) => {
  let value = seed >>> 0;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
};

assert.equal(AI_THINK_TIMING.minMs, 450);
assert.equal(AI_THINK_TIMING.maxMs, 900);
assert.ok(AI_PLAYER_NAMES.length >= 5);
assert.equal(getAiSimulationIterations({ highQuality: false, communityCardCount: 0 }), AI_SIMULATION_ITERATIONS.fastPreflop);
assert.equal(getAiSimulationIterations({ highQuality: false, communityCardCount: 3 }), AI_SIMULATION_ITERATIONS.fastPostflop);
assert.equal(getAiSimulationIterations({ highQuality: true, communityCardCount: 0 }), AI_SIMULATION_ITERATIONS.highQualityPreflop);
assert.equal(getAiSimulationIterations({ highQuality: true, communityCardCount: 5 }), AI_SIMULATION_ITERATIONS.highQualityPostflop);
assert.equal(getAiActionKey('1234', null), '');
assert.equal(getAiActionKey('1234', {
  handCount: 2,
  status: 'flop',
  turnIndex: 1,
  playerUid: 'ai-1',
  currentBet: 40,
  pot: 120,
  playerBet: 20,
  playerChips: 960,
  playerHasActed: false,
  playerFolded: false,
  playerAllIn: false,
}), '1234:2:flop:1:ai-1:40:120:20:960:false:false:false');

assert.deepEqual(normalizeGameSettings({ initialChips: -1, timeLimit: 1, allowJoinDuringGame: 1 }), {
  initialChips: MIN_INITIAL_CHIPS,
  timeLimit: MIN_TIME_LIMIT,
  allowJoinDuringGame: true,
  doubleBlinds: false,
  autoTopUp: false,
});
assert.equal(normalizeGameSettings({ initialChips: 999999 }).initialChips, MAX_INITIAL_CHIPS);
assert.equal(normalizeGameSettings({ initialChips: 555 }).initialChips, 560);
assert.equal(normalizeGameSettings({ timeLimit: 999999 }).timeLimit, MAX_TIME_LIMIT);
assert.equal(normalizeGameSettings({ timeLimit: unlimited }).timeLimit, unlimited);
assert.equal(getSmallBlindForHand({ doubleBlinds: false }, 20), 10);
assert.equal(getBigBlindForHand({ doubleBlinds: false }, 20), 20);
assert.equal(getSmallBlindForHand({ doubleBlinds: true }, 1), 10);
assert.equal(getBigBlindForHand({ doubleBlinds: true }, 5), 20);
assert.equal(getSmallBlindForHand({ doubleBlinds: true }, 6), 20);
assert.equal(getBigBlindForHand({ doubleBlinds: true }, 6), 40);

const now = 1_000_000;
assert.equal(createRoomIdCandidate({ cryptoApi: null, random: () => 0 }), '1000');
assert.equal(createRoomIdCandidate({ cryptoApi: null, random: () => 0.999999 }), '9999');
assert.equal(createRoomIdCandidate({
  cryptoApi: {
    getRandomValues: (buffer) => {
      buffer[0] = 42;
      return buffer;
    },
  },
}), '1042');
const initialPublicRoom = buildInitialRoomData({
  roomId: '1234',
  user: { uid: 'host' },
  playerName: 'Host',
  gameType: 'texas',
  isPublic: true,
  settings: { initialChips: 555, timeLimit: 1 },
  now,
});
assert.equal(initialPublicRoom.id, '1234');
assert.equal(initialPublicRoom.hostUid, null);
assert.equal(initialPublicRoom.creatorUid, 'host');
assert.equal(initialPublicRoom.status, 'waiting');
assert.equal(initialPublicRoom.settings.initialChips, 560);
assert.equal(initialPublicRoom.settings.timeLimit, MIN_TIME_LIMIT);
assert.equal(initialPublicRoom.players.length, 1);
assert.equal(initialPublicRoom.players[0].uid, 'host');
assert.equal(initialPublicRoom.players[0].chips, 560);
assert.equal(initialPublicRoom.players[0].lastSeenAt, now);
assert.equal(buildInitialRoomData({
  roomId: '2345',
  user: { uid: 'host' },
  playerName: 'Host',
  gameType: 'texas',
  isPublic: false,
  settings: {},
  now,
}).hostUid, 'host');
assert.deepEqual(normalizePokerPlayer({ uid: 'p1', chips: 'bad', hand: null, bet: 7 }), {
  uid: 'p1',
  name: 'Player',
  chips: 0,
  hand: [],
  bet: 7,
  folded: false,
  allIn: false,
  hasActed: false,
  isSittingOut: false,
  waitingNextHand: false,
  isAi: false,
  isKicked: false,
  isOnline: false,
  disconnectedAt: null,
  lastAction: null,
  totalContribution: 0,
  showCards: false,
  showSequence: -1,
  highlightCards: [],
  winAmount: 0,
});
const normalizedLegacyRoom = normalizePokerRoom({
  id: '',
  status: 'legacy-status',
  players: [{ uid: 'p1', name: 'Alice', chips: 200 }],
  settings: { initialChips: 555 },
}, { roomId: '6789' });
assert.equal(normalizedLegacyRoom.id, '6789');
assert.equal(normalizedLegacyRoom.status, 'waiting');
assert.equal(normalizedLegacyRoom.players[0].name, 'Alice');
assert.equal(normalizedLegacyRoom.players[0].bet, 0);
assert.equal(normalizedLegacyRoom.settings.initialChips, 560);
assert.deepEqual(normalizedLegacyRoom.communityCards, []);
assert.equal(shouldMarkLegacyRoom({ players: [{ uid: 'a' }] }), true);
assert.equal(isRoomExpired({ players: [{ uid: 'a' }] }, now), false);
assert.equal(isRoomExpired({ players: [] }, now), true);
assert.equal(isRoomExpired({ presenceMigrationStartedAt: now - EMPTY_ROOM_TTL_MS - 1, players: [{ uid: 'a' }] }, now), true);
const active = stampPlayerPresence({ uid: 'a', name: 'A' }, now);
const stale = stampPlayerPresence({ uid: 'b', name: 'B', isSittingOut: false, folded: false, allIn: false }, now - PLAYER_STALE_MS - 1);
assert.equal(getActivePlayerCount({ players: [active, stale] }, now), 1);
assert.equal(getActivePlayerCount({
  presence: { b: { lastSeenAt: now } },
  players: [{ uid: 'b', name: 'B', isSittingOut: false }],
}, now), 1);
assert.equal(isPlayerActive({ uid: 'ai-1', name: 'AI', isAi: true, lastSeenAt: now }, now), false);
const aiMaintenance = applyRoomMaintenance({
  isPublic: true,
  status: 'flop',
  logs: [],
  players: [
    active,
    { uid: 'ai-1', name: 'AI', isAi: true, isSittingOut: false, folded: false, allIn: false, lastSeenAt: 0 },
  ],
}, now, 'a');
assert.equal(aiMaintenance.changed, false);
const maintenanceResult = applyRoomMaintenance({
  isPublic: false,
  hostUid: 'b',
  creatorUid: 'b',
  status: 'flop',
  logs: [],
  players: [active, stale],
}, now, 'a');
assert.equal(maintenanceResult.changed, true);
assert.equal(maintenanceResult.shouldAdvance, true);
assert.equal(maintenanceResult.room.hostUid, 'a');
const staleAfter = maintenanceResult.room.players.find((player) => player.uid === 'b');
assert.equal(staleAfter.isSittingOut, true);
assert.equal(staleAfter.folded, true);
assert.equal(staleAfter.hasActed, true);
assert.equal(staleAfter.isOnline, false);

const transition = createGameTransition({
  type: 'street',
  fromStatus: 'pre-flop',
  toStatus: 'flop',
  now,
  cardCount: 3,
});
const actionHoldTransition = createGameTransition({
  type: 'action-hold',
  fromStatus: 'flop',
  toStatus: 'flop',
  now,
});
assert.equal(transition.durationMs, TRANSITION_TIMING.streetBaseMs + 3 * TRANSITION_TIMING.streetCardGapMs);
assert.equal(actionHoldTransition.durationMs, TRANSITION_TIMING.actionHoldMs);
assert.equal(TRANSITION_TIMING.showdownIntroMs, 1800);
assert.equal(TRANSITION_TIMING.showdownRevealMs, 1800);
assert.equal(TRANSITION_TIMING.winnerHoldMs, 3900);
assert.ok(
  TRANSITION_TIMING.transitionCompletionGraceMs >= 200 && TRANSITION_TIMING.transitionCompletionGraceMs <= 450,
  'transition completion should keep a small sync buffer without adding visible lag',
);
assert.equal(isTransitionActive(transition, now + transition.durationMs - 1), true);
assert.equal(isTransitionActive(transition, now + transition.durationMs), false);
assert.equal(getTransitionProgress(transition, now), 0);
assert.equal(getTransitionProgress(transition, now + transition.durationMs), 1);
const pausedStreetTransition = pauseTransitionClock({
  id: 'pause-test',
  type: 'street',
  fromStatus: 'flop',
  toStatus: 'turn',
  startedAt: now,
  endsAt: now + 3000,
  durationMs: 3000,
}, now + 1000);
assert.equal(pausedStreetTransition.pausedAt, now + 1000);
assert.equal(pausedStreetTransition.pausedRemainingMs, 2000);
assert.ok(pausedStreetTransition.pausedProgress > 0.32 && pausedStreetTransition.pausedProgress < 0.34);
const resumedStreetTransition = resumeTransitionClock(pausedStreetTransition, now + 5000);
assert.equal(resumedStreetTransition.pausedAt, undefined);
assert.equal(resumedStreetTransition.pausedRemainingMs, undefined);
assert.equal(resumedStreetTransition.startedAt, now + 4000);
assert.equal(resumedStreetTransition.endsAt, now + 7000);
assert.equal(resumedStreetTransition.resumedAt, now + 5000);
assert.equal(getCommunityCountForStatus('turn'), 4);
assert.equal(shouldAutoAdvanceAfterTransition({
  status: 'flop',
  transition: actionHoldTransition,
  players: [{ folded: false, allIn: false }, { folded: false, allIn: false }],
}), true);
assert.equal(shouldAutoAdvanceAfterTransition({
  status: 'flop',
  players: [{ folded: false, allIn: true }, { folded: false, allIn: false }],
}), true);
assert.equal(shouldRevealAllInHands({
  status: 'flop',
  currentBet: 20,
  players: [
    { folded: false, allIn: true, bet: 10 },
    { folded: false, allIn: false, bet: 10 },
  ],
}), false);
assert.equal(shouldAutoAdvanceAfterTransition({
  status: 'flop',
  currentBet: 20,
  players: [
    { folded: false, allIn: true, bet: 10 },
    { folded: false, allIn: false, bet: 10 },
  ],
}), false);
assert.equal(shouldRevealAllInHands({
  status: 'turn',
  currentBet: 20,
  players: [
    { folded: false, allIn: true, bet: 10 },
    { folded: false, allIn: false, bet: 20 },
  ],
}), true);
assert.equal(shouldAutoAdvanceAfterTransition({
  status: 'flop',
  players: [{ folded: false, allIn: false }, { folded: false, allIn: false }],
}), false);
assert.equal(getShowdownAutoStartDelay({
  status: 'showdown',
  transition,
  players: [{ showSequence: 0 }, { showSequence: 1 }],
}, now), transition.durationMs + 2 * TRANSITION_TIMING.showdownRevealMs + TRANSITION_TIMING.winnerHoldMs);
assert.equal(shouldSkipShowdownReveal({
  status: 'showdown',
  allInRunout: true,
  players: [
    { folded: false, showCards: true, showSequence: 0, hand: ['A', 'K'] },
    { folded: false, showCards: true, showSequence: 1, hand: ['Q', 'Q'] },
  ],
}), true);
assert.equal(getShowdownAutoStartDelay({
  status: 'showdown',
  allInRunout: true,
  transition,
  players: [
    { folded: false, showCards: true, showSequence: 0, hand: ['A', 'K'] },
    { folded: false, showCards: true, showSequence: 1, hand: ['Q', 'Q'] },
  ],
}, now), transition.durationMs + TRANSITION_TIMING.winnerHoldMs);
assert.equal(clampRaiseAmount(5, 20, 100), 20);
assert.equal(clampRaiseAmount(120, 20, 100), 100);
assert.equal(clampRaiseAmount(45, 20, 100), 50);
assert.equal(clampRaiseAmount(44, 45, 99), 50);
assert.equal(quantizeChipAmount(505, 'floor'), 500);
assert.equal(getNonlinearRaiseAmount({ sliderValue: 0, minAmount: 40, potAmount: 120, maxAmount: 1000 }), 40);
const potSliderValue = getSliderValueForRaiseAmount({ amount: 120, minAmount: 40, potAmount: 120, maxAmount: 1000 });
assert.ok(potSliderValue > 29 && potSliderValue < 30);
assert.equal(getNonlinearRaiseAmount({ sliderValue: potSliderValue, minAmount: 40, potAmount: 120, maxAmount: 1000 }), 120);
assert.equal(getNonlinearRaiseAmount({ sliderValue: 100, minAmount: 40, potAmount: 120, maxAmount: 1000 }), 1000);
assert.equal(getSliderValueForRaiseAmount({ amount: 1000, minAmount: 40, potAmount: 120, maxAmount: 1000 }), 100);
assert.equal(getSliderValueForRaiseAmount({ amount: 50, minAmount: 50, potAmount: 50, maxAmount: 50 }), 100);
assert.ok(getNonlinearRaiseAmount({ sliderValue: 70, minAmount: 40, potAmount: 120, maxAmount: 1000 }) > 450);
assert.ok(getNonlinearRaiseAmount({ sliderValue: 92, minAmount: 40, potAmount: 120, maxAmount: 1000 }) > 800);
const deepFullPotMark = getFullPotSliderMark({ fullPotRaiseTarget: 120, minRaiseTarget: 40, maxBet: 10000 });
const standardFullPotMark = getFullPotSliderMark({ fullPotRaiseTarget: 120, minRaiseTarget: 40, maxBet: 1000 });
const shallowFullPotMark = getFullPotSliderMark({ fullPotRaiseTarget: 120, minRaiseTarget: 40, maxBet: 150 });
assert.equal(deepFullPotMark.visible, true);
assert.equal(standardFullPotMark.visible, true);
assert.equal(shallowFullPotMark.visible, true);
assert.ok(deepFullPotMark.position < standardFullPotMark.position);
assert.ok(shallowFullPotMark.position > standardFullPotMark.position);
assert.ok(deepFullPotMark.position < 15);
assert.ok(standardFullPotMark.position > 29 && standardFullPotMark.position < 30);
assert.ok(shallowFullPotMark.position > 75);
assert.equal(getFullPotSliderMark({ fullPotRaiseTarget: 120, minRaiseTarget: 40, maxBet: 110 }).visible, false);
assert.equal(getFullPotSliderMark({ fullPotRaiseTarget: 40, minRaiseTarget: 40, maxBet: 1000 }).visible, false);
assert.deepEqual(getRaiseIncrementBounds({ playerBet: 20, minRaiseTarget: 50, maxBet: 200 }), { min: 30, max: 180 });
assert.equal(getRaiseIncrementAmount(120, 20), 100);
assert.equal(getTotalRaiseAmountFromIncrement({ incrementAmount: 100, playerBet: 20, minRaiseTarget: 50, maxBet: 200 }), 120);
assert.equal(getTotalRaiseAmountFromIncrement({ incrementAmount: 15, playerBet: 20, minRaiseTarget: 50, maxBet: 200 }), 50);
let previousRaise = 0;
for (let slider = 0; slider <= 100; slider += 1) {
  const amount = getNonlinearRaiseAmount({ sliderValue: slider, minAmount: 40, potAmount: 120, maxAmount: 1000 });
  assert.ok(amount >= previousRaise);
  assert.equal(amount % CHIP_UNIT, 0);
  previousRaise = amount;
}
const headsUpFacingAllIn = {
  currentBet: 150,
  minRaise: 100,
  pot: 250,
  players: [
    { uid: 'a', bet: 100, chips: 900, hasActed: true, folded: false, allIn: false },
    { uid: 'b', bet: 150, chips: 0, hasActed: true, folded: false, allIn: true },
  ],
};
assert.equal(getPlayerBettingOptions(headsUpFacingAllIn, 'a').callAmount, 50);
assert.equal(getPlayerBettingOptions(headsUpFacingAllIn, 'a').canRaise, false);
const shortStackCoveredAllIn = {
  currentBet: 1000,
  minRaise: 980,
  pot: 1020,
  players: [
    { uid: 'ai', bet: 20, chips: 120, hasActed: false, folded: false, allIn: false },
    { uid: 'cover', bet: 1000, chips: 0, hasActed: true, folded: false, allIn: true },
  ],
};
const shortStackCoveredOptions = getPlayerBettingOptions(shortStackCoveredAllIn, 'ai');
assert.equal(shortStackCoveredOptions.rawCallAmount, 980);
assert.equal(shortStackCoveredOptions.effectiveCallAmount, 120);
assert.equal(shortStackCoveredOptions.callAmount, 120);
assert.equal(shortStackCoveredOptions.potAfterCall, 1140);
assert.equal(shortStackCoveredOptions.contestablePotAfterCall, 280);
assert.equal(shortStackCoveredOptions.isCallingAllIn, true);
assert.equal(shortStackCoveredOptions.isFacingCoveringAllIn, true);
const shortAllInMultiway = {
  currentBet: 150,
  minRaise: 100,
  pot: 350,
  players: [
    { uid: 'a', bet: 100, chips: 900, hasActed: true, folded: false, allIn: false },
    { uid: 'b', bet: 150, chips: 0, hasActed: true, folded: false, allIn: true },
    { uid: 'c', bet: 0, chips: 1000, hasActed: false, folded: false, allIn: false },
  ],
};
assert.equal(getPlayerBettingOptions(shortAllInMultiway, 'a').canRaise, false);
assert.equal(getPlayerBettingOptions(shortAllInMultiway, 'a').facingShortAllInAfterActing, true);
assert.equal(getPlayerBettingOptions(shortAllInMultiway, 'c').canRaise, true);
const fullRaiseReopensAction = {
  currentBet: 220,
  minRaise: 100,
  pot: 420,
  players: [
    { uid: 'a', bet: 100, chips: 900, hasActed: true, folded: false, allIn: false },
    { uid: 'b', bet: 220, chips: 500, hasActed: true, folded: false, allIn: false },
  ],
};
assert.equal(getPlayerBettingOptions(fullRaiseReopensAction, 'a').canRaise, true);
assert.deepEqual(addLog({ logs: ['a', 'b'] }, 'c', 2), ['b', 'c']);
assert.deepEqual(getPendingChipUpdate({ pendingChipMode: 'add', pendingChipAmount: 25 }), { mode: 'add', amount: 20 });
assert.equal(getPendingChipUpdate({ pendingChipMode: 'subtract', pendingChipAmount: 0 }), null);
assert.equal(getPendingChipLabel({ mode: 'subtract', amount: 30 }), '减少 30');
assert.equal(playerNeedsAction({ bet: 20, hasActed: true, folded: false, allIn: false, isSittingOut: false }, { currentBet: 50 }), true);
assert.equal(playerNeedsAction({ bet: 50, hasActed: true, folded: false, allIn: false, isSittingOut: false }, { currentBet: 50 }), false);
assert.equal(getNextActionIndex([
  { folded: false, allIn: true },
  { folded: true, allIn: false },
  { folded: false, allIn: false },
], 0), 2);
const actionSourceRoom = {
  status: 'pre-flop',
  handCount: 1,
  turnIndex: 0,
  currentBet: 20,
  pot: 30,
  players: [
    { uid: 'a', bet: 10, chips: 990, hasActed: false, folded: false, allIn: false, isSittingOut: false },
    { uid: 'b', bet: 20, chips: 980, hasActed: true, folded: false, allIn: false, isSittingOut: false },
  ],
};
const actionToken = getActionSourceToken(actionSourceRoom);
assert.equal(isSameActionSource(actionSourceRoom, actionToken), true);
assert.equal(isSameActionSource({ ...actionSourceRoom, currentBet: 30 }, actionToken), false);
const actionState = JSON.parse(JSON.stringify(actionSourceRoom));
assert.equal(applyPlayerActionToState({ nextState: actionState, playerIndex: 0, actionType: 'call' }), true);
assert.equal(actionState.players[0].bet, 20);
assert.equal(actionState.players[0].lastAction, 'call');
assert.equal(actionState.pot, 40);
const holdState = {
  status: 'flop',
  handCount: 3,
  currentBet: 0,
  pot: 100,
  turnIndex: 1,
  players: [
    { uid: 'a', bet: 0, hasActed: true, folded: false, allIn: false, lastAction: 'check' },
    { uid: 'b', bet: 0, hasActed: true, folded: false, allIn: false },
  ],
};
assert.equal(applyImmediatePostActionProgress(holdState), true);
assert.equal(holdState.turnIndex, -1);
assert.equal(holdState.transition.type, 'action-hold');
const aiPostflopProbe = decidePokerAiAction({
  status: 'flop',
  currentBet: 0,
  minRaise: 20,
  pot: 60,
  communityCards: ['♣A', '♦7', '♠2'],
  players: [
    { uid: 'ai', name: 'AI', isAi: true, hand: ['♠A', '♥A'], bet: 0, chips: 980, folded: false, allIn: false, isSittingOut: false },
    { uid: 'human', name: 'H', hand: ['♣K', '♦Q'], bet: 0, chips: 980, folded: false, allIn: false, isSittingOut: false },
  ],
}, { uid: 'ai', hand: ['♠A', '♥A'], bet: 0, chips: 980 }, { iterations: 0, random: () => 0 });
assert.equal(aiPostflopProbe.actionType, 'raise');
assert.equal(aiPostflopProbe.amount % CHIP_UNIT, 0);
const aiSnapshot = buildAiDecisionSnapshot({
  status: 'flop',
  currentBet: 0,
  minRaise: 20,
  pot: 60,
  communityCards: ['♣A', '♦7', '♠2'],
  players: [
    { uid: 'ai', name: 'AI', isAi: true, hand: ['♠A', '♥A'], bet: 0, chips: 980, folded: false, allIn: false, isSittingOut: false },
    { uid: 'human', name: 'H', hand: ['♣K', '♦Q'], bet: 0, chips: 980, folded: false, allIn: false, isSittingOut: false },
  ],
}, { uid: 'ai', hand: ['♠A', '♥A'] });
assert.deepEqual(aiSnapshot.players.find((player) => player.uid === 'human').hand, []);
const aiDryBoardCbet = decidePokerAiAction({
  status: 'flop',
  currentBet: 0,
  minRaise: 20,
  pot: 80,
  communityCards: ['♣A', '♦7', '♠2'],
  handAggressorUid: 'ai',
  players: [
    { uid: 'ai', name: 'AI', isAi: true, hand: ['♠K', '♥Q'], bet: 0, chips: 960, folded: false, allIn: false, isSittingOut: false },
    { uid: 'human', name: 'H', hand: ['♣K', '♦Q'], bet: 0, chips: 960, folded: false, allIn: false, isSittingOut: false },
  ],
}, { uid: 'ai', hand: ['♠K', '♥Q'], bet: 0, chips: 960 }, { iterations: 0, random: () => 0 });
assert.equal(aiDryBoardCbet.actionType, 'raise');
const aiWeakFacingLargeBet = decidePokerAiAction({
  status: 'turn',
  currentBet: 120,
  minRaise: 120,
  pot: 160,
  communityCards: ['♣A', '♦K', '♠7', '♥2'],
  players: [
    { uid: 'ai', name: 'AI', isAi: true, hand: ['♠4', '♥3'], bet: 0, chips: 880, folded: false, allIn: false, isSittingOut: false },
    { uid: 'human', name: 'H', bet: 120, chips: 860, folded: false, allIn: false, isSittingOut: false, lastAction: 'raise' },
  ],
}, { uid: 'ai', hand: ['♠4', '♥3'], bet: 0, chips: 880 }, { iterations: 0, random: () => 0.9 });
assert.equal(aiWeakFacingLargeBet.actionType, 'fold');
const spade = '\u2660';
const heart = '\u2665';
const tc = (suit, rank) => `${suit}${rank}`;
const makePreflopPressureRoom = (hand) => ({
  status: 'pre-flop',
  dealerIndex: 0,
  currentBet: 300,
  minRaise: 280,
  pot: 640,
  communityCards: [],
  players: [
    { uid: 'ai', name: 'AI', isAi: true, hand, bet: 20, chips: 980, folded: false, allIn: false, isSittingOut: false },
    { uid: 'raiser', name: 'R', bet: 300, chips: 700, folded: false, allIn: false, isSittingOut: false, lastAction: 'raise' },
    { uid: 'caller', name: 'C', bet: 300, chips: 700, folded: false, allIn: false, isSittingOut: false, lastAction: 'call' },
  ],
});
const aiKqoMultiwayPressure = decidePokerAiAction(
  makePreflopPressureRoom([tc(spade, 'K'), tc(heart, 'Q')]),
  { uid: 'ai', hand: [tc(spade, 'K'), tc(heart, 'Q')], bet: 20, chips: 980 },
  { iterations: 0, random: () => 0.9 },
);
assert.equal(aiKqoMultiwayPressure.actionType, 'fold');
const aiJtsMultiwayPressure = decidePokerAiAction(
  makePreflopPressureRoom([tc(spade, 'J'), tc(spade, 'T')]),
  { uid: 'ai', hand: [tc(spade, 'J'), tc(spade, 'T')], bet: 20, chips: 980 },
  { iterations: 0, random: () => 0.9 },
);
assert.equal(aiJtsMultiwayPressure.actionType, 'fold');
const aiAqsMultiwayPressure = decidePokerAiAction(
  makePreflopPressureRoom([tc(spade, 'A'), tc(spade, 'Q')]),
  { uid: 'ai', hand: [tc(spade, 'A'), tc(spade, 'Q')], bet: 20, chips: 980 },
  { iterations: 0, random: () => 0.9 },
);
assert.notEqual(aiAqsMultiwayPressure.actionType, 'fold');
const makeHeadsUpHeavyPressureRoom = (hand) => ({
  status: 'pre-flop',
  dealerIndex: 0,
  currentBet: 300,
  minRaise: 280,
  pot: 340,
  communityCards: [],
  players: [
    { uid: 'ai', name: 'AI', isAi: true, hand, bet: 20, chips: 980, totalContribution: 20, folded: false, allIn: false, isSittingOut: false },
    { uid: 'raiser', name: 'R', bet: 300, chips: 700, totalContribution: 300, folded: false, allIn: false, isSittingOut: false, lastAction: 'raise' },
    { uid: 'dead', name: 'Dead', bet: 0, chips: 0, totalContribution: 20, folded: true, allIn: false, isSittingOut: false },
  ],
});
const aiKqoHeadsUpHeavyPressure = decidePokerAiAction(
  makeHeadsUpHeavyPressureRoom([tc(spade, 'K'), tc(heart, 'Q')]),
  { uid: 'ai', hand: [tc(spade, 'K'), tc(heart, 'Q')], bet: 20, chips: 980, totalContribution: 20 },
  { iterations: 0, random: () => 0.9 },
);
assert.equal(aiKqoHeadsUpHeavyPressure.actionType, 'fold');
const aiAqsHeadsUpHeavyPressure = decidePokerAiAction(
  makeHeadsUpHeavyPressureRoom([tc(spade, 'A'), tc(spade, 'Q')]),
  { uid: 'ai', hand: [tc(spade, 'A'), tc(spade, 'Q')], bet: 20, chips: 980, totalContribution: 20 },
  { iterations: 0, random: () => 0.9 },
);
assert.notEqual(aiAqsHeadsUpHeavyPressure.actionType, 'fold');
const tableSeat = (uid, bet, chips, lastAction, hand = [], folded = false) => ({
  uid,
  name: uid,
  hand,
  bet,
  chips,
  totalContribution: bet,
  folded,
  allIn: false,
  hasActed: Boolean(lastAction),
  isSittingOut: false,
  lastAction,
});
const makeSixMaxOpenRoom = (hand) => ({
  status: 'pre-flop',
  dealerIndex: 0,
  currentBet: 60,
  minRaise: 40,
  pot: 90,
  communityCards: [],
  players: [
    tableSeat('ai', 0, 1000, null, hand),
    tableSeat('raiser', 60, 940, 'raise'),
    tableSeat('seat3', 0, 1000, null),
    tableSeat('seat4', 0, 1000, null),
    tableSeat('sb', 10, 990, 'SB'),
    tableSeat('bb', 20, 980, 'BB'),
  ],
});
const aiTtVsSixMaxOpen = decidePokerAiAction(
  makeSixMaxOpenRoom([tc(spade, 'T'), tc(heart, 'T')]),
  { uid: 'ai', hand: [tc(spade, 'T'), tc(heart, 'T')], bet: 0, chips: 1000, totalContribution: 0 },
  { iterations: 260, random: seededRandom(1240) },
);
assert.notEqual(aiTtVsSixMaxOpen.actionType, 'fold');
const aiKqoVsSixMaxOpen = decidePokerAiAction(
  makeSixMaxOpenRoom([tc(spade, 'K'), tc(heart, 'Q')]),
  { uid: 'ai', hand: [tc(spade, 'K'), tc(heart, 'Q')], bet: 0, chips: 1000, totalContribution: 0 },
  { iterations: 260, random: seededRandom(1241) },
);
assert.notEqual(aiKqoVsSixMaxOpen.actionType, 'fold');
const aiJtsVsSixMaxOpen = decidePokerAiAction(
  makeSixMaxOpenRoom([tc(spade, 'J'), tc(spade, 'T')]),
  { uid: 'ai', hand: [tc(spade, 'J'), tc(spade, 'T')], bet: 0, chips: 1000, totalContribution: 0 },
  { iterations: 260, random: seededRandom(1242) },
);
assert.notEqual(aiJtsVsSixMaxOpen.actionType, 'fold');
const aiTrashVsSixMaxOpen = decidePokerAiAction(
  makeSixMaxOpenRoom([tc(spade, '7'), tc(heart, '2')]),
  { uid: 'ai', hand: [tc(spade, '7'), tc(heart, '2')], bet: 0, chips: 1000, totalContribution: 0 },
  { iterations: 260, random: seededRandom(1243) },
);
assert.equal(aiTrashVsSixMaxOpen.actionType, 'fold');
const makeSixMaxLargeOvercallRoom = (hand) => ({
  status: 'pre-flop',
  dealerIndex: 0,
  currentBet: 300,
  minRaise: 280,
  pot: 640,
  communityCards: [],
  players: [
    tableSeat('ai', 20, 980, null, hand),
    tableSeat('raiser', 300, 700, 'raise'),
    tableSeat('caller', 300, 700, 'call'),
    tableSeat('seat4', 0, 1000, null),
    tableSeat('sb', 10, 990, 'SB'),
    tableSeat('bb', 20, 980, 'BB'),
  ],
});
const aiAksLargeOvercall = decidePokerAiAction(
  makeSixMaxLargeOvercallRoom([tc(spade, 'A'), tc(spade, 'K')]),
  { uid: 'ai', hand: [tc(spade, 'A'), tc(spade, 'K')], bet: 20, chips: 980, totalContribution: 20 },
  { iterations: 260, random: seededRandom(2240) },
);
assert.notEqual(aiAksLargeOvercall.actionType, 'fold');
const aiAqsLargeOvercall = decidePokerAiAction(
  makeSixMaxLargeOvercallRoom([tc(spade, 'A'), tc(spade, 'Q')]),
  { uid: 'ai', hand: [tc(spade, 'A'), tc(spade, 'Q')], bet: 20, chips: 980, totalContribution: 20 },
  { iterations: 260, random: seededRandom(2241) },
);
assert.notEqual(aiAqsLargeOvercall.actionType, 'fold');
const aiKqoLargeOvercall = decidePokerAiAction(
  makeSixMaxLargeOvercallRoom([tc(spade, 'K'), tc(heart, 'Q')]),
  { uid: 'ai', hand: [tc(spade, 'K'), tc(heart, 'Q')], bet: 20, chips: 980, totalContribution: 20 },
  { iterations: 260, random: seededRandom(2242) },
);
assert.equal(aiKqoLargeOvercall.actionType, 'fold');
const aiJtsLargeOvercall = decidePokerAiAction(
  makeSixMaxLargeOvercallRoom([tc(spade, 'J'), tc(spade, 'T')]),
  { uid: 'ai', hand: [tc(spade, 'J'), tc(spade, 'T')], bet: 20, chips: 980, totalContribution: 20 },
  { iterations: 260, random: seededRandom(2243) },
);
assert.equal(aiJtsLargeOvercall.actionType, 'fold');
const shortAiKqoCovered = decidePokerAiAction({
  status: 'pre-flop',
  dealerIndex: 0,
  currentBet: 1000,
  minRaise: 980,
  pot: 1020,
  communityCards: [],
  players: [
    { uid: 'ai', name: 'AI', isAi: true, hand: [tc(spade, 'K'), tc(heart, 'Q')], bet: 20, chips: 120, folded: false, allIn: false, isSittingOut: false },
    { uid: 'cover', name: 'Cover', bet: 1000, chips: 0, folded: false, allIn: true, isSittingOut: false, lastAction: 'allin' },
  ],
}, { uid: 'ai', hand: [tc(spade, 'K'), tc(heart, 'Q')], bet: 20, chips: 120 }, { iterations: 0, random: () => 0.9 });
assert.equal(shortAiKqoCovered.actionType, 'call');
const shortAiTrashCovered = decidePokerAiAction({
  status: 'pre-flop',
  dealerIndex: 0,
  currentBet: 1000,
  minRaise: 980,
  pot: 1020,
  communityCards: [],
  players: [
    { uid: 'ai', name: 'AI', isAi: true, hand: [tc(spade, '7'), tc(heart, '2')], bet: 20, chips: 120, folded: false, allIn: false, isSittingOut: false },
    { uid: 'cover', name: 'Cover', bet: 1000, chips: 0, folded: false, allIn: true, isSittingOut: false, lastAction: 'allin' },
  ],
}, { uid: 'ai', hand: [tc(spade, '7'), tc(heart, '2')], bet: 20, chips: 120 }, { iterations: 0, random: () => 0.9 });
assert.equal(shortAiTrashCovered.actionType, 'fold');
const aiSemiBluffDraw = decidePokerAiAction({
  status: 'flop',
  currentBet: 0,
  minRaise: 20,
  pot: 90,
  communityCards: ['♠A', '♠7', '♦2'],
  players: [
    { uid: 'ai', name: 'AI', isAi: true, hand: ['♠K', '♠Q'], bet: 0, chips: 950, folded: false, allIn: false, isSittingOut: false },
    { uid: 'human', name: 'H', bet: 0, chips: 950, folded: false, allIn: false, isSittingOut: false },
  ],
}, { uid: 'ai', hand: ['♠K', '♠Q'], bet: 0, chips: 950 }, { iterations: 0, random: () => 0 });
assert.equal(aiSemiBluffDraw.actionType, 'raise');
assert.equal(getActionLabel('check'), '过牌');
assert.equal(getActionLabel('fold'), '弃牌');
assert.equal(getActionLabel('call', 40), 40);
assert.equal(getDisplayAction({ lastAction: 'BB', hasActed: true, bet: 20 }), 'call');
assert.equal(shouldShowActionBubble({ lastAction: 'check', bet: 0 }, 'flop'), true);
assert.equal(shouldShowActionBubble({ lastAction: 'fold', bet: 0 }, 'flop'), true);
assert.equal(shouldShowActionBubble({ lastAction: 'check', bet: 0 }, 'showdown'), false);

assert.equal(canPlayerTakeAction({
  isMyTurn: true,
  myPlayerInfo: { folded: false, allIn: false, isSittingOut: false },
  status: 'flop',
}), true);
assert.equal(canPlayerTakeAction({
  isMyTurn: true,
  myPlayerInfo: { folded: false, allIn: true, isSittingOut: false },
  status: 'flop',
}), false);
assert.equal(canPlayerPotentiallyRaise({
  myPlayerInfo: { uid: 'a' },
  status: 'flop',
  bettingOptions: { canRaise: true },
}), true);
const actionView = getActionViewState({
  activeTransition: null,
  callAmount: 50,
  canTakeAction: true,
  currentActionPlayer: { uid: 'a', name: 'A' },
  currentPhaseInfo: { shortLabel: 'FLP' },
  effectiveSettings: { timeLimit: 30 },
  myPlayerInfo: { folded: false, allIn: false, isSittingOut: false },
  roomData: { status: 'flop', isPaused: false },
  timeLeft: 9,
  userUid: 'a',
});
assert.equal(actionView.currentActionName, '你');
assert.equal(actionView.isTimerCritical, true);
assert.equal(actionView.actionStatusDetail, '9s');
assert.equal(actionView.actionStatusLabel, '轮到你行动');
const settledActionView = getActionViewState({
  activeTransition: null,
  callAmount: 0,
  canTakeAction: false,
  currentActionNeedsInput: false,
  currentActionPlayer: { uid: 'ai', name: 'AI' },
  currentPhaseInfo: { shortLabel: 'FLP' },
  effectiveSettings: { timeLimit: 30 },
  myPlayerInfo: { folded: false, allIn: false, isSittingOut: false },
  roomData: { status: 'pre-flop', isPaused: false },
  timeLeft: 9,
  userUid: 'human',
});
assert.equal(settledActionView.showCurrentActionClock, false);
const splitPot = buildSettlementPots(
  [
    { uid: 'a', totalContribution: 10 },
    { uid: 'b', totalContribution: 10 },
    { uid: 'c', totalContribution: 10 },
  ],
  [
    { uid: 'a', name: 'A', _score: 30 },
    { uid: 'b', name: 'B', _score: 30 },
  ],
  30,
);
assert.equal(splitPot.winByUid.a, 20);
assert.equal(splitPot.winByUid.b, 10);
const buttonOddChipPot = buildSettlementPots(
  [
    { uid: 'a', totalContribution: 10 },
    { uid: 'b', totalContribution: 10 },
    { uid: 'c', totalContribution: 10 },
  ],
  [
    { uid: 'a', name: 'A', _score: 30 },
    { uid: 'b', name: 'B', _score: 30 },
  ],
  30,
  { dealerIndex: 0 },
);
assert.equal(buttonOddChipPot.winByUid.a, 10);
assert.equal(buttonOddChipPot.winByUid.b, 20);
const legacyOddPot = buildSettlementPots(
  [
    { uid: 'a', totalContribution: 15 },
    { uid: 'b', totalContribution: 10 },
  ],
  [
    { uid: 'a', name: 'A', _score: 30 },
  ],
  25,
);
assert.equal(legacyOddPot.totalAwarded, 20);
assert.equal(legacyOddPot.totalAwarded % CHIP_UNIT, 0);
const settlement = buildSettlementPots(
  [
    { uid: 'a', totalContribution: 50 },
    { uid: 'b', totalContribution: 100 },
    { uid: 'c', totalContribution: 100 },
  ],
  [
    { uid: 'a', name: 'A', _score: 30, _rankName: 'best' },
    { uid: 'b', name: 'B', _score: 20, _rankName: 'second' },
    { uid: 'c', name: 'C', _score: 10, _rankName: 'third' },
  ],
  250,
);
assert.equal(settlement.totalAwarded, 250);
assert.equal(settlement.pots.length, 2);
assert.equal(settlement.winByUid.a, 150);
assert.equal(settlement.winByUid.b, 100);

const deck = createDeck();
assert.equal(deck.length, 52);
assert.equal(new Set(deck).size, 52);
for (let run = 0; run < 20; run += 1) {
  const shuffledDeck = createDeck();
  assert.equal(shuffledDeck.length, 52);
  assert.equal(new Set(shuffledDeck).size, 52);
  assert.equal(shuffledDeck.every((card) => typeof card === 'string' && card.length === 2), true);
}
assert.equal(evaluate7Cards(['♠A', '♥A'], ['♣A', '♦A', '♠K', '♥2', '♣3']).rankName, '四条');
assert.equal(evaluate7Cards(['♠A', '♥2'], ['♣3', '♦4', '♠5', '♥K', '♣9']).rankName, '顺子');
assert.equal(evaluate7Cards(['♠A', '♠K'], ['♠Q', '♠J', '♠T', '♥2', '♣3']).rankName, '同花顺');

console.log('logic tests passed');
