import React from 'react';

const SUITS = ['♠', '♥', '♣', '♦'];
const SUIT_COLORS = { '♠': 'text-slate-800', '♣': 'text-slate-800', '♥': 'text-red-600', '♦': 'text-red-600' };
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const RANK_NAMES = ['高牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '同花顺'];

export const createDeck = () => {
  let deck = [];
  for (let s of SUITS) {
    for (let r of RANKS) deck.push(s + r);
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};

const getRankValue = (card) => {
  const r = card[1];
  if (r === 'T') return 10;
  if (r === 'J') return 11;
  if (r === 'Q') return 12;
  if (r === 'K') return 13;
  if (r === 'A') return 14;
  return parseInt(r);
};

export const evaluate5Cards = (cards) => {
  const values = cards.map(getRankValue).sort((a, b) => b - a);
  const suits = cards.map(c => c[0]);
  
  const isFlush = suits.every(s => s === suits[0]);
  let isStraight = false;
  let straightHigh = 0;

  if (values[0] - values[4] === 4 && new Set(values).size === 5) {
    isStraight = true;
    straightHigh = values[0];
  } else if (values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2) {
    isStraight = true;
    straightHigh = 5;
    values.push(values.shift());
  }

  const counts = {};
  values.forEach(v => counts[v] = (counts[v] || 0) + 1);
  const countFreq = Object.entries(counts).map(([v, c]) => ({ v: parseInt(v), c })).sort((a, b) => b.c - a.c || b.v - a.v);

  let rank = 0;
  if (isStraight && isFlush) rank = 8;
  else if (countFreq[0].c === 4) rank = 7;
  else if (countFreq[0].c === 3 && countFreq[1].c === 2) rank = 6;
  else if (isFlush) rank = 5;
  else if (isStraight) rank = 4;
  else if (countFreq[0].c === 3) rank = 3;
  else if (countFreq[0].c === 2 && countFreq[1].c === 2) rank = 2;
  else if (countFreq[0].c === 2) rank = 1;

  let score = rank * 0x100000;
  if (rank === 8 || rank === 4) {
    score += straightHigh * 0x10000;
  } else {
    let shift = 16;
    for (let item of countFreq) {
      for (let i = 0; i < item.c; i++) {
        score += item.v * Math.pow(16, shift / 4);
        shift -= 4;
      }
    }
  }
  return { score, rankName: RANK_NAMES[rank] };
};

export const evaluate7Cards = (holeCards, communityCards) => {
  const allCards = [...holeCards, ...communityCards];
  if (allCards.length < 5) return { score: 0, rankName: '' };

  // 使用标准的组合生成函数（C(n, 5)），无论 allCards 是 5 张、6 张还是 7 张，都能准确返回所有 5 张牌的组合
  const getCombinations = (cards, k) => {
    const result = [];
    const f = (start, combo) => {
      if (combo.length === k) {
        result.push(combo);
        return;
      }
      for (let i = start; i < cards.length; i++) {
        f(i + 1, [...combo, cards[i]]);
      }
    };
    f(0, []);
    return result;
  };

  // 获取当前所有可能的 5 张牌组合
  const combos = getCombinations(allCards, 5);
  
  let bestScore = -1;
  let bestRankName = '';
  
  // 遍历所有 5 张牌组合，找出最大牌力
  for (const fiveCards of combos) {
    const res = evaluate5Cards(fiveCards);
    if (res.score > bestScore) {
      bestScore = res.score;
      bestRankName = res.rankName;
    }
  }
  
  return { score: bestScore, rankName: bestRankName };
};

export const CardUI = ({ card, hidden }) => {
  if (hidden) {
    return (
      <div className="w-12 h-16 md:w-16 md:h-24 bg-blue-600 rounded shadow-md border-2 border-white flex items-center justify-center bg-[repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(255,255,255,0.1)_5px,rgba(255,255,255,0.1)_10px)]">
        <div className="w-8 h-12 border-2 border-blue-400 rounded-sm"></div>
      </div>
    );
  }
  if (!card) return <div className="w-12 h-16 md:w-16 md:h-24 border border-dashed border-slate-400 rounded opacity-50"></div>;
  
  const suit = card[0];
  const rank = card[1];
  const colorClass = SUIT_COLORS[suit] || 'text-slate-800';
  
  return (
    <div className="w-12 h-16 md:w-16 md:h-24 bg-white rounded shadow-md border border-slate-300 flex flex-col items-center justify-center p-1 font-bold text-lg md:text-2xl">
      <div className={`leading-none ${colorClass}`}>{suit}</div>
      <div className={`leading-none ${colorClass}`}>{rank}</div>
    </div>
  );
};