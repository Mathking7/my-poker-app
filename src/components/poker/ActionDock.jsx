import { useRef, useState } from 'react';
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
  fullPotSliderPosition,
  isMobileRaiseOpen,
  isTimerCritical,
  timerProgress = 0,
  maxBet,
  minRaiseTarget,
  pot,
  potRaiseTarget,
  raiseIncrementInput,
  raiseInput,
  raiseSliderInput,
  showFullPotPreset,
  showFullPotSliderMark,
  minRaiseIncrement,
  maxRaiseIncrement,
  onAction,
  onRaiseIncrementChange,
  onRaiseAmountChange,
  onToggleMobileRaise,
  calcPotRaise,
}) {
  const [isDraggingRaise, setIsDraggingRaise] = useState(false);
  const raiseSliderRef = useRef(null);
  const raiseSliderFill = Math.min(100, Math.max(0, Number(raiseSliderInput) || 0));
  const timerFill = Math.min(100, Math.max(0, Number(timerProgress) || 0));
  const showActionTimerBar = canTakeAction && timerFill > 0;

  const updateRaiseFromClientX = (clientX) => {
    if (!canRaiseNow || !raiseSliderRef.current) return;

    const rect = raiseSliderRef.current.getBoundingClientRect();
    const sliderValue = Math.min(100, Math.max(0, ((clientX - rect.left) / Math.max(1, rect.width)) * 100));
    onRaiseAmountChange(getNonlinearRaiseAmount({
      sliderValue,
      minAmount: minRaiseTarget,
      potAmount: potRaiseTarget,
      maxAmount: maxBet,
    }));
  };

  const nudgeRaiseAmount = (delta) => {
    if (!canRaiseNow) return;
    onRaiseAmountChange(raiseInput + delta);
  };

  const handleRaiseSliderKeyDown = (event) => {
    if (!canRaiseNow) return;

    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      nudgeRaiseAmount(-CHIP_UNIT);
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      nudgeRaiseAmount(CHIP_UNIT);
    } else if (event.key === 'PageDown') {
      event.preventDefault();
      nudgeRaiseAmount(-CHIP_UNIT * 5);
    } else if (event.key === 'PageUp') {
      event.preventDefault();
      nudgeRaiseAmount(CHIP_UNIT * 5);
    } else if (event.key === 'Home') {
      event.preventDefault();
      onRaiseAmountChange(minRaiseTarget);
    } else if (event.key === 'End') {
      event.preventDefault();
      onRaiseAmountChange(maxBet);
    }
  };

  return (
    <div className={`poker-action-controls ${canTakeAction ? 'is-live' : 'is-disabled'} flex-1 flex flex-col gap-3 w-full ml-auto`}>
      <div className="poker-action-status flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="poker-action-status-label truncate font-black text-white">{actionStatusLabel}</div>
          <div className="poker-action-status-sub text-slate-400 text-xs">底池 {pot || 0} · 当前注 {currentBet || 0}</div>
        </div>
        <div
          className={`poker-action-status-timer ${showActionTimerBar ? 'is-bar' : ''} ${canTakeAction && isTimerCritical ? 'is-critical' : ''} flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-sm ${canTakeAction ? 'text-amber-300 bg-amber-950/50 border border-amber-500/30' : 'text-slate-400 bg-slate-800 border border-slate-700'}`}
          style={showActionTimerBar ? { '--timer-progress': `${timerFill}%` } : undefined}
          aria-label={showActionTimerBar ? actionStatusDetail : undefined}
        >
          {showActionTimerBar ? (
            <span className="poker-action-timebar" aria-hidden="true">
              <span className="poker-action-timebar-fill" />
            </span>
          ) : (
            <>
              <Timer size={14} /> {actionStatusDetail}
            </>
          )}
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
            {showFullPotPreset && (
              <button disabled={!canRaiseNow} onClick={() => onRaiseAmountChange(calcPotRaise(1))} className="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-bold transition">满池</button>
            )}
            <button disabled={!canRaiseNow} onClick={() => onRaiseAmountChange(maxBet)} className="flex-1 py-1.5 bg-rose-900/60 hover:bg-rose-800/80 text-rose-200 border border-rose-800 rounded-lg text-sm font-bold transition">All-In</button>
          </div>

          <div className="poker-raise-controls flex items-center gap-3">
            <div className="poker-raise-slider-wrap flex-1">
              <div
                ref={raiseSliderRef}
                role="slider"
                aria-label="加注滑条"
                aria-valuemin={minRaiseIncrement}
                aria-valuemax={maxRaiseIncrement}
                aria-valuenow={raiseIncrementInput}
                aria-valuetext={`新增 ${raiseIncrementInput}`}
                tabIndex={canRaiseNow ? 0 : -1}
                style={{ '--raise-slider-fill': `${raiseSliderFill}%` }}
                className={`poker-raise-range ${isDraggingRaise ? 'is-dragging' : ''} ${canRaiseNow ? '' : 'is-disabled'}`}
                onPointerDown={(event) => {
                  if (!canRaiseNow) return;
                  event.preventDefault();
                  event.currentTarget.setPointerCapture?.(event.pointerId);
                  setIsDraggingRaise(true);
                  updateRaiseFromClientX(event.clientX);
                }}
                onPointerMove={(event) => {
                  if (!isDraggingRaise) return;
                  event.preventDefault();
                  updateRaiseFromClientX(event.clientX);
                }}
                onPointerUp={(event) => {
                  setIsDraggingRaise(false);
                  event.currentTarget.releasePointerCapture?.(event.pointerId);
                }}
                onPointerCancel={() => setIsDraggingRaise(false)}
                onKeyDown={handleRaiseSliderKeyDown}
              >
                <div className="poker-raise-range-thumb" />
              </div>
              <div className="poker-slider-scale text-[11px] text-slate-500">
                <span className="poker-slider-label poker-slider-label-start">精细</span>
                {showFullPotSliderMark && (
                  <span
                    className="poker-slider-label poker-slider-label-pot"
                    style={{ '--full-pot-slider-position': `${Math.min(100, Math.max(0, Number(fullPotSliderPosition) || 0))}%` }}
                  >
                    满池
                  </span>
                )}
                <span className="poker-slider-label poker-slider-label-end">全下</span>
              </div>
            </div>
            <input
              type="number"
              aria-label="本次新增下注额"
              title="本次新增下注额"
              min={minRaiseIncrement}
              max={maxRaiseIncrement}
              step={CHIP_UNIT}
              value={raiseIncrementInput}
              disabled={!canRaiseNow}
              onChange={(event) => onRaiseIncrementChange(event.target.value)}
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
