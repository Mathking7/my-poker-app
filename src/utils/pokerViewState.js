import { getPhaseInfo } from './gameFlow.js';
import { isGameInProgress } from './roomMaintenance.js';

export const canPlayerTakeAction = ({ isMyTurn, myPlayerInfo, status }) => Boolean(
  isMyTurn &&
  myPlayerInfo &&
  !myPlayerInfo.folded &&
  !myPlayerInfo.allIn &&
  !myPlayerInfo.isSittingOut &&
  isGameInProgress(status)
);

export const canPlayerPotentiallyRaise = ({ myPlayerInfo, status, bettingOptions }) => Boolean(
  myPlayerInfo &&
  isGameInProgress(status) &&
  bettingOptions.canRaise
);

export const getActionViewState = ({
  activeTransition,
  callAmount,
  canTakeAction,
  currentActionPlayer,
  currentPhaseInfo,
  effectiveSettings,
  myPlayerInfo,
  roomData,
  timeLeft,
  userUid,
}) => {
  const showCurrentActionClock = Boolean(
    isGameInProgress(roomData?.status) &&
    !roomData?.isPaused &&
    !activeTransition &&
    currentActionPlayer &&
    effectiveSettings.timeLimit !== '无限' &&
    timeLeft > 0
  );
  const currentActionName = currentActionPlayer?.uid === userUid ? '你' : currentActionPlayer?.name;
  const isTimerCritical = showCurrentActionClock && timeLeft <= 10;

  const actionStatusLabel = (() => {
    if (!myPlayerInfo) return '观战中';
    if (roomData?.isPaused) return '对局已暂停';
    if (activeTransition) return `过场：${getPhaseInfo(activeTransition.toStatus).label}`;
    if (roomData?.status === 'waiting') return '等待开局';
    if (roomData?.status === 'showdown') return '摊牌结算中';
    if (myPlayerInfo.isSittingOut) return '你正在观战';
    if (myPlayerInfo.waitingNextHand) return '下局入座';
    if (myPlayerInfo.folded) return '你已弃牌';
    if (myPlayerInfo.allIn) return '你已全下';
    if (canTakeAction) return '轮到你行动';
    return `等待 ${currentActionPlayer?.name || '其他玩家'}`;
  })();

  const actionStatusDetail = (() => {
    if (canTakeAction && timeLeft > 0 && effectiveSettings.timeLimit !== '无限') return `${timeLeft}s`;
    if (!canTakeAction) {
      if (activeTransition) return '过场中';
      if (roomData?.isPaused) return '暂停';
      if (roomData?.status === 'waiting') return '等待';
      if (roomData?.status === 'showdown') return '结算';
      if (myPlayerInfo?.folded || myPlayerInfo?.allIn) return '本手结束';
      return '等待中';
    }
    if (callAmount > 0 && isGameInProgress(roomData?.status)) return `需跟注 ${callAmount}`;
    if (isGameInProgress(roomData?.status)) return '可过牌';
    return activeTransition ? getPhaseInfo(activeTransition.toStatus).shortLabel : currentPhaseInfo.shortLabel;
  })();

  return {
    actionStatusDetail,
    actionStatusLabel,
    currentActionName,
    isTimerCritical,
    showCurrentActionClock,
  };
};
