/* eslint-disable react-hooks/set-state-in-effect -- This hook mirrors server transitions into a local presentation clock. */
import { useEffect, useState } from 'react';

import { getTransitionProgress, isTransitionActive } from '../utils/gameFlow';

export const usePresentedTransition = ({ transition, isPaused, nowMs }) => {
  const [presentedTransition, setPresentedTransition] = useState(null);

  useEffect(() => {
    if (!transition?.id) return;

    setPresentedTransition((current) => {
      const now = Date.now();
      const durationMs = Math.max(650, Number(transition.durationMs || 0));
      if (current?.id === transition.id) {
        const serverEndsAt = Number(transition.endsAt || 0);
        const remainingMs = Math.max(0, serverEndsAt - now);
        const elapsedMs = Math.max(0, durationMs - remainingMs);
        const baseTransition = {
          ...transition,
          serverStartedAt: transition.startedAt,
          serverEndsAt,
          durationMs,
        };

        if (transition.pausedAt) {
          return {
            ...baseTransition,
            startedAt: current.startedAt,
            endsAt: current.endsAt,
            pausedProgress: transition.pausedProgress ?? current.pausedProgress ?? getTransitionProgress(current, now),
          };
        }

        if (!current.pausedAt && isTransitionActive(current, now)) {
          return {
            ...baseTransition,
            startedAt: current.startedAt,
            endsAt: current.endsAt,
          };
        }

        return {
          ...baseTransition,
          startedAt: now - elapsedMs,
          endsAt: now + remainingMs,
        };
      }

      return {
        ...transition,
        serverStartedAt: transition.startedAt,
        serverEndsAt: transition.endsAt,
        startedAt: now,
        endsAt: now + durationMs,
        durationMs,
      };
    });
  }, [transition]);

  useEffect(() => {
    if (!presentedTransition) return;
    if (isPaused && transition?.id === presentedTransition.id) return;
    if (isTransitionActive(presentedTransition, nowMs)) return;
    if (transition?.id === presentedTransition.id) return;
    setPresentedTransition(null);
  }, [isPaused, nowMs, presentedTransition, transition?.id]);

  return presentedTransition;
};
