// Computer opponent. The bot always sits in seat O and plays only from what a
// player in that seat could see: Sea Battle targeting reads the public
// projection, never the hidden fleet.

import {
  applyAllegationVote,
  applyMove,
  BOT_ID,
  CONNECT_FOUR_COLUMNS,
  CONNECT_FOUR_ROWS,
  detectUltimateWinner,
  detectWinner,
  normalizeBotLevel,
  placeFleet,
  winLines,
} from './game-engine.mjs'
import { FLEET, SEA_SIZE, publicSeaBattleState, validateFleet } from './seabattle-engine.mjs'

export { BOT_ID }
export const BOT_MARK = 'O'

const HUMAN = 'X'

function pick(items, random) {
  return items[Math.floor(random() * items.length)]
}

function bestOf(scored, random) {
  const top = Math.max(...scored.map((item) => item.score))
  return pick(scored.filter((item) => item.score === top), random)
}

// --- Normal and Misère: full minimax on the 3×3 board -----------------------

function ticTacToeScore(board, toMove, misere, depth) {
  const { winner } = detectWinner(board)

  if (winner === 'draw') {
    return 0
  }

  if (winner) {
    // In Misère the player who completed the line loses.
    const botWon = misere ? winner !== BOT_MARK : winner === BOT_MARK
    return botWon ? 10 - depth : depth - 10
  }

  const scores = []

  for (let cell = 0; cell < 9; cell += 1) {
    if (!board[cell]) {
      board[cell] = toMove
      scores.push(ticTacToeScore(board, toMove === 'X' ? 'O' : 'X', misere, depth + 1))
      board[cell] = null
    }
  }

  return toMove === BOT_MARK ? Math.max(...scores) : Math.min(...scores)
}

export function chooseTicTacToeMove(board, { misere = false, level = 'hard', random = Math.random } = {}) {
  const open = board.map((cell, index) => (cell ? null : index)).filter((index) => index !== null)

  if (level === 'easy' && random() < 0.55) {
    return pick(open, random)
  }

  const working = [...board]
  return bestOf(
    open.map((index) => {
      working[index] = BOT_MARK
      const score = ticTacToeScore(working, HUMAN, misere, 1)
      working[index] = null
      return { index, score }
    }),
    random,
  ).index
}

// --- Connect Four: alpha-beta negamax with window scoring -------------------

const C4_WINDOWS = (() => {
  const windows = []
  const at = (row, column) => row * CONNECT_FOUR_COLUMNS + column

  for (let row = 0; row < CONNECT_FOUR_ROWS; row += 1) {
    for (let column = 0; column < CONNECT_FOUR_COLUMNS; column += 1) {
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        const endRow = row + dr * 3
        const endColumn = column + dc * 3

        if (endRow < CONNECT_FOUR_ROWS && endColumn >= 0 && endColumn < CONNECT_FOUR_COLUMNS) {
          windows.push([0, 1, 2, 3].map((step) => at(row + dr * step, column + dc * step)))
        }
      }
    }
  }

  return windows
})()

function c4Landing(board, column) {
  for (let row = CONNECT_FOUR_ROWS - 1; row >= 0; row -= 1) {
    const index = row * CONNECT_FOUR_COLUMNS + column

    if (!board[index]) {
      return index
    }
  }

  return -1
}

const C4_WINDOWS_BY_CELL = Array.from({ length: CONNECT_FOUR_ROWS * CONNECT_FOUR_COLUMNS }, (_, cell) =>
  C4_WINDOWS.filter((window) => window.includes(cell)),
)

function c4Wins(board, index, mark) {
  return C4_WINDOWS_BY_CELL[index].some((window) =>
    window.every((cell) => board[cell] === mark),
  )
}

function c4Evaluate(board, mark) {
  const other = mark === 'X' ? 'O' : 'X'
  let score = 0

  for (const window of C4_WINDOWS) {
    let mine = 0
    let theirs = 0

    for (const cell of window) {
      if (board[cell] === mark) mine += 1
      else if (board[cell] === other) theirs += 1
    }

    if (mine && !theirs) score += mine === 3 ? 6 : mine === 2 ? 2 : 0
    if (theirs && !mine) score -= theirs === 3 ? 8 : theirs === 2 ? 2 : 0
  }

  for (let row = 0; row < CONNECT_FOUR_ROWS; row += 1) {
    const center = board[row * CONNECT_FOUR_COLUMNS + 3]
    if (center === mark) score += 3
    else if (center === other) score -= 3
  }

  return score
}

const C4_ORDER = [3, 2, 4, 1, 5, 0, 6]

function c4Negamax(board, mark, depth, alpha, beta) {
  const other = mark === 'X' ? 'O' : 'X'
  const moves = C4_ORDER.map((column) => c4Landing(board, column)).filter((index) => index >= 0)

  if (moves.length === 0) {
    return 0
  }

  for (const index of moves) {
    board[index] = mark
    const wins = c4Wins(board, index, mark)
    board[index] = null

    if (wins) {
      return 1000 + depth
    }
  }

  if (depth === 0) {
    return c4Evaluate(board, mark)
  }

  let best = -Infinity

  for (const index of moves) {
    board[index] = mark
    const score = -c4Negamax(board, other, depth - 1, -beta, -alpha)
    board[index] = null

    if (score > best) best = score
    if (best > alpha) alpha = best
    if (alpha >= beta) break
  }

  return best
}

