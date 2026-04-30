/* eslint-disable react-hooks/purity -- This hook intentionally reflects wall-clock time. */
import { useEffect, useState } from 'react';

export const useNowMs = (intervalMs = 250) => {
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const tickId = setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => clearInterval(tickId);
  }, [intervalMs]);

  return nowMs;
};
