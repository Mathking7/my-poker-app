export const CHIP_UNIT = 10;

export const toFiniteNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export const quantizeChipAmount = (value, mode = 'nearest') => {
  const number = Math.max(0, toFiniteNumber(value));
  if (mode === 'ceil') return Math.ceil(number / CHIP_UNIT) * CHIP_UNIT;
  if (mode === 'floor') return Math.floor(number / CHIP_UNIT) * CHIP_UNIT;
  return Math.round(number / CHIP_UNIT) * CHIP_UNIT;
};

export const clampChipAmount = (value, min, max, mode = 'nearest') => {
  const lower = quantizeChipAmount(min, 'ceil');
  const upper = Math.max(lower, quantizeChipAmount(max, 'floor'));
  return Math.min(upper, Math.max(lower, quantizeChipAmount(value, mode)));
};
