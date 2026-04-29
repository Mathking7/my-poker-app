import React, { useState, useEffect, useRef } from 'react';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { Settings, Crown, X, ShieldAlert, Users } from 'lucide-react';
import { db, globalAppId } from '../firebase';
import { createDeck, evaluate7Cards } from '../utils/pokerLogic';
import { CHIP_UNIT, quantizeChipAmount } from '../utils/chipMath';
import {
  PRESENCE_HEARTBEAT_MS,
  applyRoomMaintenance,
  getMaintenanceManagerUid,
  isGameInProgress,
  isPlayerActive,
  stampPlayerPresence,
} from '../utils/roomMaintenance';
import { MAX_INITIAL_CHIPS, MAX_PLAYERS, MAX_TIME_LIMIT, MIN_INITIAL_CHIPS, MIN_TIME_LIMIT, getBigBlindForHand, getSmallBlindForHand, isJoinableStatus, normalizeGameSettings } from '../utils/gameSettings';
import {
  TRANSITION_TIMING,
  buildSettlementPots,
  clampRaiseAmount,
  createGameTransition,
  getCommunityCountForStatus,
  getFullPotSliderMark,
  getPlayerBettingOptions,
  getPhaseInfo,
  getRaiseIncrementAmount,
  getRaiseIncrementBounds,
  getShowdownAutoStartDelay,
  getSliderValueForRaiseAmount,
  getTotalRaiseAmountFromIncrement,
  getTransitionProgress,
  isTransitionActive,
  shouldAutoAdvanceAfterTransition,
  shouldRevealAllInHands,
  shouldSkipShowdownReveal,
} from '../utils/gameFlow';
import { getStatusClass } from '../utils/pokerUi';
import { canPlayerPotentiallyRaise, canPlayerTakeAction, getActionViewState } from '../utils/pokerViewState';
import GameLogDrawer from './poker/GameLogDrawer';
import JoinRequestsBar from './poker/JoinRequestsBar';
import OpponentCard from './poker/OpponentCard';
import PokerHeader from './poker/PokerHeader';
import SelfPlayerPanel from './poker/SelfPlayerPanel';
import TableCenter from './poker/TableCenter';
import TransitionBanner from './poker/TransitionBanner';

