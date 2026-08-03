import { customAlphabet } from 'nanoid'

export const marks = ['X', 'O']
export const gameModes = ['normal', 'misere', 'ultimate']
export const CHAT_MESSAGE_LIMIT = 280
export const ROOM_CHAT_HISTORY_LIMIT = 50
export const ROOM_GAME_LOG_LIMIT = 50
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

export function createUltimateState() {
  return {
    boards: Array.from({ length: 9 }, () => emptyBoard()),
    claims: Array.from({ length: 9 }, () => null),
    targetBoard: null,
  }
}

function cloneUltimateState(ultimate) {
  if (!ultimate) {
    return null
  }

  return {
    boards: ultimate.boards.map((board) => [...board]),
    claims: [...ultimate.claims],
    targetBoard: ultimate.targetBoard ?? null,
  }
}

export function cleanName(name, fallback = 'Player') {
  const cleaned = String(name ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 18)

  return cleaned || fallback
}

export function cleanChatMessage(message) {
  return String(message ?? '').replace(/\r\n?/g, '\n').trim()
}

function appendGameLog(room, text, createdAt = new Date().toISOString()) {
  const entries = Array.isArray(room.gameLog) ? room.gameLog : []
  const nextEntry = {
    id: `${createdAt}-${entries.length + 1}`,
    text,
    createdAt,
  }

  room.gameLog = [...entries, nextEntry].slice(-ROOM_GAME_LOG_LIMIT)
}

export function clampRounds(value) {
  const parsed = Number.parseInt(String(value), 10)

  if (Number.isNaN(parsed)) {
    return 5
  }

  return Math.max(1, Math.min(9, parsed))
}

