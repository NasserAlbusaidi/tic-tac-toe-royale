import { customAlphabet } from 'nanoid'

export const marks = ['X', 'O']
export const winLines = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
]

const makeCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 5)

export function emptyBoard() {
  return Array.from({ length: 9 }, () => null)
}

export function cleanName(name, fallback = 'Player') {
  const cleaned = String(name ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 18)

  return cleaned || fallback
}

export function clampRounds(value) {
  const parsed = Number.parseInt(String(value), 10)

  if (Number.isNaN(parsed)) {
    return 5
  }

  return Math.max(1, Math.min(9, parsed))
}

export function detectWinner(board) {
  for (const line of winLines) {
    const [a, b, c] = line

    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line }
    }
  }

  if (board.every(Boolean)) {
    return { winner: 'draw', line: [] }
  }

  return { winner: null, line: [] }
}

function createPlayer(socketId, name, mark, isHost) {
  return {
    id: socketId,
    name: cleanName(name, mark === 'X' ? 'Host' : 'Guest'),
    mark,
    isHost,
    connected: true,
  }
}

export function createRoom({ hostId, hostName, totalRounds = 5, roomCode } = {}) {
  if (!hostId) {
    throw new Error('hostId is required')
  }

  const code = String(roomCode ?? makeCode()).toUpperCase()

  return {
    code,
    hostId,
    config: {
      totalRounds: clampRounds(totalRounds),
    },
    status: 'lobby',
    board: emptyBoard(),
    turn: 'X',
    starter: 'X',
    winner: null,
    winningLine: [],
    matchWinner: null,
    currentRound: 1,
    scores: {
      X: 0,
      O: 0,
      draws: 0,
    },
    rounds: [],
    players: {
      X: createPlayer(hostId, hostName, 'X', true),
      O: null,
    },
    spectators: [],
    sockets: new Set([hostId]),
    createdAt: new Date().toISOString(),
    lastEvent: 'Room opened',
  }
}

export function playerMarkFor(room, socketId) {
  if (room.players.X?.id === socketId) {
    return 'X'
  }

  if (room.players.O?.id === socketId) {
    return 'O'
  }

  return null
}

export function assignParticipant(room, { socketId, name }) {
  const existingMark = playerMarkFor(room, socketId)

  if (existingMark) {
    room.players[existingMark].connected = true
    room.players[existingMark].name = cleanName(name, room.players[existingMark].name)
    room.sockets.add(socketId)
    return { role: 'player', mark: existingMark }
  }

  if (!room.players.O || !room.players.O.connected) {
    room.players.O = createPlayer(socketId, name, 'O', false)
    room.sockets.add(socketId)
    room.lastEvent = `${room.players.O.name} joined`
    return { role: 'player', mark: 'O' }
  }

  const spectator = {
    id: socketId,
    name: cleanName(name, 'Spectator'),
    connected: true,
  }

  room.spectators = [
    ...room.spectators.filter((item) => item.id !== socketId),
    spectator,
  ]
  room.sockets.add(socketId)
  room.lastEvent = `${spectator.name} is watching`

  return { role: 'spectator', mark: null }
}

export function markDisconnected(room, socketId) {
  room.sockets.delete(socketId)

  const mark = playerMarkFor(room, socketId)

  if (mark) {
    room.players[mark].connected = false
    room.lastEvent = `${room.players[mark].name} disconnected`
    return mark
  }

  const before = room.spectators.length
  room.spectators = room.spectators.filter((item) => item.id !== socketId)

  return before === room.spectators.length ? null : 'spectator'
}

export function startMatch(room, socketId) {
  if (socketId !== room.hostId) {
    return { ok: false, error: 'Only the host can start the match.' }
  }

  if (!room.players.X?.connected || !room.players.O?.connected) {
    return { ok: false, error: 'Two connected players are needed.' }
  }

  room.status = 'playing'
  room.board = emptyBoard()
  room.turn = room.starter
  room.winner = null
  room.winningLine = []
  room.matchWinner = null
  room.lastEvent = `Round ${room.currentRound} started`

  return { ok: true }
}

