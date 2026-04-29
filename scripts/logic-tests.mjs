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
  shouldMarkLegacyRoom,
  stampPlayerPresence,
} from '../src/utils/roomMaintenance.js';
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

const importJsxAsModule = async (path) => {
  const source = fs.readFileSync(path, 'utf8');
  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`);
};

const { createDeck, evaluate7Cards } = await importJsxAsModule(new URL('../src/utils/pokerLogic.jsx', import.meta.url));

const unlimited = '\u65e0\u9650';

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
assert.equal(TRANSITION_TIMING.transitionCompletionGraceMs, 450);
assert.equal(isTransitionActive(transition, now + transition.durationMs - 1), true);
assert.equal(isTransitionActive(transition, now + transition.durationMs), false);
assert.equal(getTransitionProgress(transition, now), 0);
assert.equal(getTransitionProgress(transition, now + transition.durationMs), 1);
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
assert.equal(evaluate7Cards(['♠A', '♥A'], ['♣A', '♦A', '♠K', '♥2', '♣3']).rankName, '四条');
assert.equal(evaluate7Cards(['♠A', '♥2'], ['♣3', '♦4', '♠5', '♥K', '♣9']).rankName, '顺子');
assert.equal(evaluate7Cards(['♠A', '♠K'], ['♠Q', '♠J', '♠T', '♥2', '♣3']).rankName, '同花顺');

console.log('logic tests passed');
