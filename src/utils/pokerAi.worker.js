import { decidePokerAiAction } from './pokerAi.jsx';

self.addEventListener('message', (event) => {
  const { id, room, aiPlayer, config } = event.data || {};
  try {
    const decision = decidePokerAiAction(room, aiPlayer, {
      ...(config || {}),
      highQuality: true,
    });
    self.postMessage({ id, decision });
  } catch (error) {
    self.postMessage({
      id,
      decision: { actionType: 'call', amount: 0, equity: 0, reason: 'worker-error', error: error?.message || String(error) },
    });
  }
});
