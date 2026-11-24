import { describe, expect, it } from 'vitest'
import {
  BOT_ID,
  chooseConnectFourColumn,
  chooseSeaBattleShot,
  chooseTicTacToeMove,
  runBotTurn,
} from '../server/bot.mjs'
import {
  applyMove,
  assignParticipant,
  connectFourLandingIndex,
  createRoom,
  nextRound,
  placeFleet,
  publicRoom,
  startMatch,
} from '../server/game-engine.mjs'
import { createSeaBattleState, FLEET, fireShotInState, publicSeaBattleState } from '../server/seabattle-engine.mjs'

function seeded(seed) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

function botRoom(mode, { level = 'hard', rounds = 1 } = {}) {
  const room = createRoom({
    hostId: 'human-socket',
    hostName: 'Human',
    totalRounds: rounds,
    gameMode: mode,
    opponent: 'bot',
    botLevel: level,
    roomCode: 'BOT01',
  })
  startMatch(room, 'human-socket')
  return room
}

function legalHumanMove(room, random) {
  const mode = room.config.mode

  if (mode === 'connect4') {
    const columns = [0, 1, 2, 3, 4, 5, 6].filter((column) => connectFourLandingIndex(room.board, column) >= 0)
    return { index: columns[Math.floor(random() * columns.length)] }
  }

  if (mode === 'ultimate') {
    const { boards, claims, targetBoard } = room.ultimate
    const playable = (board) => claims[board] === null && boards[board].some((cell) => !cell)
    const options = boards
      .flatMap((board, boardIndex) => board.map((cell, index) => ({ boardIndex, index, cell })))
      .filter(({ boardIndex, cell }) =>
        !cell && playable(boardIndex) &&
        (targetBoard === null || !playable(targetBoard) || boardIndex === targetBoard))
    return options[Math.floor(random() * options.length)]
  }

  const open = room.board.map((cell, index) => (cell ? null : index)).filter((index) => index !== null)
  return { index: open[Math.floor(random() * open.length)] }
}

/** Plays a full round: a random human (X) against the bot (O). Returns the winner. */
function playRound(room, random) {
  for (let turn = 0; turn < 200 && room.status === 'playing'; turn += 1) {
    if (room.turn === 'X') {
      const move = legalHumanMove(room, random)
      expect(applyMove(room, 'human-socket', move.index, move.boardIndex).ok).toBe(true)
    } else {
      expect(runBotTurn(room, { random }).acted).toBe(true)
    }
  }

  return room.winner
}

