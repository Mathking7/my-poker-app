import { Coins, Timer } from 'lucide-react';
import CardUI from '../CardUI';

export default function TableCenter({
  roomData,
  activeTransition,
  activeHighlights,
  activeSeatedPlayers,
  canStartGame,
  currentActionName,
  displayPotAmount,
  isTimerCritical,
  newCommunityStartIndex,
  settlementPots,
  showCurrentActionClock,
  showSettlementPanel,
  timeLeft,
  transitionPhaseInfo,
  onStartGame,
}) {
  return (
    <div className="poker-board-center flex-1 flex flex-col items-center justify-center py-8 z-0 min-h-[200px]">
      {roomData.status === 'waiting' ? (
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4 text-slate-300">等待玩家就绪... ({activeSeatedPlayers.length}/9)</h2>
          {canStartGame ? (
            <button onClick={onStartGame} className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold py-3 px-10 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.5)] transition transform hover:scale-105">开始首局游戏</button>
          ) : (
            <div className="text-slate-400 animate-pulse bg-slate-800/50 px-6 py-2 rounded-full">等待房主或创建者开局...</div>
          )}
        </div>
      ) : (
        <div className={`poker-phase-pot-stack ${activeTransition ? 'is-transitioning' : ''} text-center`}>
          <div className="poker-table-info-row">
            <div className="poker-phase-pill inline-flex items-center gap-2 rounded-full border border-slate-600/70 bg-slate-950/55 px-4 py-1.5 text-sm shadow-lg">
              <span className="poker-phase-caption text-slate-400">轮次</span>
              <span className="poker-phase-name font-black text-emerald-300">
                <span className="poker-phase-full">{transitionPhaseInfo.label}</span>
                <span className="poker-phase-short">{transitionPhaseInfo.shortLabel}</span>
              </span>
              {activeTransition && <span className="poker-phase-dot" aria-hidden="true" />}
            </div>
            <div className="poker-pot-pill bg-slate-900/80 backdrop-blur px-8 py-3 rounded-full border border-emerald-500/30 inline-flex flex-col items-center shadow-xl">
              <span className="text-slate-400 text-xs mb-1">{roomData.status === 'showdown' ? '本局奖池' : '当前底池'}</span>
              <span key={displayPotAmount} className="poker-pot-amount text-4xl font-black text-amber-400 flex items-center gap-2 pot-pulse"><Coins size={28} /> {displayPotAmount}</span>
            </div>
            {showCurrentActionClock && (
              <div className={`poker-table-clock ${isTimerCritical ? 'is-critical' : ''} inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-bold shadow-lg`}>
                <span className="flex items-center gap-1.5 text-slate-200"><Timer size={16} /> {currentActionName}行动中</span>
                <span className="poker-table-clock-time font-mono text-amber-300">{timeLeft}s</span>
              </div>
            )}
          </div>
          <div className="poker-community-cards flex justify-center gap-2 md:gap-4 h-24">
            {[0, 1, 2, 3, 4].map((index) => {
              const isNewCard = Boolean(activeTransition?.type === 'street' && index >= newCommunityStartIndex && index < roomData.communityCards.length);
              const dealDelay = isNewCard ? (index - newCommunityStartIndex) * 180 : 0;
              return (
                <CardUI
                  key={`${roomData.handCount || 0}-${index}-${roomData.communityCards[index] || 'empty'}`}
                  card={roomData.communityCards[index]}
                  highlight={activeHighlights.includes(roomData.communityCards[index])}
                  className={`poker-card-mobile ${isNewCard ? 'card-deal-in' : ''}`}
                  style={isNewCard ? { animationDelay: `${dealDelay}ms` } : undefined}
                />
              );
            })}
          </div>
          {showSettlementPanel && (
            <div className="mt-5 mx-auto w-[min(92vw,520px)] space-y-2">
              {settlementPots.map((pot, index) => (
                <div key={`${roomData.settlement.id}-${pot.id}`} className="settlement-rise flex items-center justify-between gap-3 rounded-lg border border-amber-400/35 bg-slate-950/70 px-4 py-2 text-sm shadow-lg" style={{ animationDelay: `${index * 180}ms` }}>
                  <div className="text-left">
                    <div className="font-black text-amber-300">{pot.label} · {pot.amount}</div>
                    <div className="text-slate-300">{pot.winners.map((winner) => `${winner.name} +${winner.amount}`).join('，')}</div>
                  </div>
                  <Coins size={20} className="text-amber-300 flex-none" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