export function normalizeGameMode(value) {
  return gameModes.includes(value) ? value : 'normal'
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

export function detectUltimateWinner(claims) {
  for (const line of winLines) {
    const [a, b, c] = line
    const claim = claims[a]

    if (
      marks.includes(claim) &&
      claim === claims[b] &&
      claim === claims[c]
    ) {
      return { winner: claim, line }
    }
  }

  if (claims.every(Boolean)) {
    return { winner: 'draw', line: [] }
  }

  return { winner: null, line: [] }
}

function ultimateBoardIsPlayable(ultimate, boardIndex) {
  return (
    Number.isInteger(boardIndex) &&
    boardIndex >= 0 &&
    boardIndex <= 8 &&
    ultimate.claims[boardIndex] === null &&
    ultimate.boards[boardIndex].some((cell) => cell === null)
  )
}

function createPlayer(
  clientId,
  connectionId,
  name,
  mark,
  isHost,
  resumeTokenHash,
) {
  const player = {
    id: clientId,
    connectionId,
    name: cleanName(name, mark === 'X' ? 'Host' : 'Guest'),
    mark,
    isHost,
    connected: true,
  }

  if (resumeTokenHash) {
    player.resumeTokenHash = resumeTokenHash
  }

  return player
}

export function createRoom({
  hostId,
  hostConnectionId = hostId,
  hostName,
  hostResumeTokenHash,
  totalRounds = 5,
  gameMode = 'normal',
  roomCode,
} = {}) {
  if (!hostId) {
    throw new Error('hostId is required')
  }

  const code = String(roomCode ?? makeCode()).toUpperCase()
  const mode = normalizeGameMode(gameMode)

  const room = {
    code,
    hostId,
    config: {
      totalRounds: clampRounds(totalRounds),
      mode,
    },
    status: 'lobby',
    board: emptyBoard(),
    ultimate: mode === 'ultimate' ? createUltimateState() : null,
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
    chatMessages: [],
    gameLog: [],
    players: {
      X: createPlayer(
        hostId,
        hostConnectionId,
        hostName,
        'X',
        true,
        hostResumeTokenHash,
      ),
      O: null,
    },
    spectators: [],
    createdAt: new Date().toISOString(),
    lastEvent: 'Room opened',
  }

  appendGameLog(room, 'Room opened')
  return room
}

export function playerMarkFor(room, clientId) {
  if (room.players.X?.id === clientId) {
    return 'X'
  }

  if (room.players.O?.id === clientId) {
    return 'O'
  }

  return null
}

export function assignParticipant(
  room,
  {
    clientId,
    connectionId = clientId,
    name,
    resumeTokenHash,
  },
) {
  const existingMark = playerMarkFor(room, clientId)

  if (existingMark) {
    room.players[existingMark].connected = true
    room.players[existingMark].connectionId = connectionId
    room.players[existingMark].name = cleanName(name, room.players[existingMark].name)
    return { role: 'player', mark: existingMark }
  }

  if (!room.players.O) {
    room.players.O = createPlayer(
      clientId,
      connectionId,
      name,
      'O',
      false,
      resumeTokenHash,
    )
    room.lastEvent = `${room.players.O.name} joined`
    appendGameLog(room, `${room.players.O.name} joined the table.`)
    return { role: 'player', mark: 'O' }
  }

  const existingSpectator = room.spectators.find((item) => item.id === clientId)

  if (existingSpectator) {
    existingSpectator.name = cleanName(name, existingSpectator.name)
    existingSpectator.connectionId = connectionId
    existingSpectator.connected = true
    return { role: 'spectator', mark: null }
  }

  const spectator = {
    id: clientId,
    connectionId,
    name: cleanName(name, 'Spectator'),
    connected: true,
  }

  if (resumeTokenHash) {
    spectator.resumeTokenHash = resumeTokenHash
  }

  room.spectators = [...room.spectators, spectator]
  room.lastEvent = `${spectator.name} is watching`
  appendGameLog(room, `${spectator.name} joined as a spectator.`)

  return { role: 'spectator', mark: null }
}

export function markDisconnected(room, clientId, connectionId = clientId) {
  const mark = playerMarkFor(room, clientId)

  if (mark) {
    if (room.players[mark].connectionId !== connectionId) {
      return null
    }

    room.players[mark].connected = false
    room.lastEvent = `${room.players[mark].name} disconnected`
    return mark
  }

  const spectator = room.spectators.find(
    (item) => item.id === clientId && item.connectionId === connectionId,
  )

  if (!spectator) {
    return null
  }

  spectator.connected = false
  return 'spectator'
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
  room.ultimate =
    normalizeGameMode(room.config.mode) === 'ultimate'
      ? createUltimateState()
      : null
  room.turn = room.starter
  room.winner = null
  room.winningLine = []
  room.matchWinner = null
  room.lastEvent = `Round ${room.currentRound} started`
  appendGameLog(room, `Round ${room.currentRound} started.`)

  return { ok: true }
}

function finishRound(room, winner, line, completedBy = winner) {
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
    completedBy: winner === 'draw' ? null : completedBy,
    line: [...line],
    starter: room.starter,
    board: [...room.board],
    ultimate: cloneUltimateState(room.ultimate),
    moves:
      normalizeGameMode(room.config.mode) === 'ultimate'
        ? room.ultimate.boards.flat().filter(Boolean).length
        : room.board.filter(Boolean).length,
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
        : room.config.mode === 'misere'
          ? `${completedBy} made three; ${room.matchWinner} won the match`
          : `${room.matchWinner} won the match`
  } else {
    room.status = 'roundOver'
    room.lastEvent =
      winner === 'draw'
        ? 'Round ended in a draw'
        : room.config.mode === 'misere'
          ? `${completedBy} made three and lost the round`
          : `${winner} won the round`
  }

  appendGameLog(room, `${room.lastEvent}.`)
}

