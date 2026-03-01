import React, { useState } from 'react';
import { Play, AlertCircle, Search, Globe, Lock, Settings, X, List, Users, RefreshCw } from 'lucide-react';

export default function Lobby({ onCreateRoom, onJoinRoom, onFetchPublicRooms, errorMsg }) {
  const [playerName, setPlayerName] = useState(() => {
    try { return localStorage.getItem('pokerPlayerName') || ''; } catch { return ''; }
  });
  const [gameType, setGameType] = useState('texas');
  const [joinRoomId, setJoinRoomId] = useState('');
  
  // 创建房间时的设置弹窗状态
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreatingPublic, setIsCreatingPublic] = useState(true);
  const [settings, setSettings] = useState({
    initialChips: 1000,
    timeLimit: 30, 
    allowJoinDuringGame: true,
    doubleBlinds: false,
    autoTopUp: false
  });

  // 公开房间列表弹窗状态
  const [showPublicRoomsModal, setShowPublicRoomsModal] = useState(false);
  const [publicRooms, setPublicRooms] = useState([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);

  const handleOpenCreateModal = (isPublic) => {
    if (!playerName.trim()) return alert("请先输入你的名字！");
    try { localStorage.setItem('pokerPlayerName', playerName); } catch {}
    setIsCreatingPublic(isPublic);
    setShowCreateModal(true);
  };

  const handleConfirmCreate = () => {
    onCreateRoom(playerName, gameType, isCreatingPublic, settings);
    setShowCreateModal(false);
  };

  const handleAction = (actionFn, ...args) => {
    if (!playerName.trim()) return alert("请先输入你的名字！");
    try { localStorage.setItem('pokerPlayerName', playerName); } catch {}
    actionFn(...args);
  };

  // 打开并获取公开房间列表
  const handleOpenPublicRooms = async () => {
    if (!playerName.trim()) return alert("请先输入你的名字！");
    try { localStorage.setItem('pokerPlayerName', playerName); } catch {}
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

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans text-slate-100 relative">
      <div className="bg-slate-800 p-8 rounded-xl shadow-2xl w-full max-w-md border border-slate-700">
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
              onChange={e => { 
                setPlayerName(e.target.value); 
                try { localStorage.setItem('pokerPlayerName', e.target.value); } catch {}
              }} 
              className="w-full bg-slate-900 border border-slate-600 rounded-lg py-3 px-4 text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition" 
              placeholder="例如：发哥" 
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">选择游戏</label>
            <div className="flex gap-2">
              <button onClick={() => setGameType('texas')} className={`flex-1 py-3 rounded-lg font-bold transition border ${gameType === 'texas' ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>德州扑克</button>
              <button disabled className="flex-1 py-3 rounded-lg font-bold bg-slate-900 border border-slate-800 text-slate-600 cursor-not-allowed">斗地主 (开发中)</button>
            </div>
          </div>

          <div className="border-t border-slate-700 my-4"></div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">创建新房间</label>
            <div className="flex gap-2">
              <button onClick={() => handleOpenCreateModal(true)} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition border bg-blue-600/20 border-blue-500 text-blue-400 hover:bg-blue-600/30">
                <Globe size={16} /> 创建公开房间
              </button>
              <button onClick={() => handleOpenCreateModal(false)} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition border bg-rose-600/20 border-rose-500 text-rose-400 hover:bg-rose-600/30">
                <Lock size={16} /> 创建私密房间
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2 text-center">公开房间无房主；私密房间创建者将成为房主</p>
          </div>

          <div className="border-t border-slate-700 my-4"></div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">加入房间</label>
            {/* 新的浏览公开房间按钮 */}
            <button onClick={handleOpenPublicRooms} className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 transition rounded-lg font-bold py-3 mb-3 shadow-lg">
              <List size={18} /> 浏览公开房间
            </button>
            
            <div className="flex gap-2">
              <input type="text" maxLength={4} value={joinRoomId} onChange={e => setJoinRoomId(e.target.value.toUpperCase())} className="w-1/2 bg-slate-900 border border-slate-600 rounded-lg py-3 px-4 text-white text-center tracking-widest font-mono outline-none focus:border-emerald-500" placeholder="4位房间号" />
              <button onClick={() => handleAction(onJoinRoom, playerName, joinRoomId)} className="w-1/2 flex items-center justify-center gap-1 bg-slate-700 hover:bg-slate-600 transition rounded-lg font-bold py-3">
                <Search size={18} /> 搜索加入
              </button>
            </div>
          </div>
        </div>

        {errorMsg && <div className="mt-6 flex items-center gap-2 text-rose-400 bg-rose-400/10 p-3 rounded-lg text-sm border border-rose-400/20"><AlertCircle size={16} /> {errorMsg}</div>}
      </div>

      {/* 创建房间时的设置确认弹窗 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-md border border-slate-600 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-4 border-b border-slate-700 bg-slate-900/50">
              <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                <Settings size={20} className="text-emerald-400"/> 创建{isCreatingPublic ? '公开' : '私密'}房间设置
              </h2>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white"><X size={20}/></button>
            </div>
            
            <div className="p-6 space-y-5 overflow-y-auto">
              <div>
                <div className="text-slate-300 font-medium mb-2">初始筹码</div>
                <div className="flex gap-2 mb-2">
                  {[500, 1000, 2000].map(val => (
                    <button key={val} onClick={() => setSettings({...settings, initialChips: val})} className={`flex-1 py-2 rounded font-bold border transition ${settings.initialChips === val ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}>{val}</button>
                  ))}
                </div>
                <input type="number" value={settings.initialChips} onChange={e => setSettings({...settings, initialChips: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white outline-none focus:border-emerald-500" placeholder="自定义初始筹码" />
              </div>

              <div>
                <div className="text-slate-300 font-medium mb-2">每步思考时长</div>
                <div className="flex gap-2 mb-2">
                  {[10, 30, '无限'].map(val => (
                    <button key={val} onClick={() => setSettings({...settings, timeLimit: val})} className={`flex-1 py-2 rounded font-bold border transition ${settings.timeLimit === val ? 'bg-blue-600 text-white border-blue-500 shadow-lg' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}>{val === '无限' ? val : `${val}s`}</button>
                  ))}
                </div>
                {typeof settings.timeLimit === 'number' && (
                  <input type="number" value={settings.timeLimit} onChange={e => setSettings({...settings, timeLimit: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white outline-none focus:border-blue-500" placeholder="自定义秒数" />
                )}
              </div>

              <div className="space-y-3 pt-4 border-t border-slate-700">
                <label className="flex items-center justify-between text-slate-300 cursor-pointer group">
                  <span className="group-hover:text-emerald-400 transition">允许对局中途添加他人 (下局进入)</span>
                  <input type="checkbox" checked={settings.allowJoinDuringGame} onChange={e => setSettings({...settings, allowJoinDuringGame: e.target.checked})} className="w-5 h-5 accent-emerald-500" />
                </label>
                <label className="flex items-center justify-between text-slate-300 cursor-pointer group">
                  <span className="group-hover:text-emerald-400 transition">盲注每5局自动翻倍</span>
                  <input type="checkbox" checked={settings.doubleBlinds} onChange={e => setSettings({...settings, doubleBlinds: e.target.checked})} className="w-5 h-5 accent-emerald-500" />
                </label>
                <label className="flex items-center justify-between text-slate-300 cursor-pointer group">
                  <span className="group-hover:text-emerald-400 transition">自动补码 (输光补初始筹码的一半)</span>
                  <input type="checkbox" checked={settings.autoTopUp} onChange={e => setSettings({...settings, autoTopUp: e.target.checked})} className="w-5 h-5 accent-emerald-500" />
                </label>
              </div>
            </div>

            <div className="p-4 border-t border-slate-700 bg-slate-900/50">
              <button onClick={handleConfirmCreate} className="w-full bg-emerald-600 hover:bg-emerald-500 transition rounded-lg font-bold py-3 shadow-lg">确认创建并进入房间</button>
            </div>
          </div>
        </div>
      )}

      {/* 公开房间列表弹窗 */}
      {showPublicRoomsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-md border border-slate-600 overflow-hidden flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center p-4 border-b border-slate-700 bg-slate-900/50">
              <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                <Globe size={20} className="text-blue-400"/> 公开房间列表
              </h2>
              <button onClick={() => setShowPublicRoomsModal(false)} className="text-slate-400 hover:text-rose-400 transition"><X size={24}/></button>
            </div>
            
            <div className="p-4 overflow-y-auto flex-1">
               {isLoadingRooms ? (
                 <div className="text-center text-slate-400 py-10 flex flex-col items-center gap-2">
                   <RefreshCw className="animate-spin text-emerald-400" size={32} />
                   <span>正在搜索可用的房间...</span>
                 </div>
               ) : publicRooms.length === 0 ? (
                 <div className="text-center text-slate-400 py-10">目前没有可加入的公开房间，你可以自己创建一个！</div>
               ) : (
                 <div className="space-y-3">
                   {publicRooms.map(room => (
                     <div key={room.id} className="flex justify-between items-center bg-slate-900 p-4 rounded-lg border border-slate-700 shadow hover:border-slate-500 transition group">
                       <div>
                         <div className="text-white font-bold tracking-widest text-lg group-hover:text-emerald-400 transition">房号: {room.id}</div>
                         <div className="text-sm text-slate-400 mt-1 flex items-center gap-1">
                           <Users size={14} /> 玩家人数: {room.players.length} / 9
                         </div>
                       </div>
                       <button
                         onClick={() => {
                           setShowPublicRoomsModal(false);
                           handleAction(onJoinRoom, playerName, room.id);
                         }}
                         className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg font-bold transition shadow-md"
                       >
                         加入
                       </button>
                     </div>
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
    </div>
  );
}