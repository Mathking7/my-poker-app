import { useEffect, useRef, useState } from 'react';
import { ClipboardList, History, Users, X } from 'lucide-react';

const formatTime = (timestamp) => {
  if (!timestamp) return '';
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(timestamp));
  } catch {
    return '';
  }
};

const formatAction = (action) => {
  const name = action.playerName || '玩家';
  const label = action.actionLabel || action.actionType || '行动';
  if (action.actionType === 'raise' || action.actionType === 'allin') {
    return `${name} ${label}到 ${action.targetBet || action.totalBet || 0}`;
  }
  if ((action.amount || 0) > 0) return `${name} ${label} ${action.amount}`;
  return `${name} ${label}`;
};

const formatCards = (cards = [], fallback = '无') => (
  Array.isArray(cards) && cards.length ? cards.join(' ') : fallback
);

function HandHistoryCard({ hand }) {
  const actionsByStreet = (hand.actions || []).reduce((groups, action) => {
    const key = action.streetLabel || action.street || '本局';
    groups[key] = groups[key] || [];
    groups[key].push(action);
    return groups;
  }, {});
  const shownPlayers = (hand.players || []).filter((player) => player.shownCards?.length > 0);
  const heroCards = Array.isArray(hand.heroCards) ? hand.heroCards.filter(Boolean) : [];
  const winners = Array.isArray(hand.winners) ? hand.winners : [];
  const players = Array.isArray(hand.players) ? hand.players : [];

  return (
    <section className="rounded-lg border border-slate-700 bg-slate-950/70 p-3 text-sm shadow">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-black text-emerald-300">第 {hand.handNumber} 局</div>
          <div className="mt-1 text-xs text-slate-500">{formatTime(hand.startedAt)} - {formatTime(hand.endedAt)}</div>
        </div>
        <div className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-bold text-amber-300">
          总底池 {hand.totalPot || 0}
        </div>
      </div>

      <div className="mt-3 rounded border border-amber-500/25 bg-amber-500/10 p-2">
        <div className="text-xs font-bold text-amber-200">本局结果</div>
        <div className="mt-1 font-bold leading-relaxed text-amber-300">{hand.summary || '本局已结束'}</div>
        {winners.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {winners.map((winner, index) => (
              <span key={`${winner.uid || winner.name}-${index}`} className="rounded-full border border-amber-400/25 bg-slate-950/50 px-2 py-0.5 text-xs font-bold text-slate-100">
                {winner.name || '玩家'} +{winner.amount || 0}{winner.rankName ? ` · ${winner.rankName}` : ''}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 rounded border border-slate-800 bg-slate-900/80 p-2">
        <div className="text-xs text-slate-500">公共牌</div>
        <div className="mt-1 font-mono text-base text-white">{formatCards(hand.board, '未发出公共牌')}</div>
      </div>

      {heroCards.length > 0 && (
        <div className="mt-3 rounded border border-emerald-500/25 bg-emerald-500/10 p-2">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-xs font-bold text-emerald-300">
              我的手牌{hand.heroRankName ? ` · ${hand.heroRankName}` : ''}
            </span>
            <span className="shrink-0 font-mono text-base font-black text-white">{heroCards.join(' ')}</span>
          </div>
        </div>
      )}

      {shownPlayers.length > 0 && (
        <div className="mt-3 rounded border border-blue-500/25 bg-blue-500/10 p-2">
          <div className="text-xs font-bold text-blue-200">公开亮牌</div>
          <div className="mt-2 space-y-1">
            {shownPlayers.map((player) => (
              <div key={player.uid} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-slate-200">
                  {player.name}
                  {player.rankName && <span className="ml-2 text-xs text-slate-400">{player.rankName}</span>}
                </span>
                <span className="shrink-0 font-mono text-base font-black text-white">{player.shownCards.join(' ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {players.length > 0 && (
        <div className="mt-3 rounded border border-slate-800 bg-slate-900/60 p-2">
          <div className="text-xs font-bold text-slate-500">玩家结算</div>
          <div className="mt-2 grid grid-cols-1 gap-1">
            {players.map((player) => (
              <div key={player.uid} className="flex items-center justify-between gap-3 rounded bg-slate-950/35 px-2 py-1 text-xs">
                <span className="min-w-0 truncate text-slate-300">
                  {player.name || '玩家'}
                  {player.folded && <span className="ml-1 text-slate-500">弃牌</span>}
                  {player.allIn && <span className="ml-1 text-rose-300">全下</span>}
                </span>
                <span className={`shrink-0 font-bold ${player.winAmount > 0 ? 'text-amber-300' : 'text-slate-400'}`}>
                  投入 {player.contribution || 0} / {player.winAmount > 0 ? `赢 ${player.winAmount}` : '未收池'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 space-y-3">
        {Object.keys(actionsByStreet).length ? Object.entries(actionsByStreet).map(([street, actions]) => (
          <div key={street}>
            <div className="mb-1 text-xs font-bold text-slate-500">{street}</div>
            <div className="space-y-1">
              {actions.map((action) => (
                <div key={action.id} className="flex items-center justify-between gap-3 rounded border border-slate-800 bg-slate-900/55 px-2 py-1.5">
                  <span className="text-slate-300">{formatAction(action)}</span>
                  <span className="shrink-0 text-xs text-slate-500">{formatTime(action.at)}</span>
                </div>
              ))}
            </div>
          </div>
        )) : (
          <div className="rounded border border-slate-800 bg-slate-900/55 px-2 py-2 text-xs text-slate-500">
            本局没有记录到行动线。
          </div>
        )}
      </div>
    </section>
  );
}

export default function GameLogDrawer({ logs = [], handHistory = [], isOpen, logsEndRef, onClose }) {
  const [activeTab, setActiveTab] = useState('logs');
  const logScrollRef = useRef(null);
  const shouldStickToBottomRef = useRef(true);

  const handleLogScroll = () => {
    const element = logScrollRef.current;
    if (!element) return;
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < 96;
  };

  useEffect(() => {
    if (!isOpen || activeTab !== 'logs' || !shouldStickToBottomRef.current) return;
    logsEndRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [activeTab, isOpen, logs, logsEndRef]);

  return (
    <>
      <div className={`poker-log-drawer fixed inset-y-0 right-0 w-80 bg-slate-900/95 backdrop-blur-md border-l border-slate-700 shadow-[0_0_50px_rgba(0,0,0,0.8)] z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="bg-slate-800 p-4 border-b border-slate-700 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold"><Users size={16} className="text-emerald-400" /> 对局记录</div>
            <button onClick={onClose} className="text-slate-400 hover:text-rose-400 transition p-1"><X size={20} /></button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-950/70 p-1">
            <button
              onClick={() => setActiveTab('logs')}
              className={`flex items-center justify-center gap-1 rounded-md px-2 py-2 text-xs font-bold transition ${activeTab === 'logs' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              <ClipboardList size={14} /> 动态
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center justify-center gap-1 rounded-md px-2 py-2 text-xs font-bold transition ${activeTab === 'history' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              <History size={14} /> 牌局历史
            </button>
          </div>
        </div>

        {activeTab === 'logs' ? (
          <div
            ref={logScrollRef}
            onScroll={handleLogScroll}
            className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-sm leading-relaxed scroll-smooth"
            id="game-logs"
          >
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
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {handHistory.length ? (
              handHistory.map((hand) => <HandHistoryCard key={hand.id} hand={hand} />)
            ) : (
              <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-5 text-center text-sm text-slate-400">
                本房间还没有完成的牌局。
              </div>
            )}
          </div>
        )}
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
