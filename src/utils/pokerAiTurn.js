export const getAiActionKey = (roomId, sourceToken) => {
  if (!roomId || !sourceToken) return '';
  return [
    roomId,
    sourceToken.handCount,
    sourceToken.status,
    sourceToken.turnIndex,
    sourceToken.playerUid,
    sourceToken.currentBet,
    sourceToken.pot,
    sourceToken.playerBet,
    sourceToken.playerChips,
    sourceToken.playerHasActed,
    sourceToken.playerFolded,
    sourceToken.playerAllIn,
  ].join(':');
};
