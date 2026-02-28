import React, { useState, useEffect, useRef } from 'react';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { Play, LogOut, Copy, CheckCircle2, Settings, Crown, UserPlus, Coins, X, ShieldAlert, Timer, UserCheck, UserMinus, Pause, PlayCircle, Users } from 'lucide-react';
import { db, globalAppId } from '../firebase';
import { createDeck, evaluate7Cards, CardUI } from '../utils/pokerLogic';

export default function PokerGame({ user, roomId, roomData, onLeaveRoom }) {
  const [copySuccess, setCopySuccess] = useState(false);
  const [raiseInput, setRaiseInput] = useState(0);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [localSettings, setLocalSettings] = useState(roomData?.settings || {});
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [topUpAmount, setTopUpAmount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  
  // 日志自动滚动 Ref
  const logsEndRef = useRef(null);

  const myPlayerInfo = roomData?.players.find(p => p.uid === user?.uid);
  const isMyTurn = roomData?.status !== 'waiting' && roomData?.status !== 'showdown' && roomData?.players[roomData?.turnIndex]?.uid === user?.uid && !roomData?.isPaused;
  const isHost = roomData?.hostUid === user?.uid && user?.uid != null;
  const isCreator = roomData?.creatorUid === user?.uid; 
  const isPendingApproval = !roomData?.isPublic && !myPlayerInfo && roomData?.joinRequests?.some(r => r.uid === user?.uid);

  // 加注计算
  let callAmount = 0, maxBet = 0, minRaiseTarget = 0, potAfterCall = 0;
  if (myPlayerInfo && roomData && roomData.status !== 'waiting') {
    callAmount = roomData.currentBet - myPlayerInfo.bet;
    maxBet = myPlayerInfo.chips + myPlayerInfo.bet; 
    minRaiseTarget = Math.min(roomData.currentBet + 20, maxBet); 
    potAfterCall = roomData.pot + callAmount;
  }

  // 实时计算自己的当前牌型
  const myCurrentHandInfo = React.useMemo(() => {
    if (myPlayerInfo && myPlayerInfo.hand && myPlayerInfo.hand.length > 0 && roomData && roomData.status !== 'waiting') {
      return evaluate7Cards(myPlayerInfo.hand, roomData.communityCards || []);
    }
    return null;
  }, [myPlayerInfo?.hand, roomData?.communityCards, roomData?.status]);

  // ==== 1. 倒计时功能 (自动过牌/弃牌) ====
  useEffect(() => {
    if (roomData?.status === 'waiting' || roomData?.status === 'showdown' || roomData?.isPaused) return;
    if (roomData?.settings?.timeLimit === '无限') return;

    setTimeLeft(roomData.settings.timeLimit);
    const timerId = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          if (isMyTurn) handleAction(callAmount === 0 ? 'call' : 'fold'); 
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerId);
  }, [roomData?.turnIndex, roomData?.status, roomData?.isPaused, isMyTurn, callAmount]);

  // ==== 2. 自动开局逻辑 (5秒轮转) ====
  useEffect(() => {
    let timeoutId;
    const seatedPlayers = roomData?.players.filter(p => !p.isSittingOut).length;
    
    if (roomData?.status === 'showdown' && !roomData.isPaused && seatedPlayers >= 2) {
      const managerUid = roomData.hostUid || roomData.creatorUid || roomData.players[0]?.uid;
      if (user.uid === managerUid) {
        timeoutId = setTimeout(() => startGame(), 5000);
      }
    }
    return () => clearTimeout(timeoutId);
  }, [roomData?.status, roomData?.isPaused, roomData?.players]);

  // ==== 3. 退出页面自动站起 (断线保护) ====
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (myPlayerInfo && !myPlayerInfo.isSittingOut) {
        // 在页面关闭前，同步发送一个请求，将玩家设为观战与弃牌
        const nextData = JSON.parse(JSON.stringify(roomData));
        const me = nextData.players.find(p => p.uid === user.uid);
        if (me) {
          me.isSittingOut = true;
          if (nextData.status !== 'waiting' && nextData.status !== 'showdown') {
            me.folded = true;
            me.hasActed = true;
          }
          setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), nextData);
        }
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [roomData, myPlayerInfo, user?.uid, roomId]);

  // ==== 4. 3分钟无人活跃自动销毁房间 ====
  useEffect(() => {
    const seatedPlayers = roomData?.players.filter(p => !p.isSittingOut).length || 0;
    const managerUid = roomData?.hostUid || roomData?.creatorUid || roomData?.players[0]?.uid;
    
    let gcTimer;
    // 只有房主或第一顺位玩家有权限执行销毁，防止多人同时发送删除请求
    if (seatedPlayers <= 1 && user?.uid === managerUid) {
      gcTimer = setTimeout(async () => {
        try {
          await deleteDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId));
          console.log("房间长时间无活跃，已清理");
        } catch (err) {
          console.error("解散房间失败", err);
        }
      }, 3 * 60 * 1000); // 3分钟
    }
    return () => clearTimeout(gcTimer);
  }, [roomData?.players, roomData?.hostUid, roomData?.creatorUid, user?.uid, roomId]);

  // ==== 5. 聊天记录自动滚动 ====
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [roomData?.logs]);

  useEffect(() => { if (isMyTurn) setRaiseInput(minRaiseTarget); }, [isMyTurn, minRaiseTarget]);

  const calcPotRaise = (fraction) => Math.min(maxBet, Math.floor(roomData.currentBet + potAfterCall * fraction));
  const addLog = (data, msg) => {
    let newLogs = [...data.logs, msg];
    if (newLogs.length > 50) newLogs = newLogs.slice(newLogs.length - 50); // 增加日志保留条数
    return newLogs;
  };

  // ---------------- 房间管理操作 ----------------
  const handleApproveJoin = async (reqUid, reqName, approve) => {
    if (!isHost) return;
    let nextData = JSON.parse(JSON.stringify(roomData));
    nextData.joinRequests = nextData.joinRequests.filter(r => r.uid !== reqUid);
    if (approve) {
      const isGameOngoing = nextData.status !== 'waiting' && nextData.status !== 'showdown';
      nextData.players.push({
        uid: reqUid, name: reqName, chips: roomData.settings.initialChips, 
        hand: [], bet: 0, folded: isGameOngoing, allIn: false, hasActed: isGameOngoing, isSittingOut: false, lastAction: null
      });
      nextData.logs = addLog(nextData, `✅ 房主同意了 ${reqName} 加入房间。`);
    }
    await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), nextData);
  };

  const handleTogglePause = async () => {
    if (!isHost) return;
    await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), {
      ...roomData, isPaused: !roomData.isPaused, logs: addLog(roomData, `⏸️ 房主${!roomData.isPaused ? '暂停' : '恢复'}了对局。`)
    });
  };

  const handleToggleSit = async () => {
    if (!myPlayerInfo) return;
    let nextData = JSON.parse(JSON.stringify(roomData));
    let me = nextData.players.find(p => p.uid === user.uid);
    me.isSittingOut = !me.isSittingOut;
    
    if (me.isSittingOut && nextData.status !== 'waiting' && nextData.status !== 'showdown' && !me.folded) {
      me.folded = true;
      me.hasActed = true;
      nextData.logs = addLog(nextData, `🚶 ${me.name} 站起观战并弃牌。`);
      await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), nextData);
      await advanceGameState(nextData); 
      return;
    }
    nextData.logs = addLog(nextData, `🪑 ${me.name} 选择${me.isSittingOut ? '站起观战' : '坐下参与'}。`);
    await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), nextData);
  };

  const handleSaveSettings = async () => {
    if (!isHost) return;
    await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), {
      ...roomData, settings: localSettings, logs: addLog(roomData, '⚙️ 房主修改了房间设置 (下一局生效)')
    });
    setShowSettingsModal(false);
  };

  const handlePlayerActionMenu = async (actionType) => {
    if (!isHost || !selectedPlayer) return;
    let nextData = JSON.parse(JSON.stringify(roomData));
    if (actionType === 'kick') {
      nextData.players = nextData.players.filter(p => p.uid !== selectedPlayer.uid);
      nextData.logs = addLog(nextData, `👢 房主将 ${selectedPlayer.name} 踢出房间。`);
      if (nextData.status !== 'waiting' && nextData.players[nextData.turnIndex]?.uid === selectedPlayer.uid) nextData.players.forEach(p => p.hasActed = false);
    } 
    else if (actionType === 'transfer') nextData.hostUid = selectedPlayer.uid;
    else if (actionType === 'topup') {
      nextData.players.find(p => p.uid === selectedPlayer.uid).chips += topUpAmount;
      nextData.logs = addLog(nextData, `💰 房主为 ${selectedPlayer.name} 补充了 ${topUpAmount} 筹码。`);
    }
    await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), nextData);
    setSelectedPlayer(null);
  };

  const handleLeave = async () => {
    if (myPlayerInfo) {
      let nextData = JSON.parse(JSON.stringify(roomData));
      nextData.players = nextData.players.filter(p => p.uid !== user.uid);
      if (isHost) nextData.hostUid = null;
      await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), nextData);
    }
    onLeaveRoom();
  };

  // ---------------- 游戏核心逻辑 ----------------

  const startGame = async () => {
    const seatedPlayers = roomData.players.filter(p => !p.isSittingOut);
    if (seatedPlayers.length < 2) {
       if (roomData.status !== 'waiting') {
         await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), { ...roomData, status: 'waiting' });
       }
       return;
    }

    let deck = createDeck();
    let logs = [...roomData.logs];
    let handCount = (roomData.handCount || 0) + 1;
    let baseBlind = 10;
    
    if (roomData.settings.doubleBlinds) baseBlind = baseBlind * Math.pow(2, Math.floor((handCount - 1) / 5));

    let players = roomData.players.map(p => {
      let currentChips = p.chips;
      if (currentChips <= 0 && roomData.settings.autoTopUp && !p.isSittingOut) {
        const topUpValue = Math.floor(roomData.settings.initialChips / 2);
        currentChips += topUpValue;
        logs.push(`💸 ${p.name} 触发自动补码 (+${topUpValue})。`);
      }
      return { 
        ...p, 
        chips: currentChips, 
        hand: [], 
        bet: 0, 
        folded: currentChips <= 0 || p.isSittingOut, 
        allIn: false, 
        hasActed: false, 
        lastAction: null, 
        rankName: null,
        showCards: false,
        totalContribution: 0
      };
    });

    let nextDealerIndex = (roomData.dealerIndex + 1) % players.length;
    while (players[nextDealerIndex].folded) nextDealerIndex = (nextDealerIndex + 1) % players.length;
    
    let sbIndex, bbIndex;
    if (players.length === 2) {
      sbIndex = nextDealerIndex;      // 2人局：庄家就是小盲
      bbIndex = 1 - nextDealerIndex;  // 另一位是大盲
    } else {
      sbIndex = (nextDealerIndex + 1) % players.length;
      while (players[sbIndex].folded) sbIndex = (sbIndex + 1) % players.length;
      bbIndex = (sbIndex + 1) % players.length;
      while (players[bbIndex].folded) bbIndex = (bbIndex + 1) % players.length;
    }
    
    let utgIndex = (bbIndex + 1) % players.length;
    while (players[utgIndex].folded) utgIndex = (utgIndex + 1) % players.length;

    const sbAmount = Math.min(baseBlind, players[sbIndex].chips);
    const bbAmount = Math.min(baseBlind * 2, players[bbIndex].chips);
    
    // 小盲注投入记录
    players[sbIndex].chips -= sbAmount; 
    players[sbIndex].bet += sbAmount; 
    players[sbIndex].totalContribution = sbAmount; // <--- 新增：记录小盲初始投入
    players[sbIndex].allIn = players[sbIndex].chips === 0; 
    players[sbIndex].lastAction = 'SB';

    // 大盲注投入记录
    players[bbIndex].chips -= bbAmount; 
    players[bbIndex].bet += bbAmount; 
    players[bbIndex].totalContribution = bbAmount; // <--- 新增：记录大盲初始投入
    players[bbIndex].allIn = players[bbIndex].chips === 0; 
    players[bbIndex].lastAction = 'BB';

    let pot = sbAmount + bbAmount;

    players.forEach(p => { if (!p.folded) { p.hand = [deck.pop(), deck.pop()]; } });

    logs.push(`--- 第 ${handCount} 局开始 (盲注: ${baseBlind}/${baseBlind*2}) ---`);

    const newRoomState = {
      ...roomData, status: 'pre-flop', isPaused: false, dealerIndex: nextDealerIndex, turnIndex: utgIndex,
      deck: deck, communityCards: [], pot: pot, currentBet: baseBlind * 2, players: players, logs: logs, handCount: handCount, lastAggressorUid: null
    };
    await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), newRoomState);
  };

  const advanceGameState = async (currentState) => {
    let nextState = JSON.parse(JSON.stringify(currentState));
    const activeContenders = nextState.players.filter(p => !p.folded);

    // 1. 唯一结算入口：当状态为 showdown 时执行
    if (nextState.status === 'showdown') {
      const baseContenders = nextState.players
        .filter(p => !p.folded)
        .map(p => {
          const { score, rankName } = evaluate7Cards(p.hand, nextState.communityCards);
          return { ...p, _score: score, _rankName: rankName, winAmount: 0 };
        });
      
      // 正规开牌 (Auto-Muck) 逻辑
      // === 核心逻辑：确定开牌的起始座位索引 ===
      let startIndex = -1;
      const playerCount = nextState.players.length;

      // 规则 A：如果有最后加注者，且他没有弃牌，从他开始亮牌
      if (nextState.lastAggressorUid) {
         const agIdx = nextState.players.findIndex(p => p.uid === nextState.lastAggressorUid);
         if (agIdx !== -1 && !nextState.players[agIdx].folded) {
             startIndex = agIdx;
         }
      }
      
      // 规则 B：如果河牌圈大家都是 Check 过牌（没有加注者），从小盲位（庄家下一位）开始
      if (startIndex === -1) {
         startIndex = (nextState.dealerIndex + 1) % playerCount;
      }

      // === 按真实顺时针顺序排列参与比牌的玩家 ===
      const orderedContenders = [];
      for (let i = 0; i < playerCount; i++) {
        const seatIndex = (startIndex + i) % playerCount;
        const playerAtSeat = baseContenders.find(c => c.uid === nextState.players[seatIndex].uid);
        if (playerAtSeat) {
          orderedContenders.push(playerAtSeat);
        }
      }

      // === 正规开牌 (Auto-Muck) 执行 ===
      const isAllInShowdown = orderedContenders.some(c => c.allIn);
      let currentBestScore = -1;

      orderedContenders.forEach(c => {
        const pIndex = nextState.players.findIndex(p => p.uid === c.uid);
        nextState.players[pIndex].rankName = c._rankName; // 保存牌型
        
        // 如果有 All-in 或牌力 >= 当前桌上最大牌力，则亮牌
        if (isAllInShowdown || c._score >= currentBestScore) {
          nextState.players[pIndex].showCards = true;
          currentBestScore = Math.max(currentBestScore, c._score);
        } else {
          nextState.players[pIndex].showCards = false; // 自动盖牌 (Muck)
        }
      });

      const contenders = baseContenders; // 将排好序的结果交接回原有的 contenders 变量，确保分池逻辑不受影响
      
      const contributionMap = {};
      nextState.players.forEach(p => { contributionMap[p.uid] = p.totalContribution || 0; });

      let remainingPot = nextState.pot;
      while (remainingPot > 0) {
        const activeContenders = contenders.filter(c => contributionMap[c.uid] > 0);
        if (activeContenders.length === 0) break;

        const maxScore = Math.max(...activeContenders.map(c => c._score));
        const winners = activeContenders.filter(c => c._score === maxScore);
        const minContribution = Math.min(...winners.map(w => contributionMap[w.uid]));
        
        let currentLevelPool = 0;
        Object.keys(contributionMap).forEach(uid => {
          const take = Math.min(contributionMap[uid], minContribution);
          currentLevelPool += take;
          contributionMap[uid] -= take;
        });

        const share = Math.floor(currentLevelPool / winners.length);
        winners.forEach(w => {
          const idx = contenders.findIndex(c => c.uid === w.uid);
          contenders[idx].winAmount += share;
        });
        // 处理余数给第一个胜者
        if (currentLevelPool % winners.length > 0) {
          const firstWinnerIdx = contenders.findIndex(c => c.uid === winners[0].uid);
          contenders[firstWinnerIdx].winAmount += (currentLevelPool % winners.length);
        }
        remainingPot -= currentLevelPool;
      }

      const winLogs = [];
      contenders.forEach(c => {
        if (c.winAmount > 0) {
          const pIndex = nextState.players.findIndex(p => p.uid === c.uid);
          nextState.players[pIndex].chips += c.winAmount;
          winLogs.push(`【${c.name}】(${c._rankName}) 赢得了 ${c.winAmount}`);
        }
      });

      nextState.logs = addLog(nextState, `🏆 结算完成：${winLogs.join('，')}！`);
      nextState.pot = 0;
      nextState.currentBet = 0;
      nextState.players.forEach(p => { p.bet = 0; p.hasActed = false; p.lastAction = null; p.totalContribution = 0; });

      await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), nextState);
      return; 
    }

    // 2. 判定弃牌获胜（场上仅剩1人）
    if (activeContenders.length === 1) {
      const winner = activeContenders[0];
      const totalWon = nextState.pot;
      winner.chips += totalWon;
      winner.showCards = false;
      nextState.logs = addLog(nextState, `🏆 玩家【${winner.name}】获胜，赢得底池 ${totalWon}！`);
      
      nextState.status = 'showdown';
      nextState.pot = 0;
      nextState.currentBet = 0;
      nextState.players.forEach(p => { p.bet = 0; p.hasActed = false; p.lastAction = null; p.totalContribution = 0; });

      // 关键：删除递归调用，直接保存并退出
      await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), nextState);
      return;
    }

    // 3. 检查当前操作轮是否完成
    const needToAct = nextState.players.filter(p => !p.folded && !p.allIn);
    const isRoundComplete = needToAct.every(p => p.hasActed && p.bet === nextState.currentBet);

    // 如果有 2 个或更多人能动，且轮次没完，必须等待。
    // 如果只有 1 个人能动，但他目前的下注还没跟平最高注（比如被全下玩家盖过了），他也必须手动点 Call 或 Fold。
    const mustWait = (needToAct.length >= 2 && !isRoundComplete) || 
                    (needToAct.length === 1 && needToAct[0].bet < nextState.currentBet);

    if (mustWait) {
      let nextTurn = (nextState.turnIndex + 1) % nextState.players.length;
      while (nextState.players[nextTurn].folded || nextState.players[nextTurn].allIn) {
        nextTurn = (nextTurn + 1) % nextState.players.length;
      }
      
      nextState.turnIndex = nextTurn;
      await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), nextState);
      return;
    }

    // 4. 运行到这里说明本轮结束，推进阶段
    nextState.players.forEach(p => { p.bet = 0; p.hasActed = false; p.lastAction = null; });
    nextState.currentBet = 0;

    if (nextState.status === 'pre-flop') {
      nextState.status = 'flop';
      nextState.lastAggressorUid = null;
      nextState.communityCards.push(nextState.deck.pop(), nextState.deck.pop(), nextState.deck.pop());
      nextState.logs = addLog(nextState, `🃏 翻牌: ${nextState.communityCards.join(' ')}`);
    } else if (nextState.status === 'flop') {
      nextState.status = 'turn';
      nextState.lastAggressorUid = null;
      nextState.communityCards.push(nextState.deck.pop());
      nextState.logs = addLog(nextState, `🃏 转牌: ${nextState.communityCards[3]}`);
    } else if (nextState.status === 'turn') {
      nextState.status = 'river';
      nextState.lastAggressorUid = null;
      nextState.communityCards.push(nextState.deck.pop());
      nextState.logs = addLog(nextState, `🃏 河牌: ${nextState.communityCards[4]}`);
    } else if (nextState.status === 'river') {
      nextState.status = 'showdown';
      await advanceGameState(nextState); // 递归进入结算并返回
      return;
    }

    // 5. 决定是自动跑下一阶段还是等待玩家
    // 如果可行动人数 <= 1，且场上还有 2 个以上的人在竞争（说明有人全下了），自动跑牌
    if (needToAct.length <= 1 && activeContenders.length >= 2) {
      await advanceGameState(nextState); // 递归：自动发下一张牌或结算
      return; 
    } else if (activeContenders.length >= 2) {
      // 正常多玩家对局：定位第一个行动者并停止函数，等待 Firebase 同步给前端
      let nextTurn = (nextState.dealerIndex + 1) % nextState.players.length;
      while (nextState.players[nextTurn].folded || nextState.players[nextTurn].allIn) {
        nextTurn = (nextTurn + 1) % nextState.players.length;
      }
      nextState.turnIndex = nextTurn;
      await setDoc(doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId), nextState);
    }
  };

  const handleAction = async (actionType, amount = 0) => {
    if (!roomData || roomData.players[roomData.turnIndex].uid !== user.uid) return;
    let nextState = JSON.parse(JSON.stringify(roomData));
    const meIndex = nextState.turnIndex;
    const me = nextState.players[meIndex];
    const callAmount = nextState.currentBet - me.bet;

    if (actionType === 'fold') {
      me.folded = true; me.lastAction = 'fold';
      nextState.logs = addLog(nextState, `${me.name} 弃牌`);
    } 
    else if (actionType === 'call') {
      const actualCall = Math.min(callAmount, me.chips);
      me.chips -= actualCall; 
      me.bet += actualCall; 
      nextState.pot += actualCall;
      
      me.totalContribution = (me.totalContribution || 0) + actualCall; 
      
      if (me.chips === 0) me.allIn = true;
      me.lastAction = me.allIn ? 'allin' : (callAmount === 0 ? 'check' : 'call');
      const actName = callAmount === 0 ? '看牌' : '跟注';
      nextState.logs = addLog(nextState, `${me.name} ${actName} ${actualCall > 0 ? actualCall : ''}`);
    }
    else if (actionType === 'raise') {
      const totalToBet = amount; 
      const additionalNeeded = totalToBet - me.bet;
      const actualPutIn = Math.min(additionalNeeded, me.chips);
      
      me.chips -= actualPutIn; 
      me.bet += actualPutIn; 
      nextState.pot += actualPutIn;
      
      me.totalContribution = (me.totalContribution || 0) + actualPutIn; 
      
      nextState.currentBet = me.bet;
      if (me.chips === 0) me.allIn = true;
      me.lastAction = me.allIn ? 'allin' : 'raise';

      nextState.lastAggressorUid = me.uid;
      nextState.logs = addLog(nextState, `${me.name} 加注到 ${me.bet}`);
      nextState.players.forEach((p, idx) => { if (idx !== meIndex && !p.folded && !p.allIn) p.hasActed = false; });
    }

    me.hasActed = true;
    await advanceGameState(nextState);
  };

  const getActionColor = (action) => {
    if (action === 'allin') return 'bg-rose-600 text-white border-rose-400';
    if (action === 'raise') return 'bg-amber-400 text-amber-950 border-amber-200';
    return 'bg-blue-500 text-white border-blue-300'; // call or check
  };

  return (
    <div className="h-screen bg-slate-900 text-slate-200 font-sans flex flex-col relative overflow-hidden">
      
      {/* 顶部导航 */}
      <div className="bg-slate-800 border-b border-slate-700 p-4 flex justify-between items-center shadow-md z-20 flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="font-bold text-xl text-emerald-400 flex items-center gap-2"><Play size={24} /> 德州扑克</div>
          <div className="bg-slate-700 px-3 py-1 rounded-full text-sm font-mono flex items-center gap-2 cursor-pointer hover:bg-slate-600 transition" onClick={() => { navigator.clipboard.writeText(roomId); setCopySuccess(true); setTimeout(()=>setCopySuccess(false), 2000); }}>
            房间号: <span className="text-white tracking-widest">{roomId}</span> {copySuccess ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} />}
          </div>
          {roomData.isPublic === false && <span className="text-xs bg-rose-900 text-rose-300 px-2 py-1 rounded border border-rose-700">私密</span>}
          
          <div className="hidden md:flex items-center gap-3 ml-4 bg-slate-900/50 px-3 py-1 rounded-full border border-slate-700 text-sm">
            <span>当前盲注: <span className="text-amber-400 font-bold">{Math.min(10 * Math.pow(2, Math.floor(((roomData.handCount||1) - 1) / 5)), 10)} / {Math.min(20 * Math.pow(2, Math.floor(((roomData.handCount||1) - 1) / 5)), 20)}</span></span>
            {roomData.settings.doubleBlinds && <span className="text-slate-400 text-xs">(局数 {((roomData.handCount||1)-1)%5 + 1}/5)</span>}
          </div>
        </div>
        <div className="flex items-center gap-4">
          {isHost && (
            <button onClick={handleTogglePause} className={`flex items-center gap-1 text-sm px-3 py-1 rounded ${roomData.isPaused ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
              {roomData.isPaused ? <PlayCircle size={16} /> : <Pause size={16} />} {roomData.isPaused ? '恢复对局' : '暂停对局'}
            </button>
          )}
          <button onClick={() => { setLocalSettings(roomData.settings); setShowSettingsModal(true); }} className="text-slate-400 hover:text-white flex items-center gap-1 text-sm"><Settings size={16} /> 房间设置</button>
          <button onClick={handleLeave} className="text-slate-400 hover:text-white flex items-center gap-1 text-sm"><LogOut size={16} /> 退出</button>
        </div>
      </div>

      {isHost && roomData.joinRequests?.length > 0 && (
        <div className="bg-amber-600/90 text-white px-4 py-2 flex flex-wrap gap-4 items-center justify-between z-20 shadow-md flex-shrink-0">
          <div className="flex items-center gap-2 text-sm font-bold"><UserPlus size={16} /> 申请加入：</div>
          <div className="flex gap-4">
            {roomData.joinRequests.map(req => (
              <div key={req.uid} className="flex items-center gap-2 bg-slate-900/40 px-3 py-1 rounded-full text-sm">
                <span>{req.name}</span>
                <button onClick={() => handleApproveJoin(req.uid, req.name, true)} className="text-emerald-300 hover:text-emerald-100 font-bold ml-2">同意</button>
                <button onClick={() => handleApproveJoin(req.uid, req.name, false)} className="text-rose-300 hover:text-rose-100 font-bold ml-2">拒绝</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 游戏主区域结构调整，防止底部面板被挤压出屏幕 */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        <div className="flex-1 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-800 to-slate-900 flex flex-col relative overflow-hidden">
          
          {roomData.isPaused && <div className="absolute inset-0 bg-black/40 z-10 flex items-center justify-center backdrop-blur-sm pointer-events-none"><h1 className="text-5xl font-black text-white tracking-widest drop-shadow-lg">对局已暂停</h1></div>}

          {/* 顶部: 对手与桌面 (可滚动区域) */}
          <div className="flex-1 overflow-y-auto flex flex-col p-4">
            {/* 对手头像 */}
            <div className="flex justify-center gap-4 md:gap-8 flex-wrap z-0 flex-shrink-0">
              {roomData.players.map((p, idx) => {
                if (p.uid === user.uid) return null;
                const isTurn = roomData.status !== 'waiting' && roomData.status !== 'showdown' && roomData.turnIndex === idx && !roomData.isPaused;
                const isDealer = roomData.dealerIndex === idx;
                return (
                  <div key={p.uid} onClick={() => { if (isHost) { setSelectedPlayer(p); setTopUpAmount(Math.floor(roomData.settings.initialChips / 2)); } }} className={`relative bg-slate-800/80 backdrop-blur rounded-xl p-3 border-2 w-32 md:w-40 flex flex-col items-center shadow-xl ${isHost ? 'cursor-pointer hover:border-blue-400' : ''} ${isTurn ? 'border-amber-400 shadow-amber-400/20' : 'border-slate-600'} ${p.folded ? 'opacity-50' : ''}`}>
                    {roomData.hostUid === p.uid && <div className="absolute -top-3 left-2 bg-slate-900 rounded-full p-1 border border-slate-700 z-10"><Crown size={16} className="text-amber-400" /></div>}
                    {isDealer && <div className="absolute -top-3 right-2 bg-white text-black text-[12px] w-6 h-6 rounded-full flex items-center justify-center font-black shadow-lg border-2 border-slate-900 z-10">D</div>}
                    {isTurn && timeLeft > 0 && <div className={`absolute -top-10 font-mono text-lg font-bold flex items-center gap-1 ${timeLeft <= 10 ? 'text-rose-500 animate-pulse' : 'text-amber-400'}`}><Timer size={18}/> {timeLeft}s</div>}

                    {roomData.status !== 'waiting' && p.bet > 0 && !p.folded && (
                      <div className={`absolute -right-6 top-1/4 font-black px-3 py-1 rounded-full shadow-lg border-2 z-20 text-sm flex items-center gap-1 animate-bounce ${getActionColor(p.lastAction)}`}>
                        <Coins size={14} /> {p.bet}
                      </div>
                    )}

                    <div className="font-bold truncate w-full text-center relative pt-1 text-slate-200">{p.name} {p.isSittingOut && '(观战)'}</div>
                    <div className="text-emerald-400 text-sm mt-1 font-mono">💰 {p.chips}</div>
                    
                    <div className="flex gap-1 mt-3 mb-1 relative">
                      {/* 结算阶段只有 showCards 为 true 才翻开牌面 */}
                      {p.hand && p.hand.length > 0 ? (roomData.status === 'showdown' && p.showCards ? p.hand.map((c, i) => <CardUI key={i} card={c} />) : <><CardUI hidden /><CardUI hidden /></>) : <div className="h-16 text-xs text-slate-500 flex items-center">等待发牌</div>}
                      {/* 结算阶段只有 showCards 为 true 的人才显示结算牌型 */}
                      {roomData.status === 'showdown' && p.showCards && p.rankName && <div className="absolute -bottom-3 w-full text-center bg-indigo-900 text-white text-xs py-0.5 rounded-full shadow border border-indigo-400 z-20">{p.rankName}</div>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 桌面中央区域 */}
            <div className="flex-1 flex flex-col items-center justify-center py-8 z-0 min-h-[200px]">
              {roomData.status === 'waiting' ? (
                <div className="text-center">
                  <h2 className="text-2xl font-bold mb-4 text-slate-300">等待玩家就绪... ({roomData.players.filter(p=>!p.isSittingOut).length}/9)</h2>
                  {(isHost || (!roomData.hostUid && isCreator)) ? (
                    <button onClick={startGame} className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold py-3 px-10 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.5)] transition transform hover:scale-105">开始首局游戏</button>
                  ) : (
                    <div className="text-slate-400 animate-pulse bg-slate-800/50 px-6 py-2 rounded-full">等待房主或创建者开局...</div>
                  )}
                </div>
              ) : (
                <div className="text-center">
                  <div className="bg-slate-900/80 backdrop-blur px-8 py-3 rounded-full border border-emerald-500/30 inline-flex flex-col items-center mb-6 shadow-xl">
                    <span className="text-slate-400 text-xs uppercase tracking-wider mb-1">当前底池 / Main Pot</span>
                    <span className="text-4xl font-black text-amber-400 flex items-center gap-2"><Coins size={28}/> {roomData.pot}</span>
                  </div>
                  <div className="flex justify-center gap-2 md:gap-4 h-24">
                    {[0, 1, 2, 3, 4].map(i => <CardUI key={i} card={roomData.communityCards[i]} />)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 底部: 玩家本人操作面板 (固定位置) */}
          {myPlayerInfo ? (
            <div className={`flex-none relative bg-slate-800 rounded-t-2xl border-t-4 p-4 md:p-6 flex flex-col md:flex-row items-center gap-6 shadow-[0_-10px_25px_rgba(0,0,0,0.3)] z-0 ${isMyTurn ? 'border-amber-400' : 'border-slate-700'} ${myPlayerInfo.isSittingOut ? 'opacity-70' : ''}`}>
              
              {isHost && <div className="absolute -top-4 left-6 bg-slate-900 rounded-full p-1.5 border border-slate-700 z-10"><Crown size={20} className="text-amber-400" /></div>}
              {roomData.dealerIndex === roomData.players.findIndex(p => p.uid === user.uid) && <div className="absolute -top-3 left-16 bg-white text-black text-[12px] w-6 h-6 rounded-full flex items-center justify-center font-black shadow-lg border-2 border-slate-900 z-10">D</div>}
              
              {isMyTurn && timeLeft > 0 && <div className={`absolute -top-10 left-1/2 transform -translate-x-1/2 font-mono text-2xl font-black flex items-center gap-2 ${timeLeft <= 10 ? 'text-rose-500 animate-pulse' : 'text-amber-400'}`}><Timer size={24}/> {timeLeft}s</div>}

              <div className="flex items-center gap-6 min-w-max pt-2">
                <div className="flex gap-2 relative">
                  {myPlayerInfo.hand && myPlayerInfo.hand.length > 0 ? myPlayerInfo.hand.map((c, i) => <CardUI key={i} card={c} />) : <><CardUI /><CardUI /></>}

                  {/* 使用 myCurrentHandInfo 实时显示自己当前的牌型，不再局限于 showdown 阶段 */}
                  {myPlayerInfo.hand && myPlayerInfo.hand.length > 0 && !myPlayerInfo.folded && myCurrentHandInfo?.rankName && (
                    <div className="absolute -bottom-3 w-full text-center bg-indigo-900 text-white text-sm py-0.5 rounded-full shadow border border-indigo-400 z-20 font-bold">
                      {myCurrentHandInfo.rankName}
                    </div>
                  )}

                  {roomData.status !== 'waiting' && myPlayerInfo.bet > 0 && (
                    <div className={`absolute -top-6 -right-8 font-black px-4 py-1.5 rounded-full shadow-lg border-2 text-sm flex items-center gap-1 z-20 ${getActionColor(myPlayerInfo.lastAction)}`}>
                      <Coins size={16} /> {myPlayerInfo.bet}
                    </div>
                  )}
                </div>
                <div className="flex flex-col">
                  <span className="font-bold text-xl text-white">{myPlayerInfo.name} {myPlayerInfo.folded && <span className="text-rose-400 text-sm">(已弃牌)</span>}</span>
                  <span className="text-emerald-400 font-mono text-xl mt-1">💰 {myPlayerInfo.chips}</span>
                  <button onClick={handleToggleSit} className="mt-2 flex items-center gap-1 text-xs bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded text-slate-300 w-fit transition">
                    {myPlayerInfo.isSittingOut ? <><UserCheck size={14}/> 坐下参与</> : <><UserMinus size={14}/> 站起观战</>}
                  </button>
                </div>
              </div>

              {isMyTurn && (
                <div className="flex-1 flex flex-col gap-3 w-full max-w-2xl ml-auto">
                  <div className="flex gap-3 justify-end">
                    <button onClick={() => handleAction('fold')} className="px-8 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold transition shadow">弃牌</button>
                    <button onClick={() => handleAction('call')} className="px-10 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold transition shadow-lg text-lg">
                      {callAmount === 0 ? '看牌 (Check)' : `跟注 (${callAmount})`}
                    </button>
                  </div>

                  {myPlayerInfo.chips > callAmount && (
                    <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-700 flex flex-col gap-3 shadow-inner">
                      <div className="flex gap-2 justify-between">
                        <button onClick={() => setRaiseInput(calcPotRaise(1/3))} className="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-bold transition">1/3池</button>
                        <button onClick={() => setRaiseInput(calcPotRaise(2/3))} className="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-bold transition">2/3池</button>
                        <button onClick={() => setRaiseInput(calcPotRaise(1))} className="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-bold transition">满池</button>
                        <button onClick={() => setRaiseInput(maxBet)} className="flex-1 py-1.5 bg-rose-900/60 hover:bg-rose-800/80 text-rose-200 border border-rose-800 rounded-lg text-sm font-bold transition">All-In</button>
                      </div>

                      <div className="flex items-center gap-3">
                        <input type="range" min={minRaiseTarget} max={maxBet} step="1" value={raiseInput} onChange={(e) => setRaiseInput(Number(e.target.value))} className="flex-1 accent-rose-500 cursor-pointer" />
                        <input type="number" min={minRaiseTarget} max={maxBet} value={raiseInput} onChange={(e) => { let val = Number(e.target.value); if (val > maxBet) val = maxBet; setRaiseInput(val); }} className="w-24 bg-slate-800 border border-slate-600 rounded-lg px-2 py-2 text-center font-mono outline-none focus:border-rose-500 text-white" />
                        <button onClick={() => handleAction('raise', raiseInput)} disabled={raiseInput < minRaiseTarget && raiseInput !== maxBet} className="px-8 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 text-amber-950 disabled:text-slate-500 rounded-lg font-bold transition whitespace-nowrap shadow-lg">确认加注</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-slate-800 p-6 flex justify-center items-center shadow-2xl border-t border-slate-700 text-slate-400">
              {isPendingApproval ? <span className="flex items-center gap-2"><ShieldAlert size={18} className="text-amber-500" /> 等待房主审核加入...</span> : "观战中..."}
            </div>
          )}
        </div>

        {/* 右侧日志区 (限制最大高度或充满剩余空间) */}
        <div className="w-full md:w-80 bg-slate-900 border-l border-slate-800 flex flex-col h-64 md:h-full z-10 flex-shrink-0">
          <div className="bg-slate-800 p-4 font-bold text-sm border-b border-slate-700 flex items-center gap-2 shadow-sm"><Users size={16} className="text-emerald-400"/> 对局动态</div>
          {/* 日志内容滚动区 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-sm leading-relaxed scroll-smooth" id="game-logs">
            {roomData.logs.map((log, idx) => (
              <div key={idx} className={`
                ${log.includes('---') ? 'text-emerald-400 font-bold mt-4 mb-2 border-b border-emerald-900/50 pb-1' : ''}
                ${log.includes('🏆') ? 'text-amber-400 font-black my-3 bg-amber-900/30 p-2 rounded border border-amber-700/50' : ''}
                ${log.includes('🃏') ? 'text-blue-300 font-bold my-2' : ''}
                ${!log.includes('---') && !log.includes('🏆') && !log.includes('🃏') ? 'text-slate-300' : ''}
              `}>
                {log}
              </div>
            ))}
            <div ref={logsEndRef} /> {/* 用于自动滚动到底部的锚点 */}
          </div>
        </div>
      </div>

      {/* 弹窗：全局设置 */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-md border border-slate-600 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-4 border-b border-slate-700 bg-slate-900/50">
              <h2 className="text-xl font-bold flex items-center gap-2 text-white"><Settings size={20} className="text-emerald-400"/> 房间设置 {!isHost && <span className="text-xs font-normal text-slate-400 ml-2 border border-slate-600 px-2 py-0.5 rounded">(仅供查看)</span>}</h2>
              <button onClick={() => setShowSettingsModal(false)} className="text-slate-400 hover:text-rose-400 transition"><X size={24}/></button>
            </div>
            <div className="p-6 space-y-6 overflow-y-auto">
              <div>
                <div className="text-slate-300 font-medium mb-2">初始筹码</div>
                <div className="flex gap-2 mb-2">
                  {[500, 1000, 2000].map(val => ( <button key={val} disabled={!isHost} onClick={() => setLocalSettings({...localSettings, initialChips: val})} className={`flex-1 py-2 rounded font-bold border transition ${localSettings.initialChips === val ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg' : 'bg-slate-900 border-slate-700 text-slate-400'} ${!isHost && 'opacity-60 cursor-not-allowed'}`}>{val}</button> ))}
                </div>
                <input type="number" disabled={!isHost} value={localSettings.initialChips} onChange={e => setLocalSettings({...localSettings, initialChips: Number(e.target.value)})} className={`w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white outline-none ${!isHost && 'opacity-60 cursor-not-allowed'}`} placeholder="自定义筹码" />
              </div>
              <div>
                <div className="text-slate-300 font-medium mb-2">每步思考时长</div>
                <div className="flex gap-2 mb-2">
                  {[10, 30, '无限'].map(val => ( <button key={val} disabled={!isHost} onClick={() => setLocalSettings({...localSettings, timeLimit: val})} className={`flex-1 py-2 rounded font-bold border transition ${localSettings.timeLimit === val ? 'bg-blue-600 text-white border-blue-500 shadow-lg' : 'bg-slate-900 border-slate-700 text-slate-400'} ${!isHost && 'opacity-60 cursor-not-allowed'}`}>{val === '无限' ? val : `${val}s`}</button> ))}
                </div>
                {typeof localSettings.timeLimit === 'number' && ( <input type="number" disabled={!isHost} value={localSettings.timeLimit} onChange={e => setLocalSettings({...localSettings, timeLimit: Number(e.target.value)})} className={`w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white outline-none ${!isHost && 'opacity-60 cursor-not-allowed'}`} placeholder="自定义秒数" /> )}
              </div>
              <div className="space-y-4 pt-6 border-t border-slate-700">
                <label className={`flex items-center justify-between text-slate-300 ${isHost ? 'cursor-pointer group' : 'opacity-60'}`}><span>允许对局中途添加他人 (下局进入)</span><input type="checkbox" disabled={!isHost} checked={localSettings.allowJoinDuringGame} onChange={e => setLocalSettings({...localSettings, allowJoinDuringGame: e.target.checked})} className="w-5 h-5 accent-emerald-500" /></label>
                <label className={`flex items-center justify-between text-slate-300 ${isHost ? 'cursor-pointer group' : 'opacity-60'}`}><span>盲注每5局自动翻倍</span><input type="checkbox" disabled={!isHost} checked={localSettings.doubleBlinds} onChange={e => setLocalSettings({...localSettings, doubleBlinds: e.target.checked})} className="w-5 h-5 accent-emerald-500" /></label>
                <label className={`flex items-center justify-between text-slate-300 ${isHost ? 'cursor-pointer group' : 'opacity-60'}`}><span>自动补码 (输光补初始筹码的一半)</span><input type="checkbox" disabled={!isHost} checked={localSettings.autoTopUp} onChange={e => setLocalSettings({...localSettings, autoTopUp: e.target.checked})} className="w-5 h-5 accent-emerald-500" /></label>
              </div>
            </div>
            {isHost && (
              <div className="p-4 border-t border-slate-700 bg-slate-900/50"><button onClick={handleSaveSettings} className="w-full bg-emerald-600 hover:bg-emerald-500 transition rounded-xl font-bold py-3 shadow-lg">保存设置并应用至下局</button></div>
            )}
          </div>
        </div>
      )}

      {/* 弹窗：房主管理单一玩家 */}
      {selectedPlayer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-sm border border-slate-600 overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-slate-700 bg-slate-900/50"><h2 className="text-lg font-bold text-white flex items-center gap-2"><Crown size={18} className="text-amber-400"/> 管理玩家: {selectedPlayer.name}</h2><button onClick={() => setSelectedPlayer(null)} className="text-slate-400 hover:text-rose-400 transition"><X size={20}/></button></div>
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm text-slate-400 mb-2">为该玩家补充筹码</label>
                <div className="flex gap-2">
                  <input type="number" value={topUpAmount} onChange={e => setTopUpAmount(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-600 rounded-lg p-2 text-white outline-none focus:border-emerald-500 font-mono" />
                  <button onClick={() => handlePlayerActionMenu('topup')} className="px-5 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold text-sm whitespace-nowrap shadow">确认补充</button>
                </div>
              </div>
              <div className="border-t border-slate-700 pt-6 flex gap-3">
                <button onClick={() => handlePlayerActionMenu('transfer')} className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold text-sm transition shadow">转让房主</button>
                <button onClick={() => handlePlayerActionMenu('kick')} className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 rounded-lg font-bold text-sm transition shadow">踢出房间</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}