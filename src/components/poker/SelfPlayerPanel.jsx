import { Coins, Crown, Settings, UserCheck, UserMinus } from 'lucide-react';
import CardUI from '../CardUI';
import { getActionColor, getActionLabel, getDisplayAction, shouldShowActionBubble } from '../../utils/pokerUi';
import ActionDock from './ActionDock';

export default function SelfPlayerPanel({
  actionDockProps,
  activeHighlights,
  isDealer,
  isHost,
  isMyTurn,
  myCurrentHandInfo,
  myIsAllInRunoutRevealed,
  myIsShowdownRevealed,
  myIsWinnerGlow,
  myPlayerInfo,
  roomData,
  showMobileRaisePanel,
  onManageSelf,
  onToggleSit,
}) {
  const showActionBubble = shouldShowActionBubble(myPlayerInfo, roomData.status);
  const displayAction = getDisplayAction(myPlayerInfo);
  const actionBubbleLabel = getActionLabel(displayAction, myPlayerInfo.bet);
  const hasChipAmount = Number(myPlayerInfo.bet || 0) > 0;

  return (
    <div className={`poker-self-panel ${showMobileRaisePanel ? 'poker-raise-open' : ''} flex-none relative bg-slate-800 rounded-t-2xl border-t-4 p-4 md:p-6 flex flex-col md:flex-row items-center gap-6 z-0 transition-colors duration-300
      ${myIsWinnerGlow ? 'border-amber-400 shadow-[0_-10px_35px_rgba(251,191,36,0.5)] bg-slate-800/90' : (isMyTurn ? 'border-amber-400 shadow-[0_-10px_25px_rgba(0,0,0,0.3)]' : 'border-slate-700 shadow-[0_-10px_25px_rgba(0,0,0,0.3)]')}
      ${myPlayerInfo.isSittingOut ? 'opacity-70' : ''}`}
    >
      {isHost && <div className="absolute -top-4 left-6 bg-slate-900 rounded-full p-1.5 border border-slate-700 z-10"><Crown size={20} className="text-amber-400" /></div>}
      {isDealer && <div className="absolute -top-3 left-16 bg-white text-black text-[12px] w-6 h-6 rounded-full flex items-center justify-center font-black shadow-lg border-2 border-slate-900 z-10">D</div>}

      <div className="poker-self-summary flex items-center gap-6 min-w-max pt-2">
        <div className="poker-self-cards flex gap-2 relative">
          {myPlayerInfo.hand && myPlayerInfo.hand.length > 0
            ? myPlayerInfo.hand.map((card, index) => <CardUI key={index} card={card} highlight={activeHighlights?.includes(card)} className="poker-card-mobile" />)
            : <><CardUI className="poker-card-mobile" /><CardUI className="poker-card-mobile" /></>}

          {showActionBubble && (
            <div key={`${myPlayerInfo.uid}-${myPlayerInfo.bet}-${displayAction}`} className={`poker-action-bubble poker-self-bet absolute -top-16 left-1/2 transform -translate-x-1/2 font-black px-5 py-2 rounded-full shadow-[0_5px_15px_rgba(0,0,0,0.5)] border-2 z-40 text-base flex items-center gap-1 transition-all chip-pop ${getActionColor(displayAction)}`}>
              {hasChipAmount && <Coins size={18} />} {actionBubbleLabel}
            </div>
          )}

          {myIsWinnerGlow && (
            <div className="absolute -top-16 left-1/2 transform -translate-x-1/2 font-black px-5 py-2 rounded-full shadow-[0_5px_25px_rgba(251,191,36,0.8)] border-2 border-amber-300 bg-amber-500 text-white z-50 text-xl flex items-center gap-1 transition-all scale-110">
              <Coins size={20} /> +{myPlayerInfo.winAmount}
            </div>
          )}

          {myPlayerInfo.hand && myPlayerInfo.hand.length > 0 && !myPlayerInfo.folded && myCurrentHandInfo?.rankName && (
            <div className="absolute -bottom-3 w-full text-center bg-indigo-900 text-white text-sm py-0.5 rounded-full shadow border border-indigo-400 z-20 font-bold">
              {roomData.status === 'showdown' ? myPlayerInfo.rankName : myCurrentHandInfo.rankName}
            </div>
          )}

          {(myIsAllInRunoutRevealed || myIsShowdownRevealed) && (
            <div className="absolute -top-4 -right-4 bg-emerald-500 text-white text-xs font-black px-2 py-1 rounded-md shadow-lg border border-emerald-300 transform rotate-12 z-30">
              已亮牌
            </div>
          )}
        </div>

        <div className="poker-self-meta flex flex-col">
          <div className="flex items-center gap-2">
            <span className="poker-self-name font-bold text-xl text-white">
              {myPlayerInfo.name}
              {myPlayerInfo.waitingNextHand && <span className="text-amber-300 text-sm"> (下局加入)</span>}
              {myPlayerInfo.folded && !myPlayerInfo.waitingNextHand && <span className="text-rose-400 text-sm"> (已弃牌)</span>}
            </span>
            {isHost && (
              <button
                onClick={onManageSelf}
                className="text-slate-400 hover:text-amber-400 transition"
                title="修改自己的筹码"
              >
                <Settings size={18} />
              </button>
            )}
          </div>
          <span className="text-emerald-400 font-mono text-xl mt-1">💰 {myPlayerInfo.chips}</span>
          <button onClick={onToggleSit} className="mt-2 flex items-center gap-1 text-xs bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded text-slate-300 w-fit transition">
            {myPlayerInfo.isSittingOut ? <><UserCheck size={14} /> 坐下参与</> : <><UserMinus size={14} /> 站起观战</>}
          </button>
        </div>
      </div>

      <ActionDock {...actionDockProps} />
    </div>
  );
}
