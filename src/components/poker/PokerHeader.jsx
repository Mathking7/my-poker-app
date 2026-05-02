import { Bot, CheckCircle2, Copy, LogOut, Pause, Play, PlayCircle, Settings } from 'lucide-react';

export default function PokerHeader({
  roomId,
  roomData,
  copySuccess,
  displayBlind,
  effectiveSettings,
  transitionPhaseInfo,
  activeTransition,
  isHost,
  canManageRoom,
  canAddAi,
  onCopyRoomId,
  onAddAiPlayer,
  onTogglePause,
  onOpenSettings,
  onLeave,
}) {
  return (
    <div className="poker-game-header bg-slate-800 border-b border-slate-700 p-4 flex justify-between items-center shadow-md z-20 flex-shrink-0">
      <div className="poker-game-header-left flex items-center gap-4">
        <div className="poker-game-brand font-bold text-xl text-emerald-400 flex items-center gap-2">
          <Play size={24} className="flex-none" />
          <span className="brand-full">德州扑克</span>
          <span className="brand-short hidden">德扑</span>
        </div>

        <div
          className="poker-room-chip bg-slate-700 px-3 py-1 rounded-full text-sm font-mono flex items-center gap-2 cursor-pointer hover:bg-slate-600 transition"
          onClick={onCopyRoomId}
        >
          <span className="poker-room-chip-label">房间号:</span>
          <span className="text-white tracking-widest">{roomId}</span>
          {copySuccess ? <CheckCircle2 size={14} className="text-emerald-400 flex-none" /> : <Copy size={14} className="flex-none" />}
        </div>

        {roomData.isPublic === false && <span className="text-xs bg-rose-900 text-rose-300 px-2 py-1 rounded border border-rose-700">私密</span>}

        <div className="hidden md:flex items-center gap-3 ml-4 bg-slate-900/50 px-3 py-1 rounded-full border border-slate-700 text-sm z-30">
          <span>
            当前盲注: <span className="text-amber-400 font-bold">{displayBlind} / {displayBlind * 2}</span>
          </span>
          {effectiveSettings.doubleBlinds && <span className="text-slate-400 text-xs ml-1"> (局数 {((roomData.handCount || 1) - 1) % 5 + 1}/5)</span>}
        </div>

        <div className="hidden lg:flex items-center gap-2 bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-700/60 text-sm">
          <span className="text-emerald-300 font-bold">{transitionPhaseInfo.label}</span>
          {activeTransition && <span className="text-amber-300 text-xs">过场中</span>}
        </div>
      </div>

      <div className="poker-header-actions flex items-center gap-4">
        {canManageRoom && (
          <button
            onClick={onAddAiPlayer}
            disabled={!canAddAi}
            title={canAddAi ? '加入 AI 玩家' : '房间人数已满'}
            className="poker-header-button flex h-9 items-center gap-1 rounded-lg border border-slate-600 bg-slate-700/70 px-3 text-sm text-slate-200 transition hover:border-emerald-500 hover:text-emerald-300 disabled:border-slate-800 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed"
          >
            <Bot size={16} />
            <span className="poker-header-action-text">加入AI</span>
          </button>
        )}
        {isHost && (
          <button
            onClick={onTogglePause}
            title={roomData.isPaused ? '恢复对局' : '暂停对局'}
            className={`poker-header-button flex h-9 items-center gap-1 rounded-lg px-3 text-sm transition ${roomData.isPaused ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          >
            {roomData.isPaused ? <PlayCircle size={16} /> : <Pause size={16} />}
            <span className="poker-header-action-text">{roomData.isPaused ? '恢复对局' : '暂停对局'}</span>
          </button>
        )}
        <button onClick={onOpenSettings} title="房间设置" className="poker-header-button flex h-9 items-center gap-1 rounded-lg border border-transparent px-3 text-sm text-slate-400 transition hover:border-slate-600 hover:bg-slate-700/70 hover:text-white">
          <Settings size={16} />
          <span className="poker-header-action-text">房间设置</span>
        </button>
        <button onClick={onLeave} title="退出" className="poker-header-button flex h-9 items-center gap-1 rounded-lg border border-transparent px-3 text-sm text-slate-400 transition hover:border-slate-600 hover:bg-slate-700/70 hover:text-white">
          <LogOut size={16} />
          <span className="poker-header-action-text">退出</span>
        </button>
      </div>
    </div>
  );
}