describe('computer opponent', () => {
  it('takes the O seat, stays connected and cannot be displaced', () => {
    const room = createRoom({
      hostId: 'human-socket',
      hostName: 'Human',
      opponent: 'bot',
      botLevel: 'easy',
      roomCode: 'BOT02',
    })

    expect(room.players.O).toMatchObject({ id: BOT_ID, name: 'Claude', isBot: true, connected: true })
    expect(room.bot).toEqual({ level: 'easy' })
    expect(publicRoom(room, 'human-socket').players.O.isBot).toBe(true)
    expect(assignParticipant(room, { clientId: 'late-friend', name: 'Friend' }).role).toBe('spectator')
    expect(startMatch(room, 'human-socket').ok).toBe(true)
  })

  it('does nothing in a room without a bot, or when it is not its turn', () => {
    const room = createRoom({ hostId: 'h', hostName: 'H', roomCode: 'NOBOT' })
    assignParticipant(room, { clientId: 'g', name: 'G' })
    startMatch(room, 'h')
    room.turn = 'O'
    expect(runBotTurn(room).acted).toBe(false)

    const botGame = botRoom('normal')
    expect(botGame.turn).toBe('X')
    expect(runBotTurn(botGame).acted).toBe(false)
  })

  it('takes an immediate win and blocks an immediate loss', () => {
    expect(chooseTicTacToeMove(['O', 'O', null, 'X', 'X', null, 'X', null, null])).toBe(2)
    expect(chooseTicTacToeMove(['X', 'X', null, null, 'O', null, null, null, null])).toBe(2)
    expect(chooseConnectFourColumn([
      ...Array(35).fill(null),
      'X', 'X', 'X', null, 'O', 'O', null,
    ])).toBe(3)
  })

  it('never loses Normal or Misère on hard against 200 random games each', () => {
    for (const mode of ['normal', 'misere']) {
      const random = seeded(mode === 'normal' ? 1 : 2)
      let losses = 0

      for (let game = 0; game < 200; game += 1) {
        if (playRound(botRoom(mode), random) === 'X') losses += 1
      }

      expect(losses, mode).toBe(0)
    }
  })

  it('beats a random player at Connect Four and Ultimate on hard', () => {
    for (const mode of ['connect4', 'ultimate']) {
      const random = seeded(mode === 'connect4' ? 3 : 4)
      let wins = 0

      for (let game = 0; game < 10; game += 1) {
        if (playRound(botRoom(mode), random) === 'O') wins += 1
      }

      expect(wins, mode).toBe(10)
    }
  }, 30_000)

  it('plays legal moves on easy and loses some Normal games to a random player', () => {
    const random = seeded(5)
    let losses = 0

    for (let game = 0; game < 200; game += 1) {
      if (playRound(botRoom('normal', { level: 'easy' }), random) === 'X') losses += 1
    }

    expect(losses).toBeGreaterThan(0)
  })

  it('hunts a Sea Battle fleet from public information, faster on hard', () => {
    const shotsToSink = (level, seed) => {
      const random = seeded(seed)
      const state = createSeaBattleState()
      state.fleets.O = []
      state.fleets.X = null
      // A random human fleet the bot cannot see.
      const room = botRoom('seabattle')
      placeFleet(room, 'human-socket', [
        { id: 'flagship', index: Math.floor(random() * 5) * 10 + Math.floor(random() * 5), orientation: 'h' },
        { id: 'cruiser', index: 60 + Math.floor(random() * 6), orientation: 'h' },
        { id: 'frigate', index: 9, orientation: 'v' },
        { id: 'corvette', index: 87, orientation: 'h' },
        { id: 'skiff', index: 73, orientation: 'v' },
      ])
      state.fleets.X = room.seabattle.fleets.X
      state.fleets.O = room.seabattle.fleets.X
      state.phase = 'firing'

      for (let shots = 1; shots <= 100; shots += 1) {
        const view = publicSeaBattleState(state, { viewerMark: 'O', revealed: false })
        expect(view.revealedFleets).toBeNull()
        const shot = fireShotInState(state, 'O', chooseSeaBattleShot(view, { level, random }))
        expect(shot.ok).toBe(true)
        if (shot.fleetDestroyed) return shots
      }

      return 101
    }

    const average = (level) =>
      Array.from({ length: 12 }, (_, seed) => shotsToSink(level, seed + 10)).reduce((a, b) => a + b) / 12

    const hard = average('hard')
    const easy = average('easy')
    expect(hard).toBeLessThan(62)
    expect(hard).toBeLessThan(easy)
  })

  it('deploys its own fleet at once and fires when it is its turn', () => {
    const room = botRoom('seabattle', { rounds: 3 })
    expect(runBotTurn(room).acted).toBe(true)
    expect(room.seabattle.fleets.O).toHaveLength(FLEET.length)
    expect(runBotTurn(room).acted).toBe(false)

    placeFleet(room, 'human-socket', FLEET.map((ship, row) => ({ id: ship.id, index: row * 10, orientation: 'h' })))
    expect(room.turn).toBe('X')
    expect(applyMove(room, 'human-socket', 99).ok).toBe(true)
    expect(runBotTurn(room).acted).toBe(true)
    expect(room.seabattle.shots.X.filter(Boolean)).toHaveLength(1)
    expect(room.turn).toBe('X')
    expect(publicRoom(room, 'human-socket').seabattle.revealedFleets).toBeNull()
  })

  it('opens even rounds itself as the starter', () => {
    const room = botRoom('connect4', { rounds: 3 })
    playRound(room, seeded(6))
    expect(room.status).toBe('roundOver')
    nextRound(room, 'human-socket')
    expect(room.turn).toBe('O')
    expect(runBotTurn(room).acted).toBe(true)
    expect(room.board.filter(Boolean)).toHaveLength(1)
  })

  it('files a sealed Allegations verdict', () => {
    const room = botRoom('allegations', { rounds: 5 })
    expect(runBotTurn(room).acted).toBe(true)
    expect(room.allegations.submitted.O).toBe(true)
    expect(runBotTurn(room).acted).toBe(false)
  })
})
