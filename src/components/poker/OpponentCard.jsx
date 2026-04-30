import { Bot, Coins, Crown } from 'lucide-react';
import CardUI from '../CardUI';
import { getActionColor, getActionLabel, getDisplayAction, shouldShowActionBubble } from '../../utils/pokerUi';

const TIMER_RING_MAX_ARC = 94;

export default function OpponentCard({
  player,
  roomData,
  isHost,
  isTurn,
  isDealer,
  isRevealed,
  isWinnerGlow,
  timeLeft,
  timerProgress = 0,
  effectiveSettings,
  activeHighlights,
  onManagePlayer,
}) {
  const showActionBubble = shouldShowActionBubble(player, roomData.status);
  const displayAction = getDisplayAction(player);
  const actionBubbleLabel = getActionLabel(displayAction, player.bet);
  const hasChipAmount = Number(player.bet || 0) > 0;
  const timerFill = Math.min(100, Math.max(0, Number(timerProgress) || 0));
  const timerArc = (timerFill / 100) * TIMER_RING_MAX_ARC;
  const timerGap = 100 - timerArc;
  const hasFiniteTimer = Number.isFinite(Number(effectiveSettings.timeLimit));
  const showTurnTimer = isTurn && timeLeft > 0 && timerFill > 0 && hasFiniteTimer;

  return (
    <div
      onClick={() => {
        if (isHost) onManagePlayer(player);
      }}
      className={`poker-opponent-card relative bg-slate-800/80 backdrop-blur rounded-xl p-3 border-2 w-32 md:w-40 flex flex-col items-center shadow-xl transition-all duration-500
        ${isHost ? 'cursor-pointer hover:border-blue-400' : ''}
        ${isWinnerGlow ? 'border-amber-400 shadow-[0_0_25px_rgba(251,191,36,0.8)] scale-105 z-20' : (isTurn ? 'border-amber-400 shadow-amber-400/20' : 'border-slate-600')}
        ${player.folded ? 'opacity-50' : ''}`}
    >
      {roomData.hostUid === player.uid && <div className="absolute -top-3 left-2 bg-slate-900 rounded-full p-1 border border-slate-700 z-10"><Crown size={16} className="text-amber-400" /></div>}
      {player.isAi && <div className="absolute -top-3 left-2 bg-slate-900 rounded-full p-1 border border-emerald-700 z-10"><Bot size={16} className="text-emerald-300" /></div>}
      {isDealer && <div className="absolute -top-3 right-2 bg-white text-black text-[12px] w-6 h-6 rounded-full flex items-center justify-center font-black shadow-lg border-2 border-slate-900 z-10">D</div>}
      {showTurnTimer && (
        <div
          className={`poker-opponent-timer-ring ${timeLeft <= 10 ? 'is-critical' : ''}`}
          aria-label="turn timer"
        >
          <svg className="poker-opponent-timer-svg" viewBox="0 0 36 36" aria-hidden="true">
            <circle className="poker-opponent-timer-track" cx="18" cy="18" r="15.5" pathLength="100" />
            <circle
              className="poker-opponent-timer-progress"
              cx="18"
              cy="18"
              r="15.5"
              pathLength="100"
              style={{
                strokeDasharray: `${timerArc} ${timerGap}`,
                strokeDashoffset: `${timerArc}`,
              }}
            />
          </svg>
        </div>
      )}

      {showActionBubble && (
        <div key={`${player.uid}-${player.bet}-${displayAction}`} className={`poker-action-bubble poker-opponent-bet absolute -bottom-12 left-1/2 transform -translate-x-1/2 font-black px-4 py-1.5 rounded-full shadow-[0_5px_15px_rgba(0,0,0,0.5)] border-2 z-40 text-sm flex items-center gap-1 transition-all chip-pop ${getActionColor(displayAction)}`}>
          {hasChipAmount && <Coins size={14} />} {actionBubbleLabel}
        </div>
      )}

      {isWinnerGlow && (
        <div className="poker-opponent-win absolute -bottom-12 left-1/2 transform -translate-x-1/2 font-black px-4 py-1.5 rounded-full shadow-[0_5px_15px_rgba(251,191,36,0.6)] border-2 border-amber-300 bg-amber-500 text-white z-50 text-sm flex items-center gap-1 transition-all scale-110">
          <Coins size={14} /> +{player.winAmount}
        </div>
      )}

      <div className="poker-player-name font-bold truncate w-full text-center relative pt-1 text-slate-200">{player.name} {player.isAi ? '(AI)' : ''} {player.waitingNextHand ? '(下局加入)' : (player.isSittingOut && '(观战)')}</div>
      <div className="poker-player-chips text-emerald-400 text-sm mt-1 font-mono">💰 {player.chips}</div>

      <div className="flex gap-1 mt-3 mb-1 relative">
        {player.hand && player.hand.length > 0 ? (
          isRevealed
            ? player.hand.map((card, index) => <CardUI key={index} card={card} highlight={activeHighlights?.includes(card)} className="poker-card-mobile" />)
            : <><CardUI hidden className="poker-card-mobile" /><CardUI hidden className="poker-card-mobile" /></>
        ) : <div className="h-16 text-xs text-slate-500 flex items-center">等待发牌</div>}

        {isRevealed && player.rankName && (
          <div className="absolute -bottom-3 w-full text-center bg-indigo-900 text-white text-xs py-0.5 rounded-full shadow border border-indigo-400 z-20 animate-bounce">
            {player.rankName}
          </div>
        )}
      </div>
    </div>
  );
}
