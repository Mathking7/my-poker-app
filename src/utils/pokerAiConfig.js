export const AI_THINK_TIMING = {
  minMs: 450,
  maxMs: 900,
};

export const AI_PLAYER_NAMES = ['AI-稳健', 'AI-进取', 'AI-冷静', 'AI-敏锐', 'AI-均衡'];

export const AI_SIMULATION_ITERATIONS = {
  fastPreflop: 90,
  fastPostflop: 180,
  highQualityPreflop: 260,
  highQualityPostflop: 900,
  workerFallback: 180,
  workerTimeoutMs: 1400,
};

export const AI_PREFLOP_TUNING = {
  openThresholdBase: 0.45,
  openPositionDiscount: 0.08,
  openHeadsUpDiscount: 0.08,
  openChanceSlope: 2.1,
  openChanceBase: 0.22,
  raiseThresholdBase: 0.62,
  raisePositionDiscount: 0.05,
  raiseHeadsUpDiscount: 0.05,
  threeBetChanceSlope: 2.2,
  threeBetPressurePenalty: 0.35,
};

export const AI_POSTFLOP_TUNING = {
  multiwayPenaltyPerOpponent: 0.08,
  trapStrongValueThreshold: 0.82,
  valueBetThreshold: 0.58,
  strongValueThreshold: 0.72,
  semiBluffThreshold: 0.33,
  largeBetPotOdds: 0.34,
  largeBetPressure: 0.24,
  drawImpliedOddsCredit: 0.055,
  valueRaiseThreshold: 0.68,
  bluffRaiseThreshold: 0.48,
};

export const getAiSimulationIterations = ({ highQuality = false, communityCardCount = 0 } = {}) => {
  if (highQuality) {
    return communityCardCount === 0
      ? AI_SIMULATION_ITERATIONS.highQualityPreflop
      : AI_SIMULATION_ITERATIONS.highQualityPostflop;
  }
  return communityCardCount === 0
    ? AI_SIMULATION_ITERATIONS.fastPreflop
    : AI_SIMULATION_ITERATIONS.fastPostflop;
};
