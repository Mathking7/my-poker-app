const SUIT_COLORS = {
  '♠': 'text-slate-800',
  '♣': 'text-slate-800',
  '♥': 'text-red-600',
  '♦': 'text-red-600',
};

export default function CardUI({ card, hidden, highlight }) {
  if (hidden) {
    return (
      <div className="w-12 h-16 md:w-16 md:h-24 bg-blue-600 rounded shadow-md border-2 border-white flex items-center justify-center bg-[repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(255,255,255,0.1)_5px,rgba(255,255,255,0.1)_10px)]">
        <div className="w-8 h-12 border-2 border-blue-400 rounded-sm"></div>
      </div>
    );
  }

  if (!card) {
    return <div className="w-12 h-16 md:w-16 md:h-24 border border-dashed border-slate-400 rounded opacity-50"></div>;
  }

  const suit = card[0];
  const rank = card[1];
  const colorClass = SUIT_COLORS[suit] || 'text-slate-800';
  const highlightClass = highlight
    ? 'border-4 border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.8)] scale-105 z-10 transition-all duration-300'
    : 'border border-slate-300';

  return (
    <div className={`w-12 h-16 md:w-16 md:h-24 bg-white rounded shadow-md flex flex-col items-center justify-center p-1 font-bold text-lg md:text-2xl ${highlightClass}`}>
      <div className={`leading-none ${colorClass}`}>{suit}</div>
      <div className={`leading-none ${colorClass}`}>{rank}</div>
    </div>
  );
}
