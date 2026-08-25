export type Mark = 'X' | 'O'
export type GameMode = 'normal' | 'misere' | 'ultimate' | 'connect4' | 'allegations'
export type Winner = Mark | 'draw' | null
export type RoomStatus = 'lobby' | 'playing' | 'roundOver' | 'matchOver'

export type UltimateClaim = Mark | 'draw' | null

export type UltimateState = {
  boards: (Mark | null)[][]
  claims: UltimateClaim[]
  targetBoard: number | null
}

export type AllegationsPack = 'general' | 'sensei' | 'mixed'
export type AllegationsTone = 'friendly' | 'feral'
export type AllegationOutcome = 'unanimous' | 'mutualSlander' | 'selfReport'

export type PublicAllegationPrompt = {
  id: string
  text: string
}

export type AllegationCaseSummary = {
  caseNumber: number
  prompt: {
    id: string
    text: string
    charge: string
  }
  votes: Record<Mark, Mark>
  outcome: AllegationOutcome
  charged: Mark | null
  endedAt: string
}

export type AllegationVerdict = {
  convicted: Mark | 'both' | 'none'
  title: string
  sentence: string
  appealStatus: string
}

export type PublicAllegationsState = {
  pack: AllegationsPack
  tone: AllegationsTone
  currentPrompt: PublicAllegationPrompt | null
  charges: Record<Mark, number>
  submitted: Record<Mark, boolean>
  yourVote: Mark | null
  revealedVotes: Record<Mark, Mark> | null
  latestOutcome: AllegationOutcome | null
  cases: AllegationCaseSummary[]
  verdict: AllegationVerdict | null
}

export type PlayerState = {
  id: string
  name: string
  mark: Mark
  isHost: boolean
  connected: boolean
}

export type RoundSummary = {
  round: number
  winner: Winner
  completedBy: Mark | null
  line: number[]
  starter: Mark
  board: (Mark | null)[]
  ultimate: UltimateState | null
  moves: number
  endedAt: string
}

export type ChatMessage = {
  id: string
  senderId: string
  senderName: string
  body: string
  createdAt: string
}

export type GameLogEntry = {
  id: string
  text: string
  createdAt: string
}

export type RoomState = {
  code: string
  config: {
    totalRounds: number
    mode: GameMode
  }
  status: RoomStatus
  board: (Mark | null)[]
  ultimate: UltimateState | null
  allegations: PublicAllegationsState | null
  turn: Mark
  starter: Mark
  winner: Winner
  winningLine: number[]
  matchWinner: Winner
  currentRound: number
  scores: {
    X: number
    O: number
    draws: number
  }
  rounds: RoundSummary[]
  chatMessages: ChatMessage[]
  gameLog: GameLogEntry[]
  players: {
    X: PlayerState | null
    O: PlayerState | null
  }
  spectators: Array<{
    id: string
    name: string
    connected: boolean
  }>
  lastEvent: string
  you: {
    mark: Mark | null
    isHost: boolean
    isSpectator: boolean
  }
}

export type RoomResponse = {
  ok: boolean
  error?: string
  resumeToken?: string
  role?: 'player' | 'spectator'
  mark?: Mark | null
  room?: RoomState
}