export default function PokerGame({ user, roomId, roomData, onLeaveRoom }) {
  const [copySuccess, setCopySuccess] = useState(false);
  const [raiseInput, setRaiseInput] = useState(0);
  const [raiseSliderInput, setRaiseSliderInput] = useState(0);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [localSettings, setLocalSettings] = useState(roomData?.settings || {});
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [topUpAmount, setTopUpAmount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [currentShowIndex, setCurrentShowIndex] = useState(-1);
  const [showdownFinished, setShowdownFinished] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [showMobileRaisePanel, setShowMobileRaisePanel] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [presentedTransition, setPresentedTransition] = useState(null);
  
  // 日志自动滚动 Ref
  const logsEndRef = useRef(null);
  const roomDataRef = useRef(roomData);
  const timerActionInFlightRef = useRef(false);

  useEffect(() => {
    roomDataRef.current = roomData;
  }, [roomData]);

  useEffect(() => {
    const tickId = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(tickId);
  }, []);

  useEffect(() => {
    if (!roomData?.transition?.id) return;

    setPresentedTransition((current) => {
      if (current?.id === roomData.transition.id) return current;
      const now = Date.now();
      const durationMs = Math.max(650, Number(roomData.transition.durationMs || 0));
      return {
        ...roomData.transition,
        serverStartedAt: roomData.transition.startedAt,
        serverEndsAt: roomData.transition.endsAt,
        startedAt: now,
        endsAt: now + durationMs,
        durationMs,
      };
    });
  }, [roomData?.transition]);

  useEffect(() => {
    if (!presentedTransition) return;
    if (isTransitionActive(presentedTransition, nowMs)) return;
    if (roomData?.transition?.id === presentedTransition.id) return;
    setPresentedTransition(null);
  }, [nowMs, presentedTransition, roomData?.transition?.id]);

  useEffect(() => {
    if (roomData?.players.find(p => p.uid === user?.uid)?.isKicked) {
      onLeaveRoom();
    }
  }, [roomData?.players, user?.uid, onLeaveRoom]);

  useEffect(() => {
    timerActionInFlightRef.current = false;
  }, [roomData?.turnIndex, roomData?.status, roomData?.handCount]);

  const myPlayerInfo = roomData?.players.find(p => p.uid === user?.uid);
  const effectiveSettings = normalizeGameSettings(roomData?.settings);
  const activeTransition = isTransitionActive(presentedTransition, nowMs)
    ? presentedTransition
    : (isTransitionActive(roomData?.transition, nowMs) ? roomData.transition : null);
  const transitionProgress = activeTransition ? getTransitionProgress(activeTransition, nowMs) : 1;
  const currentPhaseInfo = getPhaseInfo(roomData?.status);
  const isActionLocked = Boolean(activeTransition);
  const isMyTurn = roomData?.status !== 'waiting' && roomData?.status !== 'showdown' && roomData?.players[roomData?.turnIndex]?.uid === user?.uid && !roomData?.isPaused && !isActionLocked;
  const isHost = roomData?.hostUid === user?.uid && user?.uid != null;
  const isCreator = roomData?.creatorUid === user?.uid; 
  const nowForRender = nowMs;
  const maintenanceManagerUid = getMaintenanceManagerUid(roomData, nowForRender, user?.uid);
  const activeSeatedPlayers = (roomData?.players || []).filter(p => !p.isKicked && !p.isSittingOut && !p.waitingNextHand && isPlayerActive(p, nowForRender, user?.uid, roomData));
  const canStartGame = activeSeatedPlayers.length >= 2 && (
    isHost ||
    (roomData?.isPublic && maintenanceManagerUid === user?.uid) ||
    (!roomData?.hostUid && isCreator)
  );
  const isPendingApproval = !roomData?.isPublic && !myPlayerInfo && roomData?.joinRequests?.some(r => r.uid === user?.uid);

  // ==== 动态裁判机制 ====
  // 找出当前轮到谁操作
  const currentPlayerUid = roomData?.players[roomData?.turnIndex]?.uid;
  // 推选裁判：按数组顺序，找出除了当前玩家之外，第一个在座的玩家
  const designatedReferee = roomData?.players.find(p => p.uid !== currentPlayerUid && !p.isSittingOut);
  // 判断当前正在运行代码的你，是不是被选中的裁判
  const isReferee = user?.uid === designatedReferee?.uid;

  // 加注计算
  const bettingOptions = getPlayerBettingOptions(roomData, myPlayerInfo);
  const { callAmount, maxBet, minRaiseTarget, potAfterCall } = bettingOptions;
  const currentActionPlayer = roomData?.players?.[roomData?.turnIndex];
  const showActionDock = Boolean(myPlayerInfo);
  const canTakeAction = canPlayerTakeAction({
    isMyTurn,
    myPlayerInfo,
    status: roomData?.status,
  });
  const canPotentiallyRaise = canPlayerPotentiallyRaise({
    myPlayerInfo,
    status: roomData?.status,
    bettingOptions,
  });
  const canRaiseNow = canTakeAction && canPotentiallyRaise;
  const fullPotRaiseTarget = roomData
    ? quantizeChipAmount(Math.floor((roomData.currentBet || 0) + potAfterCall), 'floor')
    : 0;
  const potRaiseTarget = roomData
    ? clampRaiseAmount(fullPotRaiseTarget, minRaiseTarget, maxBet)
    : 0;
  const fullPotSliderMark = getFullPotSliderMark({
    fullPotRaiseTarget,
    minRaiseTarget,
    maxBet,
  });
  const showFullPotPreset = fullPotRaiseTarget >= minRaiseTarget && fullPotRaiseTarget < maxBet;
  const raiseIncrementBounds = getRaiseIncrementBounds({
    playerBet: myPlayerInfo?.bet || 0,
    minRaiseTarget,
    maxBet,
  });
  const raiseIncrementInput = getRaiseIncrementAmount(raiseInput, myPlayerInfo?.bet || 0);
  const isMobileRaiseOpen = showMobileRaisePanel && canRaiseNow;
  const {
    actionStatusDetail,
    actionStatusLabel,
    currentActionName,
    isTimerCritical,
    showCurrentActionClock,
  } = getActionViewState({
    activeTransition,
    callAmount,
    canTakeAction,
    currentActionPlayer,
    currentPhaseInfo,
    effectiveSettings,
    myPlayerInfo,
    roomData,
    timeLeft,
    userUid: user?.uid,
  });

  const setRaiseAmount = (amount, { syncSlider = true } = {}) => {
    const nextAmount = clampRaiseAmount(amount, minRaiseTarget, maxBet);
    setRaiseInput(nextAmount);
    if (syncSlider) {
      setRaiseSliderInput(getSliderValueForRaiseAmount({
        amount: nextAmount,
        minAmount: minRaiseTarget,
        potAmount: potRaiseTarget,
        maxAmount: maxBet,
      }));
    }
  };

  const setRaiseIncrementAmount = (amount, options = {}) => {
    setRaiseAmount(getTotalRaiseAmountFromIncrement({
      incrementAmount: amount,
      playerBet: myPlayerInfo?.bet || 0,
      minRaiseTarget,
      maxBet,
    }), options);
  };

  // 实时计算自己的当前牌型
  const myCurrentHandInfo = React.useMemo(() => {
    if (myPlayerInfo && myPlayerInfo.hand && myPlayerInfo.hand.length > 0 && roomData && roomData.status !== 'waiting') {
      return evaluate7Cards(myPlayerInfo.hand, roomData.communityCards || []);
    }
    return null;
  }, [myPlayerInfo, roomData]);

  // 提取到顶层的自身获胜高亮状态
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

  // ==== 1. 倒计时功能 (自动过牌/弃牌 & 掉线保护) ====
  useEffect(() => {
    // === 修改点 1：各种不需要计时的情况，必须显式清零 timeLeft ===
    if (roomData?.status === 'waiting' || roomData?.status === 'showdown' || roomData?.isPaused || activeTransition) {
      setTimeLeft(0);
      return;
    }
    if (effectiveSettings.timeLimit === '无限') {
      setTimeLeft(0); 
      return;
    }

    setTimeLeft(effectiveSettings.timeLimit);
    const timerId = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          if (timerActionInFlightRef.current) return 0;
          timerActionInFlightRef.current = true;
          // 双重保险机制
          if (isMyTurn) {
            // 本人在线：由本人客户端触发正常逻辑
            Promise.resolve(handleAction(callAmount === 0 ? 'call' : 'fold')).finally(() => { timerActionInFlightRef.current = false; }); 
          } else if (isReferee) {
            // 本人掉线：由裁判的客户端充当服务器，强行执行超时逻辑
            Promise.resolve(handleTimeoutForceAction()).finally(() => { timerActionInFlightRef.current = false; });
          } else {
            timerActionInFlightRef.current = false;
          }
          return 0; // 倒计时归零
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerId);
    
    // handleAction and handleTimeoutForceAction are declared below and intentionally
    // captured from the current render for this turn timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomData?.turnIndex, roomData?.status, roomData?.isPaused, activeTransition?.id, isMyTurn, callAmount, effectiveSettings.timeLimit, isReferee]);

  // ==== 2. 自动开局逻辑 (动态轮转) ====
  useEffect(() => {
    let timeoutId;
    const now = Date.now();
    const seatedPlayers = (roomData?.players || []).filter(p => !p.isKicked && !p.isSittingOut && !p.waitingNextHand && isPlayerActive(p, now, user?.uid, roomData)).length;
    
    if (roomData?.status === 'showdown' && !roomData.isPaused && seatedPlayers >= 2) {
      const managerUid = getMaintenanceManagerUid(roomData, now, user?.uid);
      if (user.uid === managerUid) {
        const showdownDelayRoom = activeTransition?.type === 'showdown'
          ? { ...roomData, transition: activeTransition }
          : roomData;
        const delay = getShowdownAutoStartDelay(showdownDelayRoom, now);
        timeoutId = setTimeout(() => startGame(), delay);
      }
    }
    return () => clearTimeout(timeoutId);
    // startGame is declared below; this effect should rerun only when room state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomData?.status, roomData?.isPaused, roomData?.players, roomData?.transition?.id, activeTransition?.id, activeTransition?.endsAt]);

  // ==== 3. 玩家在线心跳 ====
  useEffect(() => {
    if (!user?.uid || !roomId) return;
    const roomRef = doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId);

    const sendPresence = async () => {
      const now = Date.now();
      try {
        await setDoc(roomRef, {
          presence: {
            [user.uid]: {
              lastSeenAt: now,
              isOnline: true,
            },
          },
          updatedAt: now,
        }, { merge: true });
      } catch (err) {
        console.error("Presence Heartbeat Error:", err);
      }
    };

    sendPresence();
    const heartbeatId = setInterval(sendPresence, PRESENCE_HEARTBEAT_MS);
    return () => clearInterval(heartbeatId);
  }, [roomId, user?.uid]);

  // ==== 4. 房间维护：清理离线玩家、推进被离线玩家卡住的牌局、转移私密房房主 ====
  useEffect(() => {
    if (!user?.uid || !roomId) return;

    const runMaintenance = async () => {
      const currentRoom = roomDataRef.current;
      if (!currentRoom?.players?.length) return;

      const now = Date.now();
      if (isTransitionActive(currentRoom.transition, now)) return;
      const managerUid = getMaintenanceManagerUid(currentRoom, now, user.uid);
      if (managerUid !== user.uid) return;

      const result = applyRoomMaintenance(currentRoom, now, user.uid);
      if (!result.changed) return;

      try {
        await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), result.room);
        if (result.shouldAdvance) {
          await advanceGameState(result.room);
        }
      } catch (err) {
        console.error("Room Maintenance Error:", err);
      }
    };

    const firstRunId = setTimeout(runMaintenance, 3000);
    const intervalId = setInterval(runMaintenance, 10000);
    return () => {
      clearTimeout(firstRunId);
      clearInterval(intervalId);
    };
    // advanceGameState is declared below; the interval reads the latest room data from roomDataRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, user?.uid]);

  // ==== 5. 同步过场收尾：过场结束后才开放行动，all-in 场景继续自动跑牌 ====
  useEffect(() => {
    if (!roomData?.transition?.id || !user?.uid || !roomId) return;

    const delay = Math.max(0, Number(roomData.transition.endsAt || 0) - Date.now() + TRANSITION_TIMING.transitionCompletionGraceMs);
    const timeoutId = setTimeout(async () => {
      const currentRoom = roomDataRef.current;
      if (!currentRoom?.transition || currentRoom.transition.id !== roomData.transition.id) return;

      const now = Date.now();
      if (isTransitionActive(currentRoom.transition, now)) return;

      const managerUid = getMaintenanceManagerUid(currentRoom, now, user.uid);
      if (managerUid !== user.uid) return;

      const completedTransition = currentRoom.transition;
      const nextState = { ...currentRoom, transition: null, updatedAt: now };
      try {
        if (shouldAutoAdvanceAfterTransition({ ...nextState, transition: completedTransition })) {
          await advanceGameState({ ...nextState, transition: completedTransition });
        } else {
          await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), nextState);
        }
      } catch (err) {
        console.error("Transition Completion Error:", err);
      }
    }, delay);

    return () => clearTimeout(timeoutId);
    // advanceGameState is declared below; this effect is gated by a single manager uid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomData?.transition?.id, roomData?.transition?.endsAt, user?.uid, roomId]);

  // ==== 5. 聊天记录自动滚动 ====
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [roomData?.logs]);

  useEffect(() => {
    if (!canPotentiallyRaise || maxBet <= 0) {
      setRaiseInput(0);
      setRaiseSliderInput(0);
      return;
    }

    const nextAmount = clampRaiseAmount(minRaiseTarget, minRaiseTarget, maxBet);
    setRaiseInput(nextAmount);
    setRaiseSliderInput(getSliderValueForRaiseAmount({
      amount: nextAmount,
      minAmount: minRaiseTarget,
      potAmount: potRaiseTarget,
      maxAmount: maxBet,
    }));
  }, [canPotentiallyRaise, maxBet, minRaiseTarget, potRaiseTarget, roomData?.handCount, roomData?.status, roomData?.turnIndex]);

  useEffect(() => {
    setShowMobileRaisePanel(false);
  }, [roomData?.turnIndex, roomData?.status, roomData?.handCount]);

  useEffect(() => {
    if (!canRaiseNow) setShowMobileRaisePanel(false);
  }, [canRaiseNow]);

  const calcPotRaise = (fraction) => clampRaiseAmount(
    Math.floor((roomData?.currentBet || 0) + potAfterCall * fraction),
    minRaiseTarget,
    maxBet,
  );
  const addLog = (data, msg) => {
    let newLogs = [...(data.logs || []), msg];
    if (newLogs.length > 50) newLogs = newLogs.slice(newLogs.length - 50); // 增加日志保留条数
    return newLogs;
  };

  const getNextPlayerIndex = (players, startIndex, predicate) => {
    if (!players.length) return -1;
    for (let step = 1; step <= players.length; step++) {
      const index = (startIndex + step) % players.length;
      if (predicate(players[index], index)) return index;
    }
    return -1;
  };

  const getFirstPlayerIndex = (players, predicate) => {
    return players.findIndex((player, index) => predicate(player, index));
  };

  const getActiveSeatIndexes = (players) => {
    return players
      .map((player, index) => ({ player, index }))
      .filter(({ player }) => !player.folded)
      .map(({ index }) => index);
  };

  const getNextActionIndex = (players, startIndex) => {
    return getNextPlayerIndex(players, startIndex, (player) => !player.folded && !player.allIn);
  };

  // ==== 新增：明牌动画播放器 ====
  useEffect(() => {
    if (roomData?.status === 'showdown') {
      const maxSeq = Math.max(-1, ...((roomData.players || []).map(p => p.showSequence ?? -1)));
      const skipRevealAnimation = shouldSkipShowdownReveal(roomData);
      const revealTransition = activeTransition?.type === 'showdown'
        ? activeTransition
        : (roomData.transition?.type === 'showdown' ? roomData.transition : null);
      const revealStartDelay = revealTransition
        ? Math.max(0, Number(revealTransition.endsAt || 0) - Date.now())
        : 0;
      let timer;
      let startTimer;

      if (!skipRevealAnimation && maxSeq >= 0) {
        setCurrentShowIndex(-1);
        setShowdownFinished(false);
        startTimer = setTimeout(() => {
          let step = 0;
          setCurrentShowIndex(0);
          timer = setInterval(() => {
            step++;
            if (step > maxSeq) {
              clearInterval(timer);
              setShowdownFinished(true); // 所有人明牌完毕，展示最终胜者
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
      } else {
        setCurrentShowIndex(-1);
        setShowdownFinished(false);
        startTimer = setTimeout(() => setShowdownFinished(true), revealStartDelay);
        return () => clearTimeout(startTimer);
      }
    } else {
      setCurrentShowIndex(-1);
      setShowdownFinished(false);
    }
    // 只在同一局的结算身份或亮牌顺序变化时重启动画；心跳和清 transition 不应重放结算。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomData?.status, showdownAnimationKey, showdownSequenceSignature, activeTransition?.id, activeTransition?.endsAt]);

  // ==== 新增：提取当前应当高光的牌 ====
  const activeHighlights = React.useMemo(() => {
    if (roomData?.status !== 'showdown') return myCurrentHandInfo?.highlightCards || [];
    if (!showdownFinished) {
      // 动画期间，高光当前正在明牌的人的牌
      const showingPlayer = roomData?.players.find(p => p.showSequence === currentShowIndex);
      return showingPlayer?.highlightCards || [];
    }
    // 动画结束，高光所有胜者的牌
    return roomData?.players.filter(p => p.winAmount > 0).flatMap(p => p.highlightCards || []);
  }, [roomData, currentShowIndex, showdownFinished, myCurrentHandInfo]);

  // ---------------- 房间管理操作 ----------------
  const handleApproveJoin = async (reqUid, reqName, approve) => {
    if (!isHost) return;
    const now = Date.now();
    let nextData = JSON.parse(JSON.stringify(roomData));
    const settings = normalizeGameSettings(nextData.settings);
    nextData.joinRequests = nextData.joinRequests.filter(r => r.uid !== reqUid);
    if (approve) {
      if (nextData.players.length >= MAX_PLAYERS) {
        nextData.logs = addLog(nextData, `⚠️ 房间人数已满，无法同意 ${reqName} 加入。`);
        nextData.updatedAt = now;
        await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), nextData);
        return;
      }
      const isGameOngoing = !isJoinableStatus(nextData.status);
      if (isGameOngoing && !settings.allowJoinDuringGame) {
        nextData.logs = addLog(nextData, `⚠️ 当前设置不允许中途加入，已拒绝 ${reqName}。`);
        nextData.updatedAt = now;
        await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), nextData);
        return;
      }
      nextData.players.push(stampPlayerPresence({
        uid: reqUid, name: reqName, chips: settings.initialChips, 
        hand: [], bet: 0, folded: isGameOngoing, allIn: false, hasActed: isGameOngoing, isSittingOut: false, waitingNextHand: isGameOngoing, lastAction: null
      }, now));
      nextData.logs = addLog(nextData, `✅ 房主同意了 ${reqName} ${isGameOngoing ? '加入观战，将在下一局入座' : '加入房间'}。`);
    }
    nextData.updatedAt = now;
    await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), nextData);
  };

  const handleTogglePause = async () => {
    if (!isHost) return;
    await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), {
      ...roomData, isPaused: !roomData.isPaused, logs: addLog(roomData, `⏸️ 房主${!roomData.isPaused ? '暂停' : '恢复'}了对局。`)
    });
  };

  const handleToggleSit = async () => {
    if (!myPlayerInfo) return;
    let nextData = JSON.parse(JSON.stringify(roomData));
    let me = nextData.players.find(p => p.uid === user.uid);
    const willSitOut = !me.isSittingOut;
    me.isSittingOut = willSitOut;
    Object.assign(me, stampPlayerPresence(me, Date.now()));
    
    if (me.isSittingOut && nextData.status !== 'waiting' && nextData.status !== 'showdown' && !me.folded) {
      me.folded = true;
      me.hasActed = true;
      me.waitingNextHand = false;
      nextData.logs = addLog(nextData, `🚶 ${me.name} 站起观战并弃牌。`);
      await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), nextData);
      if (!isTransitionActive(nextData.transition)) {
        await advanceGameState(nextData);
      }
      return;
    }
    if (!me.isSittingOut && isGameInProgress(nextData.status)) {
      me.folded = true;
      me.hasActed = true;
      me.waitingNextHand = true;
      nextData.logs = addLog(nextData, `🪑 ${me.name} 选择坐下，将在下一局参与。`);
    } else {
      me.waitingNextHand = false;
      nextData.logs = addLog(nextData, `🪑 ${me.name} 选择${me.isSittingOut ? '站起观战' : '坐下参与'}。`);
    }
    await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), nextData);
  };

  const handleSaveSettings = async () => {
    if (!isHost) return;
    const nextSettings = normalizeGameSettings(localSettings);
    await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), {
      ...roomData, settings: nextSettings, updatedAt: Date.now(), logs: addLog(roomData, '⚙️ 房主修改了房间设置 (下一局生效)')
    });
    setLocalSettings(nextSettings);
    setShowSettingsModal(false);
  };

  const handleResetGame = async () => {
    if (!isHost) return;
    if (!window.confirm('确定要重置对局吗？所有玩家的筹码将恢复为初始状态，当前牌局将被强制中止。')) return;
    
    let nextData = JSON.parse(JSON.stringify(roomData));
    
    // 应用新设置
    nextData.settings = normalizeGameSettings(localSettings);
    
    // 重置牌桌全局状态
    nextData.status = 'waiting';
    nextData.pot = 0;
    nextData.currentBet = 0;
    nextData.minRaise = 20;
    nextData.communityCards = [];
    nextData.deck = [];
    nextData.handCount = 0;
    nextData.lastAggressorUid = null;
    nextData.transition = null;
    nextData.settlement = null;
    nextData.updatedAt = Date.now();
    
    // 重置所有玩家状态与筹码
    nextData.players = nextData.players.map(p => ({
      ...p,
      chips: nextData.settings.initialChips, // 恢复为设置的初始筹码
      hand: [],
      bet: 0,
      folded: false,
      allIn: false,
      hasActed: false,
      lastAction: null,
      rankName: null,
      showCards: false,
      showSequence: -1,
      highlightCards: [],
      winAmount: 0,
      totalContribution: 0
    }));
    
    nextData.logs = addLog(nextData, '⚠️ 房主中止并重置了对局，所有玩家筹码已恢复初始值。');
    
    await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), nextData);
    setShowSettingsModal(false);
  };

  const handleDestroyRoom = async () => {
    if (!isHost) return;
    if (!window.confirm('确定要解散房间吗？此操作不可逆，所有人将被移出房间。')) return;
    
    try {
      await deleteDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId));
      setShowSettingsModal(false);
      onLeaveRoom(); // 调用传入的退出函数，返回大厅
    } catch (err) {
      console.error("解散房间失败", err);
      alert("解散房间失败，请重试");
    }
  };

  const handlePlayerActionMenu = async (actionType) => {
    if (!isHost || !selectedPlayer) return;
    let nextData = JSON.parse(JSON.stringify(roomData));
    const targetIndex = nextData.players.findIndex(p => p.uid === selectedPlayer.uid);
    const isMidHand = isGameInProgress(nextData.status);
    let shouldAdvance = false;

    if (actionType === 'kick') {
      if (targetIndex === -1) return;
      const targetPlayer = nextData.players[targetIndex];
      nextData.logs = addLog(nextData, `👢 房主将 ${selectedPlayer.name} 踢出房间。`);
      if (isMidHand) {
        targetPlayer.isKicked = true;
        targetPlayer.isSittingOut = true;
        targetPlayer.waitingNextHand = false;
        if (!targetPlayer.folded && !targetPlayer.allIn) {
          targetPlayer.folded = true;
          targetPlayer.hasActed = true;
          targetPlayer.lastAction = 'fold';
          shouldAdvance = true;
        }
      } else {
        nextData.players = nextData.players.filter(p => p.uid !== selectedPlayer.uid);
        if (nextData.turnIndex >= nextData.players.length) nextData.turnIndex = 0;
      }
    } 
    else if (actionType === 'transfer') {
      nextData.hostUid = selectedPlayer.uid;
      nextData.logs = addLog(nextData, `👑 房主已转让给 ${selectedPlayer.name}。`);
    }
    else if (actionType === 'setChips') {
      if (isMidHand) {
        alert('牌局进行中不能直接修改筹码，请在本局结束后再调整。');
        return;
      }
      const targetPlayer = nextData.players.find(p => p.uid === selectedPlayer.uid);
      const oldChips = targetPlayer.chips;
      targetPlayer.chips = quantizeChipAmount(topUpAmount);
      nextData.logs = addLog(nextData, `💰 房主将 ${selectedPlayer.name} 的筹码从 ${oldChips} 修改为 ${targetPlayer.chips}。`);
    }
    nextData.updatedAt = Date.now();
    await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), nextData);
    if (shouldAdvance && !isTransitionActive(nextData.transition)) {
      await advanceGameState(nextData);
    }
    setSelectedPlayer(null);
  };

  const handleLeave = async () => {
    if (myPlayerInfo) {
      const now = Date.now();
      let nextData = JSON.parse(JSON.stringify(roomData));
      const me = nextData.players.find(p => p.uid === user.uid);
      const isMidHand = isGameInProgress(nextData.status);
      let shouldAdvance = false;

      if (me && isMidHand) {
        me.isSittingOut = true;
        me.isOnline = false;
        me.disconnectedAt = now;
        me.waitingNextHand = false;
        if (!me.folded && !me.allIn) {
          me.folded = true;
          me.hasActed = true;
          me.lastAction = 'fold';
          shouldAdvance = true;
        }
        if (isHost) {
          const nextHost = nextData.players.find(p => p.uid !== user.uid && !p.isSittingOut && !p.isKicked);
          nextData.hostUid = nextData.isPublic ? null : nextHost?.uid || null;
        }
        nextData.logs = addLog(nextData, `🚪 ${me.name} 离开房间，已转为观战。`);
        nextData.updatedAt = now;
        await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), nextData);
        if (shouldAdvance && !isTransitionActive(nextData.transition)) {
          await advanceGameState(nextData);
        }
      } else {
        nextData.players = nextData.players.filter(p => p.uid !== user.uid);
        if (nextData.players.length === 0) {
          await deleteDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId));
        } else {
          if (isHost) {
            nextData.hostUid = nextData.isPublic ? null : nextData.players[0]?.uid || null;
          }
          nextData.updatedAt = now;
          await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), nextData);
        }
      }
    }
    onLeaveRoom();
  };

  // ---------------- 游戏核心逻辑 ----------------

  const startGame = async () => {
    if (!canStartGame) return;
    const now = Date.now();
    const settings = normalizeGameSettings(roomData.settings);
    const managerUid = getMaintenanceManagerUid(roomData, now, user?.uid);
    if (roomData.isPublic && managerUid !== user?.uid) return;
    let deck = createDeck();
    let logs = [...(roomData.logs || [])];
    let handCount = (roomData.handCount || 0) + 1;
    const baseBlind = getSmallBlindForHand(settings, handCount);
    const bigBlind = getBigBlindForHand(settings, handCount);

    let players = roomData.players.filter(p => !p.isKicked).map(p => {
      const isUnavailable = p.isSittingOut || !isPlayerActive(p, now, user.uid, roomData);
      let currentChips = quantizeChipAmount(p.chips, 'floor');
      if (currentChips <= 0 && settings.autoTopUp && !isUnavailable) {
        const topUpValue = quantizeChipAmount(settings.initialChips / 2, 'floor');
        currentChips += topUpValue;
        logs.push(`💸 ${p.name} 触发自动补码 (+${topUpValue})。`);
      }
      return { 
        ...p, 
        chips: currentChips, 
        hand: [], 
        bet: 0, 
        folded: currentChips <= 0 || isUnavailable, 
        allIn: false, 
        hasActed: false, 
        lastAction: null, 
        rankName: null,
        showCards: false,
        showSequence: -1,
        highlightCards: [],
        winAmount: 0,
        waitingNextHand: false,
        totalContribution: 0
      };
    });

    const activeSeatIndexes = getActiveSeatIndexes(players);
    if (activeSeatIndexes.length < 2) {
       if (roomData.status !== 'waiting') {
         await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), { ...roomData, players, settings, status: 'waiting', updatedAt: now });
       }
       return;
    }

    const previousDealerIndex = Number.isInteger(roomData.dealerIndex) && roomData.dealerIndex < players.length ? roomData.dealerIndex : -1;
    let nextDealerIndex = getNextPlayerIndex(players, previousDealerIndex, (player) => !player.folded);
    if (nextDealerIndex === -1) nextDealerIndex = getFirstPlayerIndex(players, (player) => !player.folded);
    
    let sbIndex, bbIndex;
    if (activeSeatIndexes.length === 2) {
      sbIndex = nextDealerIndex;      // 2人局：庄家就是小盲
      bbIndex = activeSeatIndexes.find(index => index !== sbIndex);  // 另一位是大盲
    } else {
      sbIndex = getNextPlayerIndex(players, nextDealerIndex, (player) => !player.folded);
      bbIndex = getNextPlayerIndex(players, sbIndex, (player) => !player.folded);
    }
    
    let utgIndex = activeSeatIndexes.length === 2
      ? sbIndex
      : getNextActionIndex(players, bbIndex);

    const sbAmount = Math.min(baseBlind, players[sbIndex].chips);
    const bbAmount = Math.min(bigBlind, players[bbIndex].chips);
    
    // 小盲注投入记录
    players[sbIndex].chips -= sbAmount; 
    players[sbIndex].bet += sbAmount; 
    players[sbIndex].totalContribution = sbAmount; // <--- 新增：记录小盲初始投入
    players[sbIndex].allIn = players[sbIndex].chips === 0; 
    players[sbIndex].lastAction = 'SB';

    // 大盲注投入记录
    players[bbIndex].chips -= bbAmount; 
    players[bbIndex].bet += bbAmount; 
    players[bbIndex].totalContribution = bbAmount; // <--- 新增：记录大盲初始投入
    players[bbIndex].allIn = players[bbIndex].chips === 0; 
    players[bbIndex].lastAction = 'BB';

    let pot = sbAmount + bbAmount;
    const currentBet = bigBlind;

    players.forEach(p => { if (!p.folded) { p.hand = [deck.pop(), deck.pop()]; } });

    logs.push(`--- 第 ${handCount} 局开始 (盲注: ${baseBlind}/${bigBlind}) ---`);
    const transition = createGameTransition({
      type: 'hand-start',
      fromStatus: roomData.status,
      toStatus: 'pre-flop',
      now,
      message: `第 ${handCount} 局开始，盲注 ${baseBlind}/${bigBlind}`,
      totalPot: pot,
    });

    const newRoomState = {
      ...roomData, status: 'pre-flop', isPaused: false, dealerIndex: nextDealerIndex, turnIndex: utgIndex,
      deck: deck, communityCards: [], pot: pot, currentBet, minRaise: bigBlind, players, logs, handCount, lastAggressorUid: null, settings, updatedAt: now, transition, settlement: null, allInRunout: false
    };
    if (utgIndex === -1 || players.filter(p => !p.folded && !p.allIn).length <= 1) {
      await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), newRoomState);
      return;
    }
    await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), newRoomState);
  };

  const advanceGameState = async (currentState) => {
    let nextState = JSON.parse(JSON.stringify(currentState));
    nextState.updatedAt = Date.now();
    const activeContenders = nextState.players.filter(p => !p.folded);
    const completedActionHold = currentState.transition?.type === 'action-hold';
    const hasRecentVisibleAction = nextState.players.some(p => p.lastAction);
    const holdLastActionBeforeAdvance = async () => {
      const holdNow = Date.now();
      nextState.turnIndex = -1;
      nextState.updatedAt = holdNow;
      nextState.transition = createGameTransition({
        type: 'action-hold',
        fromStatus: nextState.status,
        toStatus: nextState.status,
        now: holdNow,
        message: '本轮行动完成',
        totalPot: nextState.pot,
      });
      await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), nextState);
    };

    // 1. 唯一结算入口：当状态为 showdown 时执行
    if (nextState.status === 'showdown') {
      if (nextState.settlement?.id) return;

      // === 核心修复 1：强力兜底 ===
      // 在结算开始前，确保所有玩家（包括已弃牌的玩家）都有合法的动效字段
      // 绝对防止 Firebase 抛出 "Unsupported field value: undefined" 崩溃
      nextState.players.forEach(p => {
        p.winAmount = 0;
        p.showCards = p.showCards || false;
        p.showSequence = p.showSequence ?? -1;
        p.highlightCards = p.highlightCards || [];
        p.rankName = p.rankName || '';
      });

      const baseContenders = nextState.players
        .filter(p => !p.folded)
        .map(p => {
          // 增加对 hand 的空数组兜底，防止极度异常情况下的解析报错
          const { score, rankName, highlightCards } = evaluate7Cards(p.hand || [], nextState.communityCards || []);
          return { 
            ...p, 
            _score: score, 
            _rankName: rankName || '', 
            _highlightCards: highlightCards || [],
            winAmount: 0 
          };
        });
      
      // 正规开牌 (Auto-Muck) 逻辑
      // === 核心逻辑：确定开牌的起始座位索引 ===
      let startIndex = -1;
      const playerCount = nextState.players.length;

      // 规则 A：如果有最后加注者，且他没有弃牌，从他开始亮牌
      if (nextState.lastAggressorUid) {
         const agIdx = nextState.players.findIndex(p => p.uid === nextState.lastAggressorUid);
         if (agIdx !== -1 && !nextState.players[agIdx].folded) {
             startIndex = agIdx;
         }
      }
      
      // 规则 B：如果河牌圈大家都是 Check 过牌（没有加注者），从小盲位（庄家下一位）开始
      if (startIndex === -1) {
         // 兜底处理：防止由于首局没有庄家导致 dealerIndex 异常引发的 NaN 崩溃
         const dIndex = Number.isInteger(nextState.dealerIndex) ? nextState.dealerIndex : 0;
         startIndex = (dIndex + 1) % playerCount;
      }

      // === 按真实顺时针顺序排列参与比牌的玩家 ===
      const orderedContenders = [];
      for (let i = 0; i < playerCount; i++) {
        const seatIndex = (startIndex + i) % playerCount;
        const playerAtSeat = baseContenders.find(c => c.uid === nextState.players[seatIndex].uid);
        if (playerAtSeat) {
          orderedContenders.push(playerAtSeat);
        }
      }

      // === 正规开牌 (Auto-Muck) 执行 ===
      const isAllInShowdown = orderedContenders.some(c => c.allIn);
      const skipRevealAnimation = Boolean(nextState.allInRunout);
      let currentBestScore = -1;
      let seq = 0; // 动画播放顺位

      orderedContenders.forEach(c => {
        const pIndex = nextState.players.findIndex(p => p.uid === c.uid);
        nextState.players[pIndex].rankName = c._rankName; 
        nextState.players[pIndex].highlightCards = c._highlightCards; 

        if (skipRevealAnimation) {
          nextState.players[pIndex].showCards = true;
          nextState.players[pIndex].showSequence = -1;
          currentBestScore = Math.max(currentBestScore, c._score);
          return;
        }
        
        if (isAllInShowdown || c._score >= currentBestScore) {
          nextState.players[pIndex].showCards = true;
          nextState.players[pIndex].showSequence = seq++; // 赋给序号并累加
          currentBestScore = Math.max(currentBestScore, c._score);
        } else {
          nextState.players[pIndex].showCards = false; 
          nextState.players[pIndex].showSequence = -1; 
        }
      });

      const contenders = baseContenders; // 将排好序的结果交接回原有的 contenders 变量
      
      const totalPot = quantizeChipAmount(nextState.pot, 'floor');
      const settlementResult = buildSettlementPots(nextState.players, contenders, totalPot, {
        dealerIndex: nextState.dealerIndex,
      });
      contenders.forEach(c => {
        c.winAmount = settlementResult.winByUid[c.uid] || 0;
      });

      const winLogs = [];
      contenders.forEach(c => {
        if (c.winAmount > 0) {
          const pIndex = nextState.players.findIndex(p => p.uid === c.uid);
          nextState.players[pIndex].chips += c.winAmount;
          
          // === 核心修复 2：将结算金额写入玩家全局状态 ===
          // 这一步决定了前台 UI 究竟能不能让胜者边框发光！
          nextState.players[pIndex].winAmount = c.winAmount;
          
          winLogs.push(`【${c.name}】(${c._rankName}) 赢得了 ${c.winAmount}`);
        }
      });

      nextState.logs = addLog(nextState, `🏆 结算完成：${winLogs.join('，')}！`);
      nextState.transition = nextState.transition || createGameTransition({
        type: 'showdown',
        fromStatus: 'river',
        toStatus: 'showdown',
        now: nextState.updatedAt,
        message: '摊牌与分池结算',
        totalPot,
      });
      nextState.settlement = {
        id: `${nextState.handCount || 0}-${nextState.updatedAt}`,
        totalPot,
        pots: settlementResult.pots,
        totalAwarded: settlementResult.totalAwarded,
      };
      nextState.pot = 0;
      nextState.currentBet = 0;
      nextState.players.forEach(p => { p.bet = 0; p.hasActed = false; p.lastAction = null; p.totalContribution = 0; });

      await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), nextState);
      return; 
    }

    // 2. 判定弃牌获胜（场上仅剩1人）
    if (activeContenders.length === 1) {
      if (!completedActionHold && hasRecentVisibleAction) {
        await holdLastActionBeforeAdvance();
        return;
      }

      const winner = activeContenders[0];
      const totalWon = quantizeChipAmount(nextState.pot, 'floor');
      const finishedAt = Date.now();
      
      // 强力清理所有人的状态，确保完全跳过明牌动画，直接进入 3 秒获胜高光
      nextState.players.forEach(p => {
        p.winAmount = 0;
        p.showCards = false;
        p.showSequence = -1; // 强制设为 -1，使得前端 maxSeq 变为 -1
        p.highlightCards = [];
      });
      
      winner.winAmount = totalWon; 
      winner.chips += totalWon;
      
      nextState.logs = addLog(nextState, `🏆 玩家【${winner.name}】获胜，赢得底池 ${totalWon}！`);
      
      nextState.status = 'showdown';
      nextState.transition = createGameTransition({
        type: 'showdown',
        fromStatus: currentState.status,
        toStatus: 'showdown',
        now: finishedAt,
        message: `${winner.name} 赢得本局，正在分配底池`,
        totalPot: totalWon,
      });
      nextState.settlement = {
        id: `${nextState.handCount || 0}-${finishedAt}`,
        totalPot: totalWon,
        pots: [{
          id: 0,
          label: '主池',
          amount: totalWon,
          winners: [{ uid: winner.uid, name: winner.name, rankName: '弃牌获胜', amount: totalWon }],
        }],
        totalAwarded: totalWon,
      };
      nextState.pot = 0;
      nextState.currentBet = 0;
      nextState.players.forEach(p => { p.bet = 0; p.hasActed = false; p.lastAction = null; p.totalContribution = 0; });

      await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), nextState);
      return;
    }

    // 3. 检查当前操作轮是否完成
    const needToAct = nextState.players.filter(p => !p.folded && !p.allIn);
    const isRoundComplete = needToAct.every(p => p.hasActed && p.bet === nextState.currentBet);

    // 如果有 2 个或更多人能动，且轮次没完，必须等待。
    // 如果只有 1 个人能动，但他目前的下注还没跟平最高注（比如被全下玩家盖过了），他也必须手动点 Call 或 Fold。
    const mustWait = (needToAct.length >= 2 && !isRoundComplete) || 
                    (needToAct.length === 1 && needToAct[0].bet < nextState.currentBet);

    if (mustWait) {
      let nextTurn = getNextActionIndex(nextState.players, nextState.turnIndex);
      if (nextTurn === -1) {
        await advanceGameState({ ...nextState, turnIndex: 0 });
        return;
      }
      
      nextState.turnIndex = nextTurn;
      await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), nextState);
      return;
    }

    // 4. 运行到这里说明本轮结束，推进阶段
    if (!completedActionHold && hasRecentVisibleAction) {
      await holdLastActionBeforeAdvance();
      return;
    }

    const fromStatus = nextState.status;
    const transitionNow = Date.now();
    let dealtCardCount = 0;
    let transitionMessage = '';
    nextState.players.forEach(p => { p.bet = 0; p.hasActed = false; p.lastAction = null; });
    nextState.currentBet = 0;
    nextState.minRaise = getBigBlindForHand(nextState.settings, nextState.handCount);

    if (nextState.status === 'pre-flop') {
      nextState.status = 'flop';
      nextState.lastAggressorUid = null;
      nextState.communityCards.push(nextState.deck.pop(), nextState.deck.pop(), nextState.deck.pop());
      dealtCardCount = 3;
      transitionMessage = '翻牌：发出三张公共牌';
      nextState.logs = addLog(nextState, `🃏 翻牌: ${nextState.communityCards.join(' ')}`);
    } else if (nextState.status === 'flop') {
      nextState.status = 'turn';
      nextState.lastAggressorUid = null;
      nextState.communityCards.push(nextState.deck.pop());
      dealtCardCount = 1;
      transitionMessage = '转牌：发出第四张公共牌';
      nextState.logs = addLog(nextState, `🃏 转牌: ${nextState.communityCards[3]}`);
    } else if (nextState.status === 'turn') {
      nextState.status = 'river';
      nextState.lastAggressorUid = null;
      nextState.communityCards.push(nextState.deck.pop());
      dealtCardCount = 1;
      transitionMessage = '河牌：发出第五张公共牌';
      nextState.logs = addLog(nextState, `🃏 河牌: ${nextState.communityCards[4]}`);
    } else if (nextState.status === 'river') {
      nextState.status = 'showdown';
      nextState.transition = createGameTransition({
        type: 'showdown',
        fromStatus,
        toStatus: 'showdown',
        now: transitionNow,
        message: '进入摊牌与分池结算',
        totalPot: nextState.pot,
      });
      await advanceGameState(nextState); // 递归进入结算并返回
      return;
    }

    // 5. 决定是自动跑下一阶段还是等待玩家
    // 如果可行动人数 <= 1，且场上还有 2 个以上的人在竞争（说明有人全下了），自动跑牌
    const shouldAutoRun = shouldRevealAllInHands(nextState);
    if (shouldAutoRun) {
      nextState.allInRunout = true;
      nextState.players.forEach((player) => {
        if (!player.folded && player.hand?.length) {
          player.showCards = true;
        }
      });
    }
    if (activeContenders.length >= 2) {
      nextState.transition = createGameTransition({
        type: 'street',
        fromStatus,
        toStatus: nextState.status,
        now: transitionNow,
        message: transitionMessage,
        cardCount: dealtCardCount,
        totalPot: nextState.pot,
        autoAdvance: shouldAutoRun,
      });

      if (shouldAutoRun) {
        nextState.turnIndex = -1;
        await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), nextState);
        return;
      }

      // 正常多玩家对局：定位第一个行动者并停止函数，等待 Firebase 同步给前端
      let nextTurn = getNextActionIndex(nextState.players, nextState.dealerIndex);
      if (nextTurn === -1) {
        nextState.turnIndex = -1;
        nextState.transition.autoAdvance = true;
        await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), nextState);
        return;
      }
      nextState.turnIndex = nextTurn;
      await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), nextState);
    }
  };

  const handleAction = async (actionType, amount = 0) => {
    if (!roomData || roomData.isPaused || isTransitionActive(roomData.transition) || !isGameInProgress(roomData.status) || roomData.players[roomData.turnIndex]?.uid !== user.uid) return;
    let nextState = JSON.parse(JSON.stringify(roomData));
    nextState.transition = null;
    const meIndex = nextState.turnIndex;
    const me = nextState.players[meIndex];
    if (!me || me.folded || me.allIn || me.isSittingOut) return;
    const actionBettingOptions = getPlayerBettingOptions(nextState, me);
    const callAmount = actionBettingOptions.callAmount;
    Object.assign(me, stampPlayerPresence(me, Date.now()));

    if (actionType === 'fold') {
      me.folded = true; me.lastAction = 'fold';
      nextState.logs = addLog(nextState, `${me.name} 弃牌`);
    } 
    else if (actionType === 'call') {
      const actualCall = Math.min(callAmount, me.chips);
      me.chips -= actualCall; 
      me.bet += actualCall; 
      nextState.pot += actualCall;
      
      me.totalContribution = (me.totalContribution || 0) + actualCall; 
      
      if (me.chips === 0) me.allIn = true;
      me.lastAction = me.allIn ? 'allin' : (callAmount === 0 ? 'check' : 'call');
      const actName = callAmount === 0 ? '过牌' : '跟注';
      nextState.logs = addLog(nextState, `${me.name} ${actName} ${actualCall > 0 ? actualCall : ''}`);
    }
    else if (actionType === 'raise') {
      if (!actionBettingOptions.canRaise) return;
      const maxBet = actionBettingOptions.maxBet;
      const previousCurrentBet = nextState.currentBet;
      const minRaiseSize = actionBettingOptions.minRaiseSize;
      const minRaiseTarget = actionBettingOptions.minRaiseTarget;
      const requestedAmount = Number(amount);
      if (!Number.isFinite(requestedAmount)) return;
      const totalToBet = clampRaiseAmount(requestedAmount, minRaiseTarget, maxBet);
      if (totalToBet <= previousCurrentBet) return;
      if (totalToBet < minRaiseTarget && totalToBet !== maxBet) return;
      const additionalNeeded = totalToBet - me.bet;
      if (additionalNeeded <= 0) return;
      const actualPutIn = Math.min(additionalNeeded, me.chips);
      
      me.chips -= actualPutIn; 
      me.bet += actualPutIn; 
      nextState.pot += actualPutIn;
      
      me.totalContribution = (me.totalContribution || 0) + actualPutIn; 
      
      const raiseSize = me.bet - previousCurrentBet;
      nextState.currentBet = Math.max(nextState.currentBet, me.bet);
      if (me.chips === 0) me.allIn = true;
      const isFullRaise = raiseSize >= minRaiseSize;
      me.lastAction = me.allIn ? 'allin' : 'raise';

      if (isFullRaise) {
        nextState.minRaise = raiseSize;
        nextState.lastAggressorUid = me.uid;
        nextState.players.forEach((p, idx) => { if (idx !== meIndex && !p.folded && !p.allIn) p.hasActed = false; });
      }
      nextState.logs = addLog(nextState, `${me.name} ${isFullRaise ? '加注' : '全下'}到 ${me.bet}`);
    }

    me.hasActed = true;
    nextState.updatedAt = Date.now();
    await advanceGameState(nextState);
  };

  // ==== 房主处理掉线/挂机玩家的强制超时逻辑 (防卡死机制) ====
  const handleTimeoutForceAction = async () => {
    // 只有房主有权限当裁判，并且游戏必须在进行中
    if (!isReferee || !roomData || isTransitionActive(roomData.transition) || roomData.status === 'waiting' || roomData.status === 'showdown') return;
    
    let nextState = JSON.parse(JSON.stringify(roomData));
    nextState.transition = null;
    const targetIndex = nextState.turnIndex;
    const targetPlayer = nextState.players[targetIndex];
    
    // 如果目标玩家已经弃牌或全下，不需要操作
    if (!targetPlayer || targetPlayer.folded || targetPlayer.allIn) return;

    const reqCall = nextState.currentBet - targetPlayer.bet;
    
    if (reqCall === 0) {
      targetPlayer.lastAction = 'check';
      nextState.logs = addLog(nextState, `⏱️ ${targetPlayer.name} 超时/掉线，系统自动看牌`);
    } else {
      targetPlayer.folded = true;
      targetPlayer.lastAction = 'fold';
      nextState.logs = addLog(nextState, `⏱️ ${targetPlayer.name} 超时/掉线，系统自动弃牌`);
    }
    
    targetPlayer.hasActed = true;
    nextState.updatedAt = Date.now();
    await advanceGameState(nextState); // 推进游戏状态
  };

  const displayBlind = effectiveSettings.doubleBlinds
    ? getSmallBlindForHand(effectiveSettings, roomData.handCount || 1)
    : getSmallBlindForHand(effectiveSettings, 1);
  const transitionPhaseInfo = activeTransition ? getPhaseInfo(activeTransition.toStatus) : currentPhaseInfo;
  const transitionDetail = activeTransition?.message || currentPhaseInfo.detail;
  const newCommunityStartIndex = activeTransition?.type === 'street'
    ? getCommunityCountForStatus(activeTransition.fromStatus)
    : Number.POSITIVE_INFINITY;
  const displayPotAmount = roomData.status === 'showdown' && roomData.settlement?.totalPot
    ? roomData.settlement.totalPot
    : roomData.pot;
  const settlementPots = roomData.settlement?.pots || [];
  const showSettlementPanel = roomData.status === 'showdown' && settlementPots.length > 0 && showdownFinished;

  const statusClass = getStatusClass(roomData?.status);

  return (
    <div className={`poker-game-shell ${statusClass} ${showActionDock ? 'poker-has-action' : ''} ${isMobileRaiseOpen ? 'poker-mobile-raise-open' : ''} h-[100dvh] bg-slate-900 text-slate-200 font-sans flex flex-col relative overflow-hidden`}>
      
      {/* 顶部导航 */}
      <PokerHeader
        roomId={roomId}
        roomData={roomData}
        copySuccess={copySuccess}
        displayBlind={displayBlind}
        effectiveSettings={effectiveSettings}
        transitionPhaseInfo={transitionPhaseInfo}
        activeTransition={activeTransition}
        isHost={isHost}
        onCopyRoomId={() => {
          navigator.clipboard.writeText(roomId);
          setCopySuccess(true);
          setTimeout(() => setCopySuccess(false), 2000);
        }}
        onTogglePause={handleTogglePause}
        onOpenSettings={() => {
          setLocalSettings(roomData.settings);
          setShowSettingsModal(true);
        }}
        onLeave={handleLeave}
      />

      {isHost && <JoinRequestsBar requests={roomData.joinRequests} onApproveJoin={handleApproveJoin} />}

      <div className="poker-main-area flex-1 flex flex-col md:flex-row overflow-hidden relative">
        <div className="poker-table-area flex-1 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-800 to-slate-900 flex flex-col relative overflow-hidden">
          
          {roomData.isPaused && <div className="absolute inset-0 bg-black/40 z-10 flex items-center justify-center backdrop-blur-sm pointer-events-none"><h1 className="text-5xl font-black text-white tracking-widest drop-shadow-lg">对局已暂停</h1></div>}

          {activeTransition && (
            <TransitionBanner
              phaseInfo={transitionPhaseInfo}
              detail={transitionDetail}
              progress={transitionProgress}
            />
          )}

          {!isLogOpen && (
            <button 
              onClick={() => setIsLogOpen(true)}
              className="poker-log-button absolute right-4 top-4 bg-slate-800/80 backdrop-blur border border-slate-600 p-2 md:px-4 md:py-2 rounded-full shadow-lg z-30 flex items-center gap-2 text-slate-300 hover:text-white hover:border-emerald-400 transition"
            >
              <Users size={18} className="text-emerald-400"/>
              <span className="hidden md:inline font-bold text-sm">对局动态</span>
            </button>
          )}

          {/* 顶部: 对手与桌面 (可滚动区域) */}
          <div className="poker-table-scroll flex-1 overflow-y-auto flex flex-col p-4">
            {/* 对手头像 */}
            <div className="poker-opponents-row flex justify-center gap-4 md:gap-8 flex-wrap z-0 flex-shrink-0">
              {roomData.players.map((p, idx) => {
                if (p.uid === user.uid) return null;
                const isTurn = roomData.status !== 'waiting' && roomData.status !== 'showdown' && roomData.turnIndex === idx && !roomData.isPaused && !isActionLocked;
                const isDealer = roomData.dealerIndex === idx;
                const isAllInRunoutRevealed = roomData.status !== 'waiting' && roomData.status !== 'showdown' && roomData.allInRunout && p.showCards && !p.folded;
                const isRevealed = isAllInRunoutRevealed || (roomData.status === 'showdown' && p.showCards && (showdownFinished || p.showSequence <= currentShowIndex));
                const isWinnerGlow = roomData.status === 'showdown' && showdownFinished && p.winAmount > 0;

                return (
                  <OpponentCard
                    key={p.uid}
                    player={p}
                    roomData={roomData}
                    isHost={isHost}
                    isTurn={isTurn}
                    isDealer={isDealer}
                    isRevealed={isRevealed}
                    isWinnerGlow={isWinnerGlow}
                    timeLeft={timeLeft}
                    effectiveSettings={effectiveSettings}
                    activeHighlights={activeHighlights}
                    onManagePlayer={(player) => {
                      setSelectedPlayer(player);
                      setTopUpAmount(player.chips);
                    }}
                  />
                );
              })}
            </div>

            <TableCenter
              roomData={roomData}
              activeTransition={activeTransition}
              activeHighlights={activeHighlights}
              activeSeatedPlayers={activeSeatedPlayers}
              canStartGame={canStartGame}
              currentActionName={currentActionName}
              displayPotAmount={displayPotAmount}
              isTimerCritical={isTimerCritical}
              newCommunityStartIndex={newCommunityStartIndex}
              settlementPots={settlementPots}
              showCurrentActionClock={showCurrentActionClock}
              showSettlementPanel={showSettlementPanel}
              timeLeft={timeLeft}
              transitionPhaseInfo={transitionPhaseInfo}
              onStartGame={startGame}
            />
          </div>

          {myPlayerInfo ? (
            <SelfPlayerPanel
              actionDockProps={{
                actionStatusDetail,
                actionStatusLabel,
                callAmount,
                canPotentiallyRaise,
                canRaiseNow,
                canTakeAction,
                currentBet: roomData.currentBet,
                isMobileRaiseOpen,
                isTimerCritical,
                maxBet,
                minRaiseTarget,
                pot: roomData.pot,
                fullPotSliderPosition: fullPotSliderMark.position,
                potRaiseTarget,
                raiseIncrementInput,
                raiseInput,
                raiseSliderInput,
                showFullPotPreset,
                showFullPotSliderMark: fullPotSliderMark.visible,
                minRaiseIncrement: raiseIncrementBounds.min,
                maxRaiseIncrement: raiseIncrementBounds.max,
                onAction: handleAction,
                onRaiseIncrementChange: setRaiseIncrementAmount,
                onRaiseAmountChange: setRaiseAmount,
                onToggleMobileRaise: () => setShowMobileRaisePanel((value) => !value),
                calcPotRaise,
              }}
              activeHighlights={activeHighlights}
              isDealer={roomData.dealerIndex === roomData.players.findIndex((p) => p.uid === user.uid)}
              isHost={isHost}
              isMyTurn={isMyTurn}
              myCurrentHandInfo={myCurrentHandInfo}
              myIsAllInRunoutRevealed={myIsAllInRunoutRevealed}
              myIsShowdownRevealed={myIsShowdownRevealed}
              myIsWinnerGlow={myIsWinnerGlow}
              myPlayerInfo={myPlayerInfo}
              roomData={roomData}
              showMobileRaisePanel={showMobileRaisePanel}
              onManageSelf={() => {
                setSelectedPlayer(myPlayerInfo);
                setTopUpAmount(myPlayerInfo.chips);
              }}
              onToggleSit={handleToggleSit}
            />
          ) : (
            <div className="bg-slate-800 p-6 flex justify-center items-center shadow-2xl border-t border-slate-700 text-slate-400">
              {isPendingApproval ? <span className="flex items-center gap-2"><ShieldAlert size={18} className="text-amber-500" /> 等待房主审核加入...</span> : "观战中..."}
            </div>
          )}
        
        </div>

        {/* ==== 修改：侧滑出式“对局动态”抽屉 ==== */}
        <GameLogDrawer
          logs={roomData.logs}
          isOpen={isLogOpen}
          logsEndRef={logsEndRef}
          onClose={() => setIsLogOpen(false)}
        />

      </div>

      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-md border border-slate-600 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-4 border-b border-slate-700 bg-slate-900/50">
              <h2 className="text-xl font-bold flex items-center gap-2 text-white"><Settings size={20} className="text-emerald-400"/> 房间设置 {!isHost && <span className="text-xs font-normal text-slate-400 ml-2 border border-slate-600 px-2 py-0.5 rounded">(仅供查看)</span>}</h2>
              <button onClick={() => setShowSettingsModal(false)} className="text-slate-400 hover:text-rose-400 transition"><X size={24}/></button>
            </div>
            <div className="p-6 space-y-6 overflow-y-auto">
              <div>
                <div className="text-slate-300 font-medium mb-2">初始筹码</div>
                <div className="flex gap-2 mb-2">
                  {[500, 1000, 2000].map(val => ( <button key={val} disabled={!isHost} onClick={() => setLocalSettings(normalizeGameSettings({...localSettings, initialChips: val}))} className={`flex-1 py-2 rounded font-bold border transition ${localSettings.initialChips === val ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg' : 'bg-slate-900 border-slate-700 text-slate-400'} ${!isHost && 'opacity-60 cursor-not-allowed'}`}>{val}</button> ))}
                </div>
                <input type="number" min={MIN_INITIAL_CHIPS} max={MAX_INITIAL_CHIPS} step={CHIP_UNIT} disabled={!isHost} value={localSettings.initialChips} onChange={e => setLocalSettings(normalizeGameSettings({...localSettings, initialChips: e.target.value}))} className={`w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white outline-none ${!isHost && 'opacity-60 cursor-not-allowed'}`} placeholder="自定义筹码" />
              </div>
              <div>
                <div className="text-slate-300 font-medium mb-2">每步思考时长</div>
                <div className="flex gap-2 mb-2">
                  {[10, 30, '无限'].map(val => ( <button key={val} disabled={!isHost} onClick={() => setLocalSettings(normalizeGameSettings({...localSettings, timeLimit: val}))} className={`flex-1 py-2 rounded font-bold border transition ${localSettings.timeLimit === val ? 'bg-blue-600 text-white border-blue-500 shadow-lg' : 'bg-slate-900 border-slate-700 text-slate-400'} ${!isHost && 'opacity-60 cursor-not-allowed'}`}>{val === '无限' ? val : `${val}s`}</button> ))}
                </div>
                {typeof localSettings.timeLimit === 'number' && ( <input type="number" min={MIN_TIME_LIMIT} max={MAX_TIME_LIMIT} disabled={!isHost} value={localSettings.timeLimit} onChange={e => setLocalSettings(normalizeGameSettings({...localSettings, timeLimit: e.target.value}))} className={`w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white outline-none ${!isHost && 'opacity-60 cursor-not-allowed'}`} placeholder="自定义秒数" /> )}
              </div>
              <div className="space-y-4 pt-6 border-t border-slate-700">
                <label className={`flex items-center justify-between text-slate-300 ${isHost ? 'cursor-pointer group' : 'opacity-60'}`}><span>允许对局中途添加他人 (下局进入)</span><input type="checkbox" disabled={!isHost} checked={localSettings.allowJoinDuringGame} onChange={e => setLocalSettings({...localSettings, allowJoinDuringGame: e.target.checked})} className="w-5 h-5 accent-emerald-500" /></label>
                <label className={`flex items-center justify-between text-slate-300 ${isHost ? 'cursor-pointer group' : 'opacity-60'}`}><span>盲注每5局自动翻倍</span><input type="checkbox" disabled={!isHost} checked={localSettings.doubleBlinds} onChange={e => setLocalSettings({...localSettings, doubleBlinds: e.target.checked})} className="w-5 h-5 accent-emerald-500" /></label>
                <label className={`flex items-center justify-between text-slate-300 ${isHost ? 'cursor-pointer group' : 'opacity-60'}`}><span>自动补码 (输光补初始筹码的一半)</span><input type="checkbox" disabled={!isHost} checked={localSettings.autoTopUp} onChange={e => setLocalSettings({...localSettings, autoTopUp: e.target.checked})} className="w-5 h-5 accent-emerald-500" /></label>
              </div>
            </div>
            {isHost && (
              <div className="p-4 border-t border-slate-700 bg-slate-900/50 flex flex-col gap-3">
                <button onClick={handleSaveSettings} className="w-full bg-emerald-600 hover:bg-emerald-500 transition rounded-xl font-bold py-3 shadow-lg text-white">
                  保存设置并应用至下局
                </button>
                
                {/* 判定为私密房间时，额外显示高权限管理按钮 */}
                {roomData.isPublic === false && (
                  <>
                    <button onClick={handleResetGame} className="w-full bg-amber-600 hover:bg-amber-500 transition rounded-xl font-bold py-3 shadow-lg text-white">
                      保存设置并重置对局
                    </button>
                    <button onClick={handleDestroyRoom} className="w-full bg-rose-700 hover:bg-rose-600 transition rounded-xl font-bold py-3 shadow-lg text-white">
                      解散房间
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 弹窗：房主管理单一玩家 */}
      {selectedPlayer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-sm border border-slate-600 overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-slate-700 bg-slate-900/50">
              <h2 className="text-lg font-bold text-white flex items-center gap-2"><Crown size={18} className="text-amber-400"/> 管理玩家: {selectedPlayer.name}</h2>
              <button onClick={() => setSelectedPlayer(null)} className="text-slate-400 hover:text-rose-400 transition"><X size={20}/></button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm text-slate-400 mb-2">设定该玩家筹码</label>
                <div className="flex gap-2">
                  <input type="number" min="0" step={CHIP_UNIT} value={topUpAmount} onChange={e => setTopUpAmount(quantizeChipAmount(e.target.value))} className="w-full bg-slate-900 border border-slate-600 rounded-lg p-2 text-white outline-none focus:border-emerald-500 font-mono" />
                  {/* 修改为 setChips */}
                  <button onClick={() => handlePlayerActionMenu('setChips')} className="px-5 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold text-sm whitespace-nowrap shadow">确认修改</button>
                </div>
              </div>
              
              {/* 新增逻辑：如果选中的是自己，则不显示转让和踢出按钮 */}
              {selectedPlayer.uid !== user.uid && (
                <div className="border-t border-slate-700 pt-6 flex gap-3">
                  <button onClick={() => handlePlayerActionMenu('transfer')} className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold text-sm transition shadow">转让房主</button>
                  <button onClick={() => handlePlayerActionMenu('kick')} className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 rounded-lg font-bold text-sm transition shadow">踢出房间</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
