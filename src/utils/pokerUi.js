export const getActionColor = (action) => {
  if (action === 'allin') return 'bg-rose-600 text-white border-rose-300';
  if (action === 'fold') return 'bg-slate-600 text-slate-300 border-slate-400';
  if (action === 'BB') return 'bg-purple-600 text-white border-purple-300';
  if (action === 'SB') return 'bg-indigo-600 text-white border-indigo-300';
  if (action === 'raise') return 'bg-amber-400 text-amber-950 border-amber-200';
  return 'bg-blue-500 text-white border-blue-300';
};

export const getActionLabel = (action, amount = 0) => {
  if (Number(amount || 0) > 0) return amount;
  if (action === 'check') return '过牌';
  if (action === 'fold') return '弃牌';
  if (action === 'allin') return 'All-In';
  if (action === 'call') return '跟注';
  if (action === 'raise') return '加注';
  if (action === 'SB') return '小盲';
  if (action === 'BB') return '大盲';
  return '';
};

export const getDisplayAction = (player) => {
  if (!player) return '';
  if ((player.lastAction === 'BB' || player.lastAction === 'SB') && player.hasActed) {
    return Number(player.bet || 0) > 0 ? 'call' : 'check';
  }
  return player.lastAction;
};

export const shouldShowActionBubble = (player, status) => {
  if (!player || status === 'waiting' || status === 'showdown') return false;
  if (Number(player.bet || 0) > 0) return true;
  return ['check', 'fold', 'allin'].includes(player.lastAction);
};

export const getStatusClass = (status) => status ? `poker-status-${status}` : '';
