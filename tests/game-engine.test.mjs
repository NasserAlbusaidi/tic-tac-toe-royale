import { describe, expect, it } from 'vitest'
import {
  applyMove,
  assignParticipant,
  createRoom,
  detectWinner,
  nextRound,
  normalizeGameMode,
  resetMatch,
  startMatch,
} from '../server/game-engine.mjs'

function liveRoom(totalRounds = 3) {
  const room = createRoom({
    hostId: 'host-socket',
    hostName: 'Host',
    totalRounds,
    roomCode: 'TEST1',
  })

  assignParticipant(room, { clientId: 'guest-socket', name: 'Guest' })
  startMatch(room, 'host-socket')

  return room
}

describe('game engine', () => {
  it('detects wins and draws', () => {
    expect(detectWinner(['X', 'X', 'X', null, null, null, null, null, null])).toEqual({
      winner: 'X',
      line: [0, 1, 2],
    })
    expect(detectWinner(['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X'])).toEqual({
      winner: 'draw',
      line: [],
    })
  })

  it('normalizes room modes and defaults to normal play', () => {
    expect(normalizeGameMode('misere')).toBe('misere')
    expect(normalizeGameMode('unknown')).toBe('normal')
    expect(createRoom({ hostId: 'host-socket', roomCode: 'TEST4' }).config.mode).toBe(
      'normal',
    )
  })

  it('requires the host and two connected players to start', () => {
    const room = createRoom({ hostId: 'host-socket', totalRounds: 3, roomCode: 'TEST2' })

    expect(startMatch(room, 'guest-socket')).toEqual({
      ok: false,
      error: 'Only the host can start the match.',
    })
    expect(startMatch(room, 'host-socket')).toEqual({
      ok: false,
      error: 'Two connected players are needed.',
    })

    assignParticipant(room, { clientId: 'guest-socket', name: 'Guest' })
    expect(startMatch(room, 'host-socket')).toEqual({ ok: true })
    expect(room.status).toBe('playing')
  })

  it('rejects out-of-turn and occupied-cell moves', () => {
    const room = liveRoom()

    expect(applyMove(room, 'guest-socket', 0)).toEqual({
      ok: false,
      error: 'Wait for your turn.',
    })
    expect(applyMove(room, 'host-socket', 0)).toEqual({ ok: true })
    expect(applyMove(room, 'guest-socket', 0)).toEqual({
      ok: false,
      error: 'That cell is already taken.',
    })
  })

  it('scores rounds and advances with alternating starters', () => {
    const room = liveRoom(3)

    applyMove(room, 'host-socket', 0)
    applyMove(room, 'guest-socket', 3)
    applyMove(room, 'host-socket', 1)
    applyMove(room, 'guest-socket', 4)
    applyMove(room, 'host-socket', 2)

    expect(room.status).toBe('roundOver')
    expect(room.scores.X).toBe(1)
    expect(room.rounds).toHaveLength(1)
    expect(nextRound(room, 'guest-socket')).toEqual({
      ok: false,
      error: 'Only the host can advance rounds.',
    })
    expect(nextRound(room, 'host-socket')).toEqual({ ok: true })
    expect(room.currentRound).toBe(2)
    expect(room.turn).toBe('O')
  })

  it('ends the match after the configured round count', () => {
    const room = liveRoom(1)

    applyMove(room, 'host-socket', 0)
    applyMove(room, 'guest-socket', 3)
    applyMove(room, 'host-socket', 1)
    applyMove(room, 'guest-socket', 4)
    applyMove(room, 'host-socket', 2)

    expect(room.status).toBe('matchOver')
    expect(room.matchWinner).toBe('X')
  })

  it('awards a Misère round to the opponent of the player who makes three', () => {
    const room = createRoom({
      hostId: 'host-socket',
      hostName: 'Host',
      totalRounds: 1,
      gameMode: 'misere',
      roomCode: 'TEST5',
    })

    assignParticipant(room, { clientId: 'guest-socket', name: 'Guest' })
    startMatch(room, 'host-socket')
    applyMove(room, 'host-socket', 0)
    applyMove(room, 'guest-socket', 3)
    applyMove(room, 'host-socket', 1)
    applyMove(room, 'guest-socket', 4)
    applyMove(room, 'host-socket', 2)

    expect(room.status).toBe('matchOver')
    expect(room.winner).toBe('O')
    expect(room.matchWinner).toBe('O')
    expect(room.scores).toEqual({ X: 0, O: 1, draws: 0 })
    expect(room.winningLine).toEqual([0, 1, 2])
    expect(room.rounds[0].completedBy).toBe('X')
    expect(room.lastEvent).toBe('X made three; O won the match')
  })

  it('lets the host reset the table and update round count', () => {
    const room = liveRoom(1)

    applyMove(room, 'host-socket', 0)
    applyMove(room, 'guest-socket', 3)
    applyMove(room, 'host-socket', 1)
    applyMove(room, 'guest-socket', 4)
    applyMove(room, 'host-socket', 2)

    expect(resetMatch(room, 'guest-socket', 7)).toEqual({
      ok: false,
      error: 'Only the host can reset the match.',
    })
    expect(resetMatch(room, 'host-socket', 7)).toEqual({ ok: true })
    expect(room.config.totalRounds).toBe(7)
    expect(room.scores).toEqual({ X: 0, O: 0, draws: 0 })
    expect(room.status).toBe('lobby')
  })

  it('restores a player with a stable id without allowing a seat takeover', () => {
    const room = createRoom({
      hostId: 'host-player',
      hostConnectionId: 'host-connection-1',
      roomCode: 'TEST3',
    })

    assignParticipant(room, {
      clientId: 'guest-player',
      connectionId: 'guest-connection-1',
      name: 'Guest',
    })

    const restored = assignParticipant(room, {
      clientId: 'guest-player',
      connectionId: 'guest-connection-2',
      name: 'Guest restored',
    })
    const lateJoiner = assignParticipant(room, {
      clientId: 'another-player',
      connectionId: 'another-connection',
      name: 'Late joiner',
    })

    expect(restored).toEqual({ role: 'player', mark: 'O' })
    expect(room.players.O.id).toBe('guest-player')
    expect(room.players.O.name).toBe('Guest restored')
    expect(lateJoiner).toEqual({ role: 'spectator', mark: null })
  })
})
