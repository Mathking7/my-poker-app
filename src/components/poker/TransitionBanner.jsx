export default function TransitionBanner({ phaseInfo, detail, progress }) {
  if (!phaseInfo) return null;

  return (
    <div className="poker-transition-banner absolute top-16 left-1/2 -translate-x-1/2 z-30 pointer-events-none w-[min(92vw,520px)] phase-banner-in">
      <div className="poker-transition-card bg-slate-950/88 backdrop-blur border border-emerald-500/50 shadow-[0_12px_36px_rgba(0,0,0,0.45)] rounded-lg px-5 py-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="poker-transition-kicker text-xs uppercase tracking-widest text-emerald-300">{phaseInfo.shortLabel}</div>
            <div className="poker-transition-title text-xl font-black text-white mt-0.5">{phaseInfo.label}</div>
          </div>
          <div className="poker-transition-detail text-right text-sm text-slate-300 max-w-[260px]">{detail}</div>
        </div>
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mt-3">
          <div className="h-full bg-emerald-400 rounded-full origin-left transition-transform duration-200" style={{ transform: `scaleX(${progress})` }} />
        </div>
      </div>
    </div>
  );
}
