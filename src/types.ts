export type Mark = 'X' | 'O'
export type GameMode = 'normal' | 'misere'
export type Winner = Mark | 'draw' | null
export type RoomStatus = 'lobby' | 'playing' | 'roundOver' | 'matchOver'

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
  endedAt: string
}

export type RoomState = {
  code: string
  config: {
    totalRounds: number
    mode: GameMode
  }
  status: RoomStatus
  board: (Mark | null)[]
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
  role?: 'player' | 'spectator'
  mark?: Mark | null
  room?: RoomState
}
