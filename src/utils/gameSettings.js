import { clampChipAmount } from './chipMath.js';

export const MIN_INITIAL_CHIPS = 100;
export const MAX_INITIAL_CHIPS = 100000;
export const MIN_TIME_LIMIT = 5;
export const MAX_TIME_LIMIT = 300;
export const MAX_PLAYERS = 9;
export const DEFAULT_SETTINGS = {
  initialChips: 1000,
  timeLimit: 30,
  allowJoinDuringGame: true,
  doubleBlinds: false,
  autoTopUp: false,
};

export const clampNumber = (value, min, max, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
};

export const normalizeGameSettings = (settings = {}) => {
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  const timeLimit = merged.timeLimit === '无限'
    ? '无限'
    : clampNumber(merged.timeLimit, MIN_TIME_LIMIT, MAX_TIME_LIMIT, DEFAULT_SETTINGS.timeLimit);

  return {
    initialChips: clampChipAmount(merged.initialChips, MIN_INITIAL_CHIPS, MAX_INITIAL_CHIPS),
    timeLimit,
    allowJoinDuringGame: Boolean(merged.allowJoinDuringGame),
    doubleBlinds: Boolean(merged.doubleBlinds),
    autoTopUp: Boolean(merged.autoTopUp),
  };
};

export const isJoinableStatus = (status) => status === 'waiting' || status === 'showdown';

export const getSmallBlindForHand = (settings = {}, handCount = 1) => {
  const normalized = normalizeGameSettings(settings);
  if (!normalized.doubleBlinds) return 10;
  return 10 * Math.pow(2, Math.floor((Math.max(1, handCount) - 1) / 5));
};

export const getBigBlindForHand = (settings = {}, handCount = 1) => {
  return getSmallBlindForHand(settings, handCount) * 2;
};