export function chooseConnectFourColumn(board, { level = 'hard', random = Math.random } = {}) {
  const columns = C4_ORDER.filter((column) => c4Landing(board, column) >= 0)

  if (level === 'easy' && random() < 0.35) {
    return pick(columns, random)
  }

  const depth = level === 'easy' ? 1 : 6
  const working = [...board]

  return bestOf(
    columns.map((column) => {
      const index = c4Landing(working, column)
      working[index] = BOT_MARK
      const score = c4Wins(working, index, BOT_MARK)
        ? 100_000
        : -c4Negamax(working, HUMAN, depth - 1, -Infinity, Infinity)
      working[index] = null
      return { index: column, score }
    }),
    random,
  ).index
}

// --- Ultimate: two-ply search over a positional evaluation ------------------

function uPlayable(state, board) {
  return (
    board !== null &&
    state.claims[board] === null &&
    state.boards[board].some((cell) => cell === null)
  )
}

function uMoves(state) {
  const boards = uPlayable(state, state.targetBoard)
    ? [state.targetBoard]
    : state.boards.map((_, board) => board).filter((board) => uPlayable(state, board))

  return boards.flatMap((board) =>
    state.boards[board]
      .map((cell, index) => (cell ? null : { boardIndex: board, index }))
      .filter(Boolean),
  )
}

function uApply(state, mark, { boardIndex, index }) {
  const boards = state.boards.map((board) => [...board])
  const claims = [...state.claims]
  boards[boardIndex][index] = mark
  const small = detectWinner(boards[boardIndex]).winner

  if (small) {
    claims[boardIndex] = small
  }

  const next = { boards, claims, targetBoard: null }
  next.targetBoard = uPlayable(next, index) ? index : null
  return next
}

function lineScore(cells, mark, weights) {
  const other = mark === 'X' ? 'O' : 'X'
  let score = 0

  for (const line of winLines) {
    const values = line.map((cell) => cells[cell])
    const mine = values.filter((value) => value === mark).length
    const theirs = values.filter((value) => value === other).length
    const blocked = values.some((value) => value === 'draw')

    if (blocked) continue
    if (mine && !theirs) score += weights[mine]
    if (theirs && !mine) score -= weights[theirs]
  }

  return score
}

function uEvaluate(state, mark) {
  const meta = detectUltimateWinner(state.claims).winner

  if (meta === mark) return 100_000
  if (meta && meta !== 'draw') return -100_000

  let score = lineScore(state.claims, mark, [0, 40, 220, 0])
  const boardWeight = [3, 2, 3, 2, 4, 2, 3, 2, 3]

  state.claims.forEach((claim, board) => {
    if (claim === mark) score += 60 * boardWeight[board]
    else if (claim && claim !== 'draw') score -= 60 * boardWeight[board]
    else if (!claim) score += lineScore(state.boards[board], mark, [0, 1, 6, 0]) * boardWeight[board]
  })

  return score
}

export function chooseUltimateMove(ultimate, { level = 'hard', random = Math.random } = {}) {
  const state = {
    boards: ultimate.boards.map((board) => [...board]),
    claims: [...ultimate.claims],
    targetBoard: ultimate.targetBoard ?? null,
  }
  const moves = uMoves(state)

  if (level === 'easy') {
    const claiming = moves.filter((move) => uApply(state, BOT_MARK, move).claims[move.boardIndex] === BOT_MARK)
    return claiming.length && random() < 0.6 ? pick(claiming, random) : pick(moves, random)
  }

  return bestOf(
    moves.map((move) => {
      const after = uApply(state, BOT_MARK, move)

      if (detectUltimateWinner(after.claims).winner === BOT_MARK) {
        return { ...move, score: Infinity }
      }

      const replies = uMoves(after)
      const worst = replies.length
        ? Math.min(...replies.map((reply) => uEvaluate(uApply(after, HUMAN, reply), BOT_MARK)))
        : uEvaluate(after, BOT_MARK)
      // Handing the human a free choice of board is usually a gift.
      const freeMovePenalty = after.targetBoard === null && replies.length ? 25 : 0
      return { ...move, score: worst - freeMovePenalty }
    }),
    random,
  )
}

// --- Sea Battle: random fleet, then hunt and target -------------------------

export function randomFleetLayout(random = Math.random) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const layout = FLEET.map((ship) => ({
      id: ship.id,
      index: Math.floor(random() * SEA_SIZE * SEA_SIZE),
      orientation: random() < 0.5 ? 'h' : 'v',
    }))

    if (validateFleet(layout).ok) {
      return layout
    }
  }

  // Deterministic fallback: one ship per row.
  return FLEET.map((ship, row) => ({ id: ship.id, index: row * 2 * SEA_SIZE, orientation: 'h' }))
}

