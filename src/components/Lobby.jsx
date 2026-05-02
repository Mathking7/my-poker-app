import React, { useState } from 'react';
import {
  AlertCircle,
  Clock3,
  Globe,
  History,
  List,
  Lock,
  Play,
  RefreshCw,
  Search,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { CHIP_UNIT } from '../utils/chipMath';
import {
  DEFAULT_SETTINGS,
  MAX_INITIAL_CHIPS,
  MAX_TIME_LIMIT,
  MIN_INITIAL_CHIPS,
  MIN_TIME_LIMIT,
  normalizeGameSettings,
} from '../utils/gameSettings';
import { ROOM_RETENTION_OPTIONS, getRetentionOption } from '../utils/roomLifecycle';

const VERSION_HISTORY = [
  {
    version: 'v1.3',
    title: '房间保留与牌局历史',
    date: '2026-05-02',
    summary: '规范公开与私密房间的保留策略，加入最近房间和更完整的牌局历史，让没有服务器的部署也能保持房间管理清爽。',
    changes: [
      '公开房间改为大厅索引展示，空置后自动退出公开列表，并在保留期结束后清理。',
      '私密房间不进入公开索引，进入过的玩家可从自己的最近房间回到房间。',
      '创建私密房间时可以选择保留时间，避免房间堆积。',
      '牌局记录改为结构化展示，包含公共牌、底池、赢家和各轮行动。',
      '其它界面和流程优化。',
    ],
  },
  {
    version: 'v1.2',
    title: 'AI 玩家与维护性升级',
    date: '2026-05-01',
    summary: '房间内可以加入 AI 玩家，并对项目结构、移动端显示和关键流程稳定性进行了系统整理。',
    changes: [
      '新增房间内加入 AI 玩家入口，AI 会根据牌力、底池赔率和筹码压力快速参与对局。',
      '支持私密房房主为玩家设置下一局筹码调整。',
      '整理计时器、过场、摊牌展示、AI 调度和房间数据规范化逻辑，提升后续维护稳定性。',
      '优化移动端过场提示、多人对手滚动和部分对局流程体验。',
      '其它界面和流程优化。',
    ],
  },
  {
    version: 'v1.1',
    title: '加注滑块体验更新',
    date: '2026-04-29',
    summary: '优化加注操作，让下注选择更顺手。',
    changes: [
      '优化加注滑块手感。',
      '加注输入框显示本次新增下注额。',
    ],
  },
  {
    version: 'v1.0',
    title: '首个稳定验收版本',
    date: '2026-04-29',
    summary: '完成公开与私密房间、多人德州扑克对局、桌面端与移动端布局、房间维护、下注流程与摊牌结算。',
    changes: [
      '支持公开房间、私密房间和匿名玩家加入。',
      '支持盲注、下注、跟注、过牌、弃牌、全下、摊牌和分池结算。',
      '加入移动端与桌面端响应式牌桌，以及基础过场动画和计时提示。',
    ],
  },
];

const getRoomStatusLabel = (status) => ({
  waiting: '等待中',
  'pre-flop': '翻牌前',
  flop: '翻牌圈',
  turn: '转牌圈',
  river: '河牌圈',
  showdown: '结算中',
  expired: '已过期',
}[status] || '对局中');

const formatRecentTime = (timestamp) => {
  if (!timestamp) return '未知时间';
  const diffMs = Date.now() - timestamp;
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
};

function VersionModal({ onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-md border border-slate-600 overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b border-slate-700 bg-slate-900/50">
          <h2 className="text-lg font-bold text-white">版本信息</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <X size={20} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5 space-y-4 text-sm text-slate-300">
          {VERSION_HISTORY.map((release, index) => (
            <section key={release.version} className="rounded-lg border border-slate-700 bg-slate-900/55 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className={`text-xl font-black ${index === 0 ? 'text-emerald-300' : 'text-slate-200'}`}>
                    德州扑克 {release.version}
                  </div>
                  <div className="mt-1 font-bold text-slate-300">{release.title}</div>
                </div>
                <div className="shrink-0 rounded-full border border-slate-600 px-2.5 py-1 text-xs text-slate-400">
                  {release.date}
                </div>
              </div>
              <p className="mt-3 leading-relaxed text-slate-400">{release.summary}</p>
              <ul className="mt-3 space-y-2 text-slate-300">
                {release.changes.map((change) => (
                  <li key={change} className="flex gap-2 leading-relaxed">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400/80" />
                    <span>{change}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function MiniHandHistoryCard({ hand }) {
  const shownPlayers = (hand.players || []).filter((player) => player.shownCards?.length > 0);
  const heroCards = Array.isArray(hand.heroCards) ? hand.heroCards.filter(Boolean) : [];
  return (
    <section className="rounded-lg border border-slate-700 bg-slate-950/65 p-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="font-black text-emerald-300">第 {hand.handNumber} 局</div>
        <div className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-bold text-amber-300">
          底池 {hand.totalPot || 0}
        </div>
      </div>
      <div className="mt-2 text-xs text-slate-500">公共牌</div>
      <div className="mt-1 font-mono text-base text-white">{hand.board?.length ? hand.board.join(' ') : '未发出公共牌'}</div>
      <div className="mt-2 font-bold leading-relaxed text-amber-300">{hand.summary || '本局已结束'}</div>
      {heroCards.length > 0 && (
        <div className="mt-2 rounded border border-emerald-500/25 bg-emerald-500/10 p-2">
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-xs font-bold text-emerald-300">
              我的手牌{hand.heroRankName ? ` · ${hand.heroRankName}` : ''}
            </span>
            <span className="shrink-0 font-mono text-base font-black text-white">{heroCards.join(' ')}</span>
          </div>
        </div>
      )}
      {shownPlayers.length > 0 && (
        <div className="mt-2 space-y-1 rounded border border-blue-500/20 bg-blue-500/10 p-2">
          {shownPlayers.map((player) => (
            <div key={player.uid} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-slate-200">{player.name}</span>
              <span className="shrink-0 font-mono font-black text-white">{player.shownCards.join(' ')}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function RoomCard({ room, onJoin, onOpenHistory }) {
  const disabled = room.canRejoin === false;
  const hasHistory = Boolean(room.recentHands?.length);
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 shadow transition hover:border-slate-500">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-white font-bold tracking-widest text-lg">房号: {room.roomId || room.id}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className={`rounded-full border px-2 py-0.5 ${room.isPublic ? 'border-blue-500/40 text-blue-300' : 'border-rose-500/40 text-rose-300'}`}>
              {room.isPublic ? '公开' : '私密'}
            </span>
            <span>{getRoomStatusLabel(room.status || room.lifecycleStatus)}</span>
            {room.hasAi && <span>含 AI</span>}
          </div>
        </div>
        <button
          onClick={onJoin}
          disabled={disabled}
          className="shrink-0 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg font-bold transition shadow-md"
        >
          {disabled ? '已过期' : '加入'}
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
        <div className="rounded border border-slate-800 bg-slate-950/60 p-2">
          <div className="text-slate-500">玩家</div>
          <div className="mt-1 font-bold text-slate-200">{room.activePlayerCount ?? 0} / {room.maxPlayers || 9}</div>
        </div>
        <div className="rounded border border-slate-800 bg-slate-950/60 p-2">
          <div className="text-slate-500">局数</div>
          <div className="mt-1 font-bold text-slate-200">{room.handCount || 0}</div>
        </div>
      </div>
      {room.playerNames?.length > 0 && (
        <div className="mt-3 truncate text-xs text-slate-500">玩家: {room.playerNames.join('、')}</div>
      )}
      {room.lastVisitedAt && (
        <div className="mt-2 text-xs text-slate-500">上次进入: {formatRecentTime(room.lastVisitedAt)}</div>
      )}
      {room.retentionLabel && (
        <div className="mt-2 text-xs text-slate-500">保留: {room.retentionLabel}</div>
      )}
      {room.lastHandSummary?.summary && (
        <div className="mt-2 rounded border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
          {room.lastHandSummary.summary}
        </div>
      )}
      {onOpenHistory && (
        <button
          onClick={onOpenHistory}
          disabled={!hasHistory}
          className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm font-bold text-slate-300 transition hover:border-emerald-500 hover:text-emerald-300 disabled:cursor-not-allowed disabled:text-slate-600"
        >
          {hasHistory ? `查看牌局记录 (${room.recentHands.length})` : '暂无牌局记录'}
        </button>
      )}
    </div>
  );
}

export default function Lobby({
  user,
  onCreateRoom,
  onJoinRoom,
  onFetchPublicRooms,
  onFetchRoomHistory = async () => [],
  errorMsg,
}) {
  const [playerName, setPlayerName] = useState(() => {
    try { return localStorage.getItem('pokerPlayerName') || ''; } catch { return ''; }
  });
  const [gameType, setGameType] = useState('texas');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreatingPublic, setIsCreatingPublic] = useState(true);
  const [isCreateSubmitting, setIsCreateSubmitting] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [showPublicRoomsModal, setShowPublicRoomsModal] = useState(false);
  const [publicRooms, setPublicRooms] = useState([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [roomHistory, setRoomHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedHistoryRoom, setSelectedHistoryRoom] = useState(null);

  const savePlayerName = (value = playerName) => {
    try { localStorage.setItem('pokerPlayerName', value); } catch { /* localStorage may be unavailable */ }
  };

  const requirePlayerName = () => {
    if (!playerName.trim()) {
      alert('请先输入你的名字');
      return false;
    }
    savePlayerName();
    return true;
  };

  const handleOpenCreateModal = (isPublic) => {
    if (!requirePlayerName()) return;
    setIsCreatingPublic(isPublic);
    setShowCreateModal(true);
  };

  const handleConfirmCreate = async () => {
    if (isCreateSubmitting) return;
    setIsCreateSubmitting(true);
    try {
      setShowCreateModal(false);
      const created = await onCreateRoom(playerName, gameType, isCreatingPublic, normalizeGameSettings(settings));
      if (!created) setShowCreateModal(true);
    } finally {
      setIsCreateSubmitting(false);
    }
  };

  const handleJoin = (roomId) => {
    if (!requirePlayerName()) return;
    onJoinRoom(playerName, roomId);
  };

  const handleOpenPublicRooms = async () => {
    if (!requirePlayerName()) return;
    setShowPublicRoomsModal(true);
    setIsLoadingRooms(true);
    const rooms = await onFetchPublicRooms(gameType);
    setPublicRooms(rooms);
    setIsLoadingRooms(false);
  };

  const refreshPublicRooms = async () => {
    setIsLoadingRooms(true);
    const rooms = await onFetchPublicRooms(gameType);
    setPublicRooms(rooms);
    setIsLoadingRooms(false);
  };

  const handleOpenHistory = async () => {
    if (!requirePlayerName()) return;
    setShowHistoryModal(true);
    setSelectedHistoryRoom(null);
    setIsLoadingHistory(true);
    const rooms = await onFetchRoomHistory();
    setRoomHistory(rooms);
    setIsLoadingHistory(false);
  };

  const refreshRoomHistory = async () => {
    setIsLoadingHistory(true);
    const rooms = await onFetchRoomHistory();
    setRoomHistory(rooms);
    setIsLoadingHistory(false);
  };

  const selectedRetention = getRetentionOption(settings.roomRetention);

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans text-slate-100 relative">
      <button
        type="button"
        onClick={() => setShowVersionModal(true)}
        className="absolute left-4 top-4 rounded-full border border-slate-600 bg-slate-800/80 px-3 py-1.5 text-sm font-bold text-emerald-300 shadow-lg transition hover:border-emerald-400 hover:bg-slate-800"
      >
        {VERSION_HISTORY[0].version}
      </button>

      <main className="bg-slate-800 p-7 sm:p-8 rounded-xl shadow-2xl w-full max-w-md border border-slate-700">
        <div className="flex items-center justify-center mb-8 gap-3 text-emerald-400">
          <Play size={40} />
          <h1 className="text-3xl font-black tracking-wider">棋牌游戏大厅</h1>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">你的名字</label>
            <input
              type="text"
              value={playerName}
              onChange={(event) => {
                setPlayerName(event.target.value);
                savePlayerName(event.target.value);
              }}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg py-3 px-4 text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition"
              placeholder="例如：发哥"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">选择游戏</label>
            <div className="flex gap-2">
              <button onClick={() => setGameType('texas')} className={`flex-1 py-3 rounded-lg font-bold transition border ${gameType === 'texas' ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>德州扑克</button>
              <button disabled className="flex-1 py-3 rounded-lg font-bold bg-slate-900 border border-slate-800 text-slate-600 cursor-not-allowed">斗地主 开发中</button>
            </div>
          </div>

          <div className="border-t border-slate-700" />

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">创建新房间</label>
            <div className="grid grid-cols-2 gap-2">
              <button data-testid="create-public-room" onClick={() => handleOpenCreateModal(true)} className="flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition border bg-blue-600/20 border-blue-500 text-blue-400 hover:bg-blue-600/30">
                <Globe size={16} /> 公开房间
              </button>
              <button data-testid="create-private-room" onClick={() => handleOpenCreateModal(false)} className="flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition border bg-rose-600/20 border-rose-500 text-rose-400 hover:bg-rose-600/30">
                <Lock size={16} /> 私密房间
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2 text-center">公开房间进入大厅列表；私密房间只通过房号或最近房间进入。</p>
          </div>

          <div className="border-t border-slate-700" />

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">加入房间</label>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button data-testid="open-public-rooms" onClick={handleOpenPublicRooms} className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 transition rounded-lg font-bold py-3 shadow-lg">
                <List size={18} /> 公开列表
              </button>
              <button data-testid="open-room-history" onClick={handleOpenHistory} disabled={!user} className="flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 transition rounded-lg font-bold py-3 shadow-lg">
                <History size={18} /> 最近房间
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={4}
                value={joinRoomId}
                onChange={(event) => setJoinRoomId(event.target.value.toUpperCase())}
                className="w-1/2 bg-slate-900 border border-slate-600 rounded-lg py-3 px-4 text-white text-center tracking-widest font-mono outline-none focus:border-emerald-500"
                placeholder="4位房号"
              />
              <button onClick={() => handleJoin(joinRoomId)} className="w-1/2 flex items-center justify-center gap-1 bg-slate-700 hover:bg-slate-600 transition rounded-lg font-bold py-3">
                <Search size={18} /> 搜索加入
              </button>
            </div>
          </div>
        </div>

        {errorMsg && <div className="mt-6 flex items-center gap-2 text-rose-400 bg-rose-400/10 p-3 rounded-lg text-sm border border-rose-400/20"><AlertCircle size={16} /> {errorMsg}</div>}
      </main>

      {showVersionModal && <VersionModal onClose={() => setShowVersionModal(false)} />}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-md border border-slate-600 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-4 border-b border-slate-700 bg-slate-900/50">
              <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                <Settings size={20} className="text-emerald-400" /> 创建{isCreatingPublic ? '公开' : '私密'}房间
              </h2>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto">
              <div>
                <div className="text-slate-300 font-medium mb-2">初始筹码</div>
                <div className="flex gap-2 mb-2">
                  {[500, 1000, 2000].map((value) => (
                    <button key={value} onClick={() => setSettings(normalizeGameSettings({ ...settings, initialChips: value }))} className={`flex-1 py-2 rounded font-bold border transition ${settings.initialChips === value ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}>{value}</button>
                  ))}
                </div>
                <input type="number" min={MIN_INITIAL_CHIPS} max={MAX_INITIAL_CHIPS} step={CHIP_UNIT} value={settings.initialChips} onChange={(event) => setSettings(normalizeGameSettings({ ...settings, initialChips: event.target.value }))} className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white outline-none focus:border-emerald-500" placeholder="自定义初始筹码" />
              </div>

              <div>
                <div className="text-slate-300 font-medium mb-2">每步思考时长</div>
                <div className="flex gap-2 mb-2">
                  {[10, 30, '无限'].map((value) => (
                    <button key={value} onClick={() => setSettings(normalizeGameSettings({ ...settings, timeLimit: value }))} className={`flex-1 py-2 rounded font-bold border transition ${settings.timeLimit === value ? 'bg-blue-600 text-white border-blue-500 shadow-lg' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}>{value === '无限' ? value : `${value}s`}</button>
                  ))}
                </div>
                {typeof settings.timeLimit === 'number' && (
                  <input type="number" min={MIN_TIME_LIMIT} max={MAX_TIME_LIMIT} value={settings.timeLimit} onChange={(event) => setSettings(normalizeGameSettings({ ...settings, timeLimit: event.target.value }))} className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white outline-none focus:border-blue-500" placeholder="自定义秒数" />
                )}
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
                <div className="mb-2 flex items-center gap-2 text-slate-300 font-medium">
                  <Clock3 size={16} className="text-amber-300" /> 房间保留
                </div>
                {isCreatingPublic ? (
                  <p className="text-sm leading-relaxed text-slate-400">公开房间空置后会自动离开大厅列表，并保留 30 分钟，方便刚离线的玩家回到原房间。</p>
                ) : (
                  <>
                    <div className="grid grid-cols-4 gap-2">
                      {ROOM_RETENTION_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => setSettings(normalizeGameSettings({ ...settings, roomRetention: option.value }))}
                          className={`rounded border px-2 py-2 text-sm font-bold transition ${settings.roomRetention === option.value ? 'border-amber-400 bg-amber-400/15 text-amber-200' : 'border-slate-700 bg-slate-950 text-slate-400 hover:border-slate-500'}`}
                        >
                          {option.shortLabel}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-slate-500">房间空置后保留 {selectedRetention?.label || '24小时'}，之后由客户端维护流程自动清理。</p>
                  </>
                )}
              </div>

              <div className="space-y-3 pt-4 border-t border-slate-700">
                <label className="flex items-center justify-between gap-4 text-slate-300 cursor-pointer group">
                  <span className="group-hover:text-emerald-400 transition">允许对局中途添加他人</span>
                  <input type="checkbox" checked={settings.allowJoinDuringGame} onChange={(event) => setSettings(normalizeGameSettings({ ...settings, allowJoinDuringGame: event.target.checked }))} className="w-5 h-5 accent-emerald-500" />
                </label>
                <label className="flex items-center justify-between gap-4 text-slate-300 cursor-pointer group">
                  <span className="group-hover:text-emerald-400 transition">盲注每5局自动翻倍</span>
                  <input type="checkbox" checked={settings.doubleBlinds} onChange={(event) => setSettings(normalizeGameSettings({ ...settings, doubleBlinds: event.target.checked }))} className="w-5 h-5 accent-emerald-500" />
                </label>
                <label className="flex items-center justify-between gap-4 text-slate-300 cursor-pointer group">
                  <span className="group-hover:text-emerald-400 transition">自动补码</span>
                  <input type="checkbox" checked={settings.autoTopUp} onChange={(event) => setSettings(normalizeGameSettings({ ...settings, autoTopUp: event.target.checked }))} className="w-5 h-5 accent-emerald-500" />
                </label>
              </div>
            </div>

            <div className="p-4 border-t border-slate-700 bg-slate-900/50">
              <button
                data-testid="confirm-create-room"
                onClick={handleConfirmCreate}
                disabled={isCreateSubmitting}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-wait transition rounded-lg font-bold py-3 shadow-lg"
              >
                {isCreateSubmitting ? '创建中...' : '确认创建并进入房间'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPublicRoomsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-md border border-slate-600 overflow-hidden flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center p-4 border-b border-slate-700 bg-slate-900/50">
              <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                <Globe size={20} className="text-blue-400" /> 公开房间列表
              </h2>
              <button data-testid="close-public-rooms" onClick={() => setShowPublicRoomsModal(false)} className="text-slate-400 hover:text-rose-400 transition"><X size={24} /></button>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              {isLoadingRooms ? (
                <div className="text-center text-slate-400 py-10 flex flex-col items-center gap-2">
                  <RefreshCw className="animate-spin text-emerald-400" size={32} />
                  <span>正在搜索可用房间...</span>
                </div>
              ) : publicRooms.length === 0 ? (
                <div className="text-center text-slate-400 py-10">目前没有可加入的公开房间，你可以自己创建一个。</div>
              ) : (
                <div className="space-y-3">
                  {publicRooms.map((room) => (
                    <RoomCard
                      key={room.roomId || room.id}
                      room={room}
                      onJoin={() => {
                        setShowPublicRoomsModal(false);
                        handleJoin(room.roomId || room.id);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-700 bg-slate-900/50">
              <button onClick={refreshPublicRooms} className="w-full bg-slate-700 hover:bg-slate-600 transition rounded-lg font-bold py-3 text-slate-200 shadow flex items-center justify-center gap-2">
                <RefreshCw size={18} /> 刷新列表
              </button>
            </div>
          </div>
        </div>
      )}

      {showHistoryModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-md border border-slate-600 overflow-hidden flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center p-4 border-b border-slate-700 bg-slate-900/50">
              <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                <History size={20} className="text-emerald-400" /> {selectedHistoryRoom ? '牌局记录' : '最近房间'}
              </h2>
              <button data-testid="close-room-history" onClick={() => { setShowHistoryModal(false); setSelectedHistoryRoom(null); }} className="text-slate-400 hover:text-rose-400 transition"><X size={24} /></button>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              {selectedHistoryRoom ? (
                <div>
                  <button
                    onClick={() => setSelectedHistoryRoom(null)}
                    className="mb-3 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-bold text-slate-300 transition hover:border-emerald-500 hover:text-emerald-300"
                  >
                    返回最近房间
                  </button>
                  <div className="mb-3 rounded-lg border border-slate-700 bg-slate-950/70 p-3">
                    <div className="text-sm text-slate-500">房号</div>
                    <div className="mt-1 font-mono text-xl font-black tracking-widest text-white">{selectedHistoryRoom.roomId || selectedHistoryRoom.id}</div>
                  </div>
                  <div className="space-y-3">
                    {(selectedHistoryRoom.recentHands || []).map((hand) => (
                      <MiniHandHistoryCard key={hand.id || `${hand.handNumber}-${hand.endedAt}`} hand={hand} />
                    ))}
                  </div>
                </div>
              ) : isLoadingHistory ? (
                <div className="text-center text-slate-400 py-10 flex flex-col items-center gap-2">
                  <RefreshCw className="animate-spin text-emerald-400" size={32} />
                  <span>正在整理最近房间...</span>
                </div>
              ) : roomHistory.length === 0 ? (
                <div className="text-center text-slate-400 py-10">你还没有最近房间记录。</div>
              ) : (
                <div className="space-y-3">
                  {roomHistory.map((room) => (
                    <RoomCard
                      key={room.roomId || room.id}
                      room={room}
                      onJoin={() => {
                        if (room.canRejoin === false) return;
                        setShowHistoryModal(false);
                        handleJoin(room.roomId || room.id);
                      }}
                      onOpenHistory={() => setSelectedHistoryRoom(room)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-700 bg-slate-900/50">
              <button onClick={() => { setSelectedHistoryRoom(null); refreshRoomHistory(); }} className="w-full bg-slate-700 hover:bg-slate-600 transition rounded-lg font-bold py-3 text-slate-200 shadow flex items-center justify-center gap-2">
                <RefreshCw size={18} /> 刷新最近房间
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
