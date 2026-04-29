import { CheckCircle2, Coins, Timer, X } from 'lucide-react';
import { CHIP_UNIT } from '../../utils/chipMath';
import { getNonlinearRaiseAmount } from '../../utils/gameFlow';

export default function ActionDock({
  actionStatusDetail,
  actionStatusLabel,
  callAmount,
  canPotentiallyRaise,
  canRaiseNow,
  canTakeAction,
  currentBet,
  isMobileRaiseOpen,
  isTimerCritical,
  maxBet,
  minRaiseTarget,
  pot,
  potRaiseTarget,
  raiseInput,
  raiseSliderInput,
  onAction,
  onRaiseAmountChange,
  onRaiseSliderChange,
  onToggleMobileRaise,
  calcPotRaise,
}) {
  return (
    <div className={`poker-action-controls ${canTakeAction ? 'is-live' : 'is-disabled'} flex-1 flex flex-col gap-3 w-full ml-auto`}>
      <div className="poker-action-status flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="poker-action-status-label truncate font-black text-white">{actionStatusLabel}</div>
          <div className="poker-action-status-sub text-slate-400 text-xs">底池 {pot || 0} · 当前注 {currentBet || 0}</div>
        </div>
        <div className={`poker-action-status-timer ${canTakeAction && isTimerCritical ? 'is-critical' : ''} flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-sm ${canTakeAction ? 'text-amber-300 bg-amber-950/50 border border-amber-500/30' : 'text-slate-400 bg-slate-800 border border-slate-700'}`}>
          <Timer size={14} /> {actionStatusDetail}
        </div>
      </div>

      <div className="poker-main-actions flex gap-3 justify-end">
        <button disabled={!canTakeAction} onClick={() => onAction('fold')} className="poker-fold-button px-8 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold transition shadow flex items-center justify-center gap-2">
          <X size={17} /> 弃牌
        </button>
        <button disabled={!canTakeAction} onClick={() => onAction('call')} className="poker-call-button px-10 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold transition shadow-lg text-lg flex items-center justify-center gap-2">
          <CheckCircle2 size={17} /> {callAmount === 0 ? '过牌' : `跟注 ${callAmount}`}
        </button>
        <button disabled={!canRaiseNow} onClick={onToggleMobileRaise} className="poker-mobile-raise-toggle hidden bg-amber-500 hover:bg-amber-400 text-amber-950 rounded-xl font-bold transition shadow-lg items-center justify-center gap-2">
          <Coins size={17} /> 加注
        </button>
      </div>

      {canPotentiallyRaise && canRaiseNow && (
        <div className={`poker-raise-panel bg-slate-900/80 p-4 rounded-xl border border-slate-700 flex-col gap-3 shadow-inner ${isMobileRaiseOpen ? 'flex' : 'hidden md:flex'}`}>
          <div className="poker-raise-presets flex gap-2 justify-between">
            <button disabled={!canRaiseNow} onClick={() => onRaiseAmountChange(calcPotRaise(1 / 3))} className="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-bold transition">1/3池</button>
            <button disabled={!canRaiseNow} onClick={() => onRaiseAmountChange(calcPotRaise(2 / 3))} className="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-bold transition">2/3池</button>
            <button disabled={!canRaiseNow} onClick={() => onRaiseAmountChange(calcPotRaise(1))} className="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-bold transition">满池</button>
            <button disabled={!canRaiseNow} onClick={() => onRaiseAmountChange(maxBet)} className="flex-1 py-1.5 bg-rose-900/60 hover:bg-rose-800/80 text-rose-200 border border-rose-800 rounded-lg text-sm font-bold transition">All-In</button>
          </div>

          <div className="poker-raise-controls flex items-center gap-3">
            <div className="poker-raise-slider-wrap flex-1">
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={raiseSliderInput}
                disabled={!canRaiseNow}
                onChange={(event) => {
                  const nextSlider = Number(event.target.value);
                  onRaiseSliderChange(nextSlider);
                  onRaiseAmountChange(getNonlinearRaiseAmount({
                    sliderValue: nextSlider,
                    minAmount: minRaiseTarget,
                    potAmount: potRaiseTarget,
                    maxAmount: maxBet,
                  }), { syncSlider: false });
                }}
                className="w-full accent-rose-500 cursor-pointer"
              />
              <div className="poker-slider-scale flex justify-between text-[11px] text-slate-500">
                <span>精细</span>
                <span>底池</span>
                <span>全下</span>
              </div>
            </div>
            <input
              type="number"
              min={minRaiseTarget}
              max={maxBet}
              step={CHIP_UNIT}
              value={raiseInput}
              disabled={!canRaiseNow}
              onChange={(event) => onRaiseAmountChange(event.target.value)}
              className="w-24 bg-slate-800 border border-slate-600 rounded-lg px-2 py-2 text-center font-mono outline-none focus:border-rose-500 text-white"
            />
            <button onClick={() => onAction('raise', raiseInput)} disabled={!canRaiseNow || (raiseInput < minRaiseTarget && raiseInput !== maxBet)} className="px-8 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 text-amber-950 disabled:text-slate-500 rounded-lg font-bold transition whitespace-nowrap shadow-lg flex items-center justify-center gap-2">
              <Coins size={17} /> 确认
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