export function applyMove(room, socketId, index, boardIndex) {
  const cell = Number(index)

  if (room.status !== 'playing') {
    return { ok: false, error: 'The board is not live.' }
  }

  if (!Number.isInteger(cell) || cell < 0 || cell > 8) {
    return { ok: false, error: 'That cell is outside the board.' }
  }

  const mark = playerMarkFor(room, socketId)

  if (!mark) {
    return { ok: false, error: 'Spectators cannot play this board.' }
  }

  if (room.turn !== mark) {
    return { ok: false, error: 'Wait for your turn.' }
  }

  if (normalizeGameMode(room.config.mode) === 'ultimate') {
    const smallBoard = Number(boardIndex)

    if (!Number.isInteger(smallBoard) || smallBoard < 0 || smallBoard > 8) {
      return { ok: false, error: 'Choose one of the nine small boards.' }
    }

    const ultimate = room.ultimate ?? createUltimateState()
    room.ultimate = ultimate
    const forcedBoard = ultimateBoardIsPlayable(
      ultimate,
      ultimate.targetBoard,
    )
      ? ultimate.targetBoard
      : null

    if (forcedBoard !== null && smallBoard !== forcedBoard) {
      return {
        ok: false,
        error: `You must play in board ${forcedBoard + 1}.`,
      }
    }

    if (!ultimateBoardIsPlayable(ultimate, smallBoard)) {
      return {
        ok: false,
        error: 'That small board is already claimed or full.',
      }
    }

    if (ultimate.boards[smallBoard][cell]) {
      return { ok: false, error: 'That cell is already taken.' }
    }

    ultimate.boards[smallBoard][cell] = mark
    appendGameLog(
      room,
      `${room.players[mark]?.name ?? mark} placed ${mark} at ${smallBoard + 1}.${cell + 1}.`,
    )

    const smallResult = detectWinner(ultimate.boards[smallBoard])

    if (smallResult.winner === 'draw') {
      ultimate.claims[smallBoard] = 'draw'
      appendGameLog(room, `Board ${smallBoard + 1} closed in a draw.`)
    } else if (smallResult.winner) {
      ultimate.claims[smallBoard] = smallResult.winner
      appendGameLog(
        room,
        `${room.players[mark]?.name ?? mark} claimed board ${smallBoard + 1} for ${mark}.`,
      )
    }

    const ultimateResult = detectUltimateWinner(ultimate.claims)

    if (ultimateResult.winner) {
      finishRound(
        room,
        ultimateResult.winner,
        ultimateResult.line,
        mark,
      )
      return { ok: true }
    }

    const nextMark = mark === 'X' ? 'O' : 'X'
    const nextBoard = ultimateBoardIsPlayable(ultimate, cell) ? cell : null
    ultimate.targetBoard = nextBoard
    room.turn = nextMark
    room.lastEvent =
      nextBoard === null
        ? `${room.players[nextMark]?.name ?? nextMark} can play any board`
        : `${room.players[nextMark]?.name ?? nextMark} must play board ${nextBoard + 1}`

    return { ok: true }
  }

  if (room.board[cell]) {
    return { ok: false, error: 'That cell is already taken.' }
  }

  room.board[cell] = mark
  appendGameLog(
    room,
    `${room.players[mark]?.name ?? mark} placed ${mark} in cell ${cell + 1}.`,
  )

  const result = detectWinner(room.board)

  if (result.winner) {
    if (result.winner === 'draw') {
      finishRound(room, result.winner, result.line)
    } else {
      const completedBy = result.winner
      const roundWinner =
        normalizeGameMode(room.config.mode) === 'misere'
          ? completedBy === 'X'
            ? 'O'
            : 'X'
          : completedBy

      finishRound(room, roundWinner, result.line, completedBy)
    }
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
  room.ultimate =
    normalizeGameMode(room.config.mode) === 'ultimate'
      ? createUltimateState()
      : null
  room.winner = null
  room.winningLine = []
  room.status = 'playing'
  room.lastEvent = `Round ${room.currentRound} started`
  appendGameLog(room, `Round ${room.currentRound} started.`)

  return { ok: true }
}

export function resetMatch(room, socketId, totalRounds) {
  if (socketId !== room.hostId) {
    return { ok: false, error: 'Only the host can reset the match.' }
  }

  room.config.totalRounds = clampRounds(totalRounds ?? room.config.totalRounds)
  room.status = 'lobby'
  room.board = emptyBoard()
  room.ultimate =
    normalizeGameMode(room.config.mode) === 'ultimate'
      ? createUltimateState()
      : null
  room.turn = 'X'
  room.starter = 'X'
  room.winner = null
  room.winningLine = []
  room.matchWinner = null
  room.currentRound = 1
  room.scores = { X: 0, O: 0, draws: 0 }
  room.rounds = []
  room.lastEvent = 'Match reset'
  appendGameLog(room, 'The host reset the match.')

  return { ok: true }
}

export function appendChatMessage(
  room,
  socketId,
  message,
  {
    id,
    createdAt = new Date().toISOString(),
  } = {},
) {
  const mark = playerMarkFor(room, socketId)

  if (!mark) {
    return {
      ok: false,
      error: 'Spectators can read chat but cannot send messages.',
    }
  }

  const body = cleanChatMessage(message)

  if (!body) {
    return { ok: false, error: 'Write a message before sending.' }
  }

  if (body.length > CHAT_MESSAGE_LIMIT) {
    return {
      ok: false,
      error: `Messages can be at most ${CHAT_MESSAGE_LIMIT} characters.`,
    }
  }

  const sender = room.players[mark]
  const chatMessages = Array.isArray(room.chatMessages) ? room.chatMessages : []
  const nextMessage = {
    id: id ?? `${createdAt}-${chatMessages.length + 1}`,
    senderId: sender.id,
    senderName: sender.name,
    body,
    createdAt,
  }

  room.chatMessages = [...chatMessages, nextMessage].slice(-ROOM_CHAT_HISTORY_LIMIT)
  return { ok: true, message: nextMessage }
}

export function publicRoom(room, socketId) {
  const mark = playerMarkFor(room, socketId)
  const mode = normalizeGameMode(room.config?.mode)
  const publicPlayer = (player) =>
    player
      ? {
          id: player.id,
          name: player.name,
          mark: player.mark,
          isHost: player.isHost,
          connected: player.connected,
        }
      : null

  return {
    code: room.code,
    config: {
      ...room.config,
      mode,
    },
    status: room.status,
    board: [...room.board],
    ultimate:
      mode === 'ultimate'
        ? cloneUltimateState(room.ultimate ?? createUltimateState())
        : null,
    turn: room.turn,
    starter: room.starter,
    winner: room.winner,
    winningLine: [...room.winningLine],
    matchWinner: room.matchWinner,
    currentRound: room.currentRound,
    scores: { ...room.scores },
    rounds: room.rounds.map((round) => ({
      ...round,
      completedBy:
        round.completedBy ?? (round.winner === 'draw' ? null : round.winner),
      line: [...round.line],
      board: [...round.board],
      ultimate: cloneUltimateState(round.ultimate),
      moves:
        round.moves ??
        (round.ultimate
          ? round.ultimate.boards.flat().filter(Boolean).length
          : round.board.filter(Boolean).length),
    })),
    chatMessages: (room.chatMessages ?? []).map((message) => ({ ...message })),
    gameLog: (room.gameLog ?? []).map((entry) => ({ ...entry })),
    players: {
      X: publicPlayer(room.players.X),
      O: publicPlayer(room.players.O),
    },
    spectators: room.spectators
      .filter((item) => item.connected)
      .map((item) => ({
        id: item.id,
        name: item.name,
        connected: item.connected,
      })),
    lastEvent: room.lastEvent,
    you: {
      mark,
      isHost: socketId === room.hostId,
      isSpectator: !mark,
    },
  }
}
