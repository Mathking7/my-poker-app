/* eslint-disable react-hooks/set-state-in-effect -- This hook owns the local countdown window for the current turn. */
import { useEffect, useRef, useState } from 'react';

const getFiniteTimeLimit = (timeLimit) => {
  const value = Number(timeLimit);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

export const useTurnTimer = ({
  callAmount,
  currentActionNeedsInput,
  hasActiveTransition,
  isMyTurn,
  isPaused,
  isReferee,
  nowMs,
  onCurrentUserTimeout,
  onRefereeTimeout,
  resetKey,
  roomStatus,
  timeLimit,
}) => {
  const [timeLeft, setTimeLeft] = useState(0);
  const [timerWindow, setTimerWindow] = useState(null);
  const timerActionInFlightRef = useRef(false);
  const timeoutHandlersRef = useRef({ onCurrentUserTimeout, onRefereeTimeout });

  useEffect(() => {
    timeoutHandlersRef.current = { onCurrentUserTimeout, onRefereeTimeout };
  }, [onCurrentUserTimeout, onRefereeTimeout]);

  useEffect(() => {
    timerActionInFlightRef.current = false;
  }, [resetKey]);

  useEffect(() => {
    const limitSeconds = getFiniteTimeLimit(timeLimit);
    if (
      roomStatus === 'waiting' ||
      roomStatus === 'showdown' ||
      isPaused ||
      hasActiveTransition ||
      !currentActionNeedsInput ||
      limitSeconds <= 0
    ) {
      setTimeLeft(0);
      setTimerWindow(null);
      return undefined;
    }

    const startedAt = Date.now();
    setTimeLeft(limitSeconds);
    setTimerWindow({
      endsAt: startedAt + limitSeconds * 1000,
      limitSeconds,
      startedAt,
    });

    const timerId = setInterval(() => {
      setTimeLeft((previous) => {
        if (previous <= 1) {
          if (timerActionInFlightRef.current) return 0;
          timerActionInFlightRef.current = true;

          if (isMyTurn) {
            Promise.resolve(timeoutHandlersRef.current.onCurrentUserTimeout?.(callAmount === 0 ? 'call' : 'fold'))
              .finally(() => {
                timerActionInFlightRef.current = false;
              });
          } else if (isReferee) {
            Promise.resolve(timeoutHandlersRef.current.onRefereeTimeout?.())
              .finally(() => {
                timerActionInFlightRef.current = false;
              });
          } else {
            timerActionInFlightRef.current = false;
          }

          return 0;
        }
        return previous - 1;
      });
    }, 1000);

    return () => clearInterval(timerId);
  }, [
    callAmount,
    currentActionNeedsInput,
    hasActiveTransition,
    isMyTurn,
    isPaused,
    isReferee,
    resetKey,
    roomStatus,
    timeLimit,
  ]);

  const renderNowMs = Number.isFinite(Number(nowMs)) ? Number(nowMs) : timerWindow?.startedAt;
  const timerProgress = timerWindow?.limitSeconds > 0 && Number.isFinite(renderNowMs)
    ? Math.max(0, Math.min(100, ((timerWindow.endsAt - renderNowMs) / (timerWindow.limitSeconds * 1000)) * 100))
    : 0;

  return { timeLeft, timerProgress };
};