function neighbours(index) {
  const row = Math.floor(index / SEA_SIZE)
  const column = index % SEA_SIZE
  return [
    row > 0 ? index - SEA_SIZE : null,
    row < SEA_SIZE - 1 ? index + SEA_SIZE : null,
    column > 0 ? index - 1 : null,
    column < SEA_SIZE - 1 ? index + 1 : null,
  ].filter((cell) => cell !== null)
}

/**
 * Picks a target from public information only: the shots already fired at the
 * human's waters and which of their ships are sunk.
 */
export function chooseSeaBattleShot(view, { level = 'hard', random = Math.random } = {}) {
  const waters = view.shots[HUMAN]
  const sunkCells = new Set(view.sunk[HUMAN].flatMap((ship) => ship.cells))
  const openHits = waters
    .map((value, index) => (value === 'hit' && !sunkCells.has(index) ? index : null))
    .filter((index) => index !== null)
  const unknown = waters
    .map((value, index) => (value ? null : index))
    .filter((index) => index !== null)

  if (level === 'easy') {
    const adjacent = [...new Set(openHits.flatMap(neighbours))].filter((cell) => !waters[cell])
    return adjacent.length && random() < 0.7 ? pick(adjacent, random) : pick(unknown, random)
  }

  const sunkIds = new Set(view.sunk[HUMAN].map((ship) => ship.id))
  const afloat = view.fleetSpec.filter((ship) => !sunkIds.has(ship.id))
  const density = new Array(SEA_SIZE * SEA_SIZE).fill(0)
  const blocked = (cell) => waters[cell] === 'miss' || sunkCells.has(cell)

  for (const ship of afloat) {
    for (let start = 0; start < SEA_SIZE * SEA_SIZE; start += 1) {
      for (const orientation of ['h', 'v']) {
        const row = Math.floor(start / SEA_SIZE)
        const column = start % SEA_SIZE

        if (orientation === 'h' && column + ship.size > SEA_SIZE) continue
        if (orientation === 'v' && row + ship.size > SEA_SIZE) continue

        const cells = Array.from({ length: ship.size }, (_, offset) =>
          orientation === 'h' ? start + offset : start + offset * SEA_SIZE,
        )

        if (cells.some(blocked)) continue

        const covered = cells.filter((cell) => openHits.includes(cell)).length

        if (openHits.length && covered === 0) continue

        const weight = covered ? 30 ** covered : 1

        for (const cell of cells) {
          if (!waters[cell]) density[cell] += weight
        }
      }
    }
  }

  const scored = unknown.map((index) => ({
    index,
    // Prefer a checkerboard while hunting: every ship is at least 2 long.
    score: density[index] + (openHits.length === 0 && (Math.floor(index / SEA_SIZE) + index) % 2 === 0 ? 0.5 : 0),
  }))

  return bestOf(scored, random).index
}

// --- Turn dispatch -----------------------------------------------------------

/**
 * What the bot wants to do right now, or null if it is not its turn.
 * Returns { type: 'move', index, boardIndex? } | { type: 'fleet', ships } | { type: 'vote', target }.
 */
export function chooseBotAction(room, { random = Math.random } = {}) {
  if (room.players?.O?.id !== BOT_ID || room.status !== 'playing') {
    return null
  }

  const level = normalizeBotLevel(room.bot?.level)
  const mode = room.config.mode

  if (mode === 'allegations') {
    const state = room.allegations
    return state?.currentPromptId && !state.submitted?.O
      ? { type: 'vote', target: random() < 0.5 ? 'X' : 'O' }
      : null
  }

  if (mode === 'seabattle') {
    const state = room.seabattle

    if (!state) return null

    if (state.phase === 'placing') {
      return state.fleets.O ? null : { type: 'fleet', ships: randomFleetLayout(random) }
    }

    if (room.turn !== BOT_MARK) return null

    const view = publicSeaBattleState(state, { viewerMark: BOT_MARK, revealed: false })
    return { type: 'move', index: chooseSeaBattleShot(view, { level, random }) }
  }

  if (room.turn !== BOT_MARK) {
    return null
  }

  if (mode === 'connect4') {
    return { type: 'move', index: chooseConnectFourColumn(room.board, { level, random }) }
  }

  if (mode === 'ultimate') {
    const move = chooseUltimateMove(room.ultimate, { level, random })
    return { type: 'move', index: move.index, boardIndex: move.boardIndex }
  }

  return {
    type: 'move',
    index: chooseTicTacToeMove(room.board, { misere: mode === 'misere', level, random }),
  }
}

/** Applies the bot's action, if any. Returns { acted, error? }. */
export function runBotTurn(room, { random = Math.random } = {}) {
  const action = chooseBotAction(room, { random })

  if (!action) {
    return { acted: false }
  }

  const result =
    action.type === 'fleet'
      ? placeFleet(room, BOT_ID, action.ships)
      : action.type === 'vote'
        ? applyAllegationVote(room, BOT_ID, action.target)
        : applyMove(room, BOT_ID, action.index, action.boardIndex)

  return result.ok ? { acted: true } : { acted: false, error: result.error }
}