function finishRound(room, winner, line) {
  if (winner === 'draw') {
    room.scores.draws += 1
  } else {
    room.scores[winner] += 1
  }

  room.winner = winner
  room.winningLine = [...line]
  room.rounds.push({
    round: room.currentRound,
    winner,
    line: [...line],
    starter: room.starter,
    board: [...room.board],
    endedAt: new Date().toISOString(),
  })

  if (room.rounds.length >= room.config.totalRounds) {
    room.status = 'matchOver'
    room.matchWinner =
      room.scores.X === room.scores.O
        ? 'draw'
        : room.scores.X > room.scores.O
          ? 'X'
          : 'O'
    room.lastEvent =
      room.matchWinner === 'draw'
        ? 'Match ended level'
        : `${room.matchWinner} won the match`
  } else {
    room.status = 'roundOver'
    room.lastEvent =
      winner === 'draw' ? 'Round ended in a draw' : `${winner} won the round`
  }
}

export function applyMove(room, socketId, index) {
  const cell = Number(index)

  if (room.status !== 'playing') {
    return { ok: false, error: 'The board is not live.' }
  }

  if (!Number.isInteger(cell) || cell < 0 || cell > 8) {
    return { ok: false, error: 'That cell is outside the board.' }
  }

  if (room.board[cell]) {
    return { ok: false, error: 'That cell is already taken.' }
  }

  const mark = playerMarkFor(room, socketId)

  if (!mark) {
    return { ok: false, error: 'Spectators cannot play this board.' }
  }

  if (room.turn !== mark) {
    return { ok: false, error: 'Wait for your turn.' }
  }

  room.board[cell] = mark

  const result = detectWinner(room.board)

  if (result.winner) {
    finishRound(room, result.winner, result.line)
  } else {
    room.turn = mark === 'X' ? 'O' : 'X'
    room.lastEvent = `${room.turn} to move`
  }

  return { ok: true }
}

export function nextRound(room, socketId) {
  if (socketId !== room.hostId) {
    return { ok: false, error: 'Only the host can advance rounds.' }
  }

  if (room.status !== 'roundOver') {
    return { ok: false, error: 'The current round is not finished.' }
  }

  room.currentRound = room.rounds.length + 1
  room.starter = room.currentRound % 2 === 1 ? 'X' : 'O'
  room.turn = room.starter
  room.board = emptyBoard()
  room.winner = null
  room.winningLine = []
  room.status = 'playing'
  room.lastEvent = `Round ${room.currentRound} started`

  return { ok: true }
}

export function resetMatch(room, socketId, totalRounds) {
  if (socketId !== room.hostId) {
    return { ok: false, error: 'Only the host can reset the match.' }
  }

  room.config.totalRounds = clampRounds(totalRounds ?? room.config.totalRounds)
  room.status = 'lobby'
  room.board = emptyBoard()
  room.turn = 'X'
  room.starter = 'X'
  room.winner = null
  room.winningLine = []
  room.matchWinner = null
  room.currentRound = 1
  room.scores = { X: 0, O: 0, draws: 0 }
  room.rounds = []
  room.lastEvent = 'Match reset'

  return { ok: true }
}

export function publicRoom(room, socketId) {
  const mark = playerMarkFor(room, socketId)

  return {
    code: room.code,
    config: { ...room.config },
    status: room.status,
    board: [...room.board],
    turn: room.turn,
    starter: room.starter,
    winner: room.winner,
    winningLine: [...room.winningLine],
    matchWinner: room.matchWinner,
    currentRound: room.currentRound,
    scores: { ...room.scores },
    rounds: room.rounds.map((round) => ({
      ...round,
      line: [...round.line],
      board: [...round.board],
    })),
    players: {
      X: room.players.X ? { ...room.players.X } : null,
      O: room.players.O ? { ...room.players.O } : null,
    },
    spectators: room.spectators
      .filter((item) => item.connected)
      .map((item) => ({ ...item })),
    lastEvent: room.lastEvent,
    you: {
      mark,
      isHost: socketId === room.hostId,
      isSpectator: !mark,
    },
  }
}
