const SUITS = ['♠', '♥', '♣', '♦'];
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
  let highlightValues = []; // 记录需要高光的点数

  if (isStraight && isFlush) { rank = 8; highlightValues = values; }
  else if (countFreq[0].c === 4) { rank = 7; highlightValues = [countFreq[0].v]; }
  else if (countFreq[0].c === 3 && countFreq[1].c === 2) { rank = 6; highlightValues = [countFreq[0].v, countFreq[1].v]; }
  else if (isFlush) { rank = 5; highlightValues = values; }
  else if (isStraight) { rank = 4; highlightValues = values; }
  else if (countFreq[0].c === 3) { rank = 3; highlightValues = [countFreq[0].v]; }
  else if (countFreq[0].c === 2 && countFreq[1].c === 2) { rank = 2; highlightValues = [countFreq[0].v, countFreq[1].v]; }
  else if (countFreq[0].c === 2) { rank = 1; highlightValues = [countFreq[0].v]; }

  // 提取具体的高光牌数组（高牌 rank===0 时为空）
  let highlightCards = [];
  if (rank > 0) {
    highlightCards = cards.filter(c => highlightValues.includes(getRankValue(c)));
  }

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
  // 返回 highlightCards
  return { score, rankName: RANK_NAMES[rank], highlightCards };
};

export const evaluate7Cards = (holeCards, communityCards) => {
  const allCards = [...holeCards, ...communityCards];
  if (allCards.length < 5) return { score: 0, rankName: '', highlightCards: [] };
  
  const getCombinations = (cards, k) => {
    const result = [];
    const f = (start, combo) => {
      if (combo.length === k) { result.push(combo); return; }
      for (let i = start; i < cards.length; i++) f(i + 1, [...combo, cards[i]]);
    };
    f(0, []);
    return result;
  };

  const combos = getCombinations(allCards, 5);
  let bestScore = -1, bestRankName = '', bestHighlightCards = [];
  
  for (const fiveCards of combos) {
    const res = evaluate5Cards(fiveCards);
    if (res.score > bestScore) {
      bestScore = res.score;
      bestRankName = res.rankName;
      bestHighlightCards = res.highlightCards; // 记录最佳高光牌
    }
  }
  return { score: bestScore, rankName: bestRankName, highlightCards: bestHighlightCards };
};
