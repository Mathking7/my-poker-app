/* eslint-disable react-hooks/exhaustive-deps -- Showdown reveal should restart only when the hand/settlement identity changes, not on room heartbeats. */
import { useEffect, useMemo, useState } from 'react';

import { TRANSITION_TIMING, shouldSkipShowdownReveal } from '../utils/gameFlow';

export const useShowdownPresentation = ({
  activeTransition,
  myCurrentHandInfo,
  myPlayerInfo,
  roomData,
}) => {
  const [currentShowIndex, setCurrentShowIndex] = useState(-1);
  const [showdownFinished, setShowdownFinished] = useState(false);

  const myIsWinnerGlow = roomData?.status === 'showdown' && showdownFinished && myPlayerInfo?.winAmount > 0;
  const myIsAllInRunoutRevealed = Boolean(
    roomData?.status !== 'waiting' &&
    roomData?.status !== 'showdown' &&
    roomData?.allInRunout &&
    myPlayerInfo?.showCards &&
    !myPlayerInfo?.folded
  );
  const myIsShowdownRevealed = Boolean(
    roomData?.status === 'showdown' &&
    myPlayerInfo?.showCards &&
    (showdownFinished || myPlayerInfo.showSequence <= currentShowIndex)
  );
  const showdownSequenceSignature = (roomData?.players || [])
    .map((player) => `${player.uid}:${player.showSequence ?? -1}`)
    .join('|');
  const showdownAnimationKey = roomData?.status === 'showdown'
    ? `${roomData.handCount || 0}:${roomData.settlement?.id || roomData.transition?.id || 'pending'}`
    : '';

  useEffect(() => {
    if (roomData?.status === 'showdown') {
      const maxSeq = Math.max(-1, ...((roomData.players || []).map((player) => player.showSequence ?? -1)));
      const skipRevealAnimation = shouldSkipShowdownReveal(roomData);
      const revealTransition = activeTransition?.type === 'showdown'
        ? activeTransition
        : (roomData.transition?.type === 'showdown' ? roomData.transition : null);
      const revealStartDelay = revealTransition
        ? Math.max(0, Number(revealTransition.endsAt || 0) - Date.now())
        : 0;
      let timer;
      let startTimer;

      if (maxSeq >= 0 && !skipRevealAnimation) {
        setCurrentShowIndex(-1);
        setShowdownFinished(false);
        startTimer = setTimeout(() => {
          let step = 0;
          setCurrentShowIndex(0);
          timer = setInterval(() => {
            step += 1;
            if (step > maxSeq) {
              clearInterval(timer);
              setShowdownFinished(true);
              setCurrentShowIndex(-1);
            } else {
              setCurrentShowIndex(step);
            }
          }, TRANSITION_TIMING.showdownRevealMs);
        }, revealStartDelay);
        return () => {
          clearTimeout(startTimer);
          clearInterval(timer);
        };
      }
      if (maxSeq >= 0 && skipRevealAnimation) {
        setCurrentShowIndex(-1);
        setShowdownFinished(false);
        startTimer = setTimeout(() => setShowdownFinished(true), revealStartDelay);
        return () => clearTimeout(startTimer);
      }
      setCurrentShowIndex(-1);
      setShowdownFinished(false);
      startTimer = setTimeout(() => setShowdownFinished(true), revealStartDelay);
      return () => clearTimeout(startTimer);
    } else {
      setCurrentShowIndex(-1);
      setShowdownFinished(false);
    }
    return undefined;
  }, [roomData?.status, showdownAnimationKey, showdownSequenceSignature, activeTransition?.id, activeTransition?.endsAt]);

  const activeHighlights = useMemo(() => {
    if (roomData?.status !== 'showdown') return myCurrentHandInfo?.highlightCards || [];
    if (!showdownFinished) {
      const showingPlayer = roomData?.players.find((player) => player.showSequence === currentShowIndex);
      return showingPlayer?.highlightCards || [];
    }
    return roomData?.players.filter((player) => player.winAmount > 0).flatMap((player) => player.highlightCards || []);
  }, [roomData, currentShowIndex, showdownFinished, myCurrentHandInfo]);

  return {
    activeHighlights,
    currentShowIndex,
    myIsAllInRunoutRevealed,
    myIsShowdownRevealed,
    myIsWinnerGlow,
    showdownFinished,
  };
};
