/**
 * @typedef {'waiting' | 'pre-flop' | 'flop' | 'turn' | 'river' | 'showdown'} PokerStatus
 */

/**
 * @typedef {'hand-start' | 'street' | 'action-hold' | 'showdown'} TransitionType
 */

/**
 * @typedef {'fold' | 'check' | 'call' | 'raise' | 'allin' | 'SB' | 'BB' | null} PlayerAction
 */

/**
 * @typedef {'set' | 'add' | 'subtract'} PendingChipMode
 */

/**
 * @typedef {Object} PokerTransition
 * @property {string} id
 * @property {TransitionType} type
 * @property {PokerStatus} fromStatus
 * @property {PokerStatus} toStatus
 * @property {number} startedAt
 * @property {number} endsAt
 * @property {number} durationMs
 * @property {string} [message]
 * @property {number} [cardCount]
 * @property {number} [totalPot]
 * @property {boolean} [autoAdvance]
 * @property {number} [pausedAt]
 * @property {number} [pausedRemainingMs]
 * @property {number} [pausedProgress]
 */

/**
 * @typedef {Object} PokerPlayer
 * @property {string} uid
 * @property {string} name
 * @property {number} chips
 * @property {string[]} hand
 * @property {number} bet
 * @property {boolean} folded
 * @property {boolean} allIn
 * @property {boolean} hasActed
 * @property {boolean} isSittingOut
 * @property {boolean} [waitingNextHand]
 * @property {boolean} [isAi]
 * @property {boolean} [isKicked]
 * @property {boolean} [isOnline]
 * @property {number} [lastSeenAt]
 * @property {number|null} [disconnectedAt]
 * @property {PlayerAction} [lastAction]
 * @property {number} [totalContribution]
 * @property {boolean} [showCards]
 * @property {number} [showSequence]
 * @property {string} [rankName]
 * @property {string[]} [highlightCards]
 * @property {number} [winAmount]
 * @property {PendingChipMode} [pendingChipMode]
 * @property {number} [pendingChipAmount]
 * @property {number} [pendingChipUpdatedAt]
 */

/**
 * @typedef {Object} GameSettings
 * @property {number} initialChips
 * @property {number|'无限'} timeLimit
 * @property {boolean} allowJoinDuringGame
 * @property {boolean} doubleBlinds
 * @property {boolean} autoTopUp
 * @property {'1h'|'24h'|'7d'|'30d'} roomRetention
 */

/**
 * @typedef {Object} HandActionEntry
 * @property {string} id
 * @property {number} handNumber
 * @property {PokerStatus|string} street
 * @property {string} streetLabel
 * @property {number} at
 * @property {string} playerUid
 * @property {string} playerName
 * @property {PlayerAction|string} actionType
 * @property {string} actionLabel
 * @property {number} amount
 * @property {number} [targetBet]
 * @property {number} totalBet
 * @property {number} potAfter
 */

/**
 * @typedef {Object} HandHistoryEntry
 * @property {string} id
 * @property {string} roomId
 * @property {number} handNumber
 * @property {number} startedAt
 * @property {number} endedAt
 * @property {string[]} board
 * @property {number} totalPot
 * @property {SettlementPot[]} pots
 * @property {HandActionEntry[]} actions
 * @property {string} summary
 */

/**
 * @typedef {Object} SettlementPot
 * @property {number} id
 * @property {string} label
 * @property {number} amount
 * @property {{uid: string, name: string, rankName: string, amount: number}[]} winners
 */

/**
 * @typedef {Object} RoomSettlement
 * @property {string} id
 * @property {number} totalPot
 * @property {SettlementPot[]} pots
 * @property {number} totalAwarded
 */

/**
 * Firestore document stored under artifacts/{globalAppId}/public/data/rooms/{roomId}.
 *
 * @typedef {Object} PokerRoom
 * @property {string} id
 * @property {string} roomInstanceId
 * @property {string|null} hostUid
 * @property {string} creatorUid
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {number|null} [lastHumanActiveAt]
 * @property {number|null} [emptySince]
 * @property {number|null} [archiveAt]
 * @property {number|null} [ttlAt]
 * @property {'active'|'retaining'|'expired'} [lifecycleStatus]
 * @property {string} [retentionPolicy]
 * @property {PokerStatus} status
 * @property {boolean} isPublic
 * @property {boolean} isPaused
 * @property {number} pot
 * @property {number} currentBet
 * @property {number} minRaise
 * @property {number} turnIndex
 * @property {number} dealerIndex
 * @property {number} handCount
 * @property {string[]} communityCards
 * @property {string[]} deck
 * @property {string[]} logs
 * @property {HandActionEntry[]} [handActions]
 * @property {HandHistoryEntry[]} [handHistory]
 * @property {number|null} [handStartedAt]
 * @property {{uid: string, name: string, seatIndex: number, startChips: number, isAi?: boolean}[]} [handSeats]
 * @property {{handNumber: number, endedAt: number, summary: string, totalPot: number}} [lastHandSummary]
 * @property {GameSettings} settings
 * @property {Object.<string, {lastSeenAt: number}>} [presence]
 * @property {{uid: string, name: string, requestedAt: number, lastSeenAt?: number}[]} [joinRequests]
 * @property {PokerPlayer[]} players
 * @property {PokerTransition|null} [transition]
 * @property {RoomSettlement|null} [settlement]
 * @property {boolean} [allInRunout]
 * @property {string|null} [lastAggressorUid]
 * @property {string|null} [handAggressorUid]
 * @property {{actionKey: string, playerUid: string, claimedBy: string, claimedAt: number, expiresAt: number, attempt: number}|null} [aiTurnLease]
 * @property {Object} [aiDiagnostics]
 */

export {};
