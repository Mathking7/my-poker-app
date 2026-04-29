import { Users, X } from 'lucide-react';

export default function GameLogDrawer({ logs = [], isOpen, logsEndRef, onClose }) {
  return (
    <>
      <div className={`poker-log-drawer fixed inset-y-0 right-0 w-80 bg-slate-900/95 backdrop-blur-md border-l border-slate-700 shadow-[0_0_50px_rgba(0,0,0,0.8)] z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="bg-slate-800 p-4 font-bold text-sm border-b border-slate-700 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2"><Users size={16} className="text-emerald-400" /> 对局动态</div>
          <button onClick={onClose} className="text-slate-400 hover:text-rose-400 transition p-1"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-sm leading-relaxed scroll-smooth" id="game-logs">
          {logs.map((log, idx) => (
            <div
              key={idx}
              className={`
                ${log.includes('---') ? 'text-emerald-400 font-bold mt-4 mb-2 border-b border-emerald-900/50 pb-1' : ''}
                ${log.includes('🏆') ? 'text-amber-400 font-black my-3 bg-amber-900/30 p-2 rounded border border-amber-700/50' : ''}
                ${log.includes('🃏') ? 'text-blue-300 font-bold my-2' : ''}
                ${!log.includes('---') && !log.includes('🏆') && !log.includes('🃏') ? 'text-slate-300' : ''}
              `}
            >
              {log}
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
      </div>

      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
          onClick={onClose}
        />
      )}
    </>
  );
}
