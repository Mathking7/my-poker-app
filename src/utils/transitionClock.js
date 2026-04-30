import { getTransitionProgress } from './gameFlow.js';

export const pauseTransitionClock = (transition, now = Date.now()) => {
  if (!transition?.id || transition.pausedAt) return transition || null;
  const remainingMs = Math.max(0, Number(transition.endsAt || 0) - now);
  const pausedProgress = getTransitionProgress(transition, now);
  return {
    ...transition,
    pausedAt: now,
    pausedRemainingMs: remainingMs,
    pausedProgress,
  };
};

export const resumeTransitionClock = (transition, now = Date.now()) => {
  if (!transition?.id || !transition.pausedAt) return transition || null;
  const durationMs = Math.max(1, Number(transition.durationMs || 0));
  const remainingMs = Math.max(
    0,
    Number(transition.pausedRemainingMs ?? Math.max(0, Number(transition.endsAt || 0) - Number(transition.pausedAt || now))),
  );
  const elapsedMs = Math.max(0, durationMs - remainingMs);
  const {
    pausedAt,
    pausedRemainingMs,
    pausedProgress,
    ...rest
  } = transition;
  void pausedAt;
  void pausedRemainingMs;
  void pausedProgress;
  return {
    ...rest,
    startedAt: now - elapsedMs,
    endsAt: now + remainingMs,
    resumedAt: now,
  };
};
