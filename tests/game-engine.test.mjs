import { describe, expect, it } from 'vitest'
import {
  appendChatMessage,
  applyMove,
  assignParticipant,
  CHAT_MESSAGE_LIMIT,
  createRoom,
  detectUltimateWinner,
  detectWinner,
  nextRound,
  normalizeGameMode,
  publicRoom,
  resetMatch,
  ROOM_CHAT_HISTORY_LIMIT,
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

function liveUltimateRoom(totalRounds = 1) {
  const room = createRoom({
    hostId: 'host-socket',
    hostName: 'Host',
    totalRounds,
    gameMode: 'ultimate',
    roomCode: 'ULTI1',
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
    expect(normalizeGameMode('ultimate')).toBe('ultimate')
    expect(normalizeGameMode('unknown')).toBe('normal')
    expect(createRoom({ hostId: 'host-socket', roomCode: 'TEST4' }).config.mode).toBe(
      'normal',
    )
  })

  it('creates nine numbered boards for Ultimate play', () => {
    const room = liveUltimateRoom()
    const publicState = publicRoom(room, 'host-socket')

    expect(room.ultimate.boards).toHaveLength(9)
    expect(room.ultimate.boards.every((board) => board.length === 9)).toBe(true)
    expect(room.ultimate.claims).toEqual(Array(9).fill(null))
    expect(room.ultimate.targetBoard).toBeNull()
    publicState.ultimate.boards[0][0] = 'X'
    expect(room.ultimate.boards[0][0]).toBeNull()
  })

  it('routes an Ultimate move to its cell board and rejects other boards', () => {
    const room = liveUltimateRoom()

    expect(applyMove(room, 'host-socket', 2, 4)).toEqual({ ok: true })
    expect(room.ultimate.boards[4][2]).toBe('X')
    expect(room.ultimate.targetBoard).toBe(2)
    expect(applyMove(room, 'guest-socket', 0, 0)).toEqual({
      ok: false,
      error: 'You must play in board 3.',
    })
    expect(applyMove(room, 'guest-socket', 3, 2)).toEqual({ ok: true })
    expect(room.ultimate.boards[2][3]).toBe('O')
    expect(room.ultimate.targetBoard).toBe(3)
  })

  it('opens every unfinished Ultimate board when the destination is closed', () => {
    const room = liveUltimateRoom()
    room.ultimate.claims[3] = 'X'

    applyMove(room, 'host-socket', 3, 4)

    expect(room.ultimate.targetBoard).toBeNull()
    expect(room.lastEvent).toBe('Guest can play any board')
    expect(applyMove(room, 'guest-socket', 0, 7)).toEqual({ ok: true })
  })

  it('claims a small board and wins the round with three meta claims', () => {
    const room = liveUltimateRoom()
    room.ultimate.claims[0] = 'X'
    room.ultimate.claims[1] = 'X'
    room.ultimate.boards[2][0] = 'X'
    room.ultimate.boards[2][1] = 'X'

    expect(applyMove(room, 'host-socket', 2, 2)).toEqual({ ok: true })
    expect(room.ultimate.claims[2]).toBe('X')
    expect(room.winningLine).toEqual([0, 1, 2])
    expect(room.status).toBe('matchOver')
    expect(room.matchWinner).toBe('X')
    expect(room.rounds[0].ultimate.claims.slice(0, 3)).toEqual(['X', 'X', 'X'])
  })

  it('treats closed small-board draws as neutral on the meta grid', () => {
    expect(
      detectUltimateWinner(['draw', 'draw', 'draw', null, null, null, null, null, null]),
    ).toEqual({ winner: null, line: [] })
    expect(
      detectUltimateWinner(['X', 'O', 'draw', 'draw', 'O', 'X', 'O', 'X', 'draw']),
    ).toEqual({ winner: 'draw', line: [] })
  })

  it('ends an Ultimate round in a draw when all nine boards close without a line', () => {
    const room = liveUltimateRoom()
    room.ultimate.claims = ['X', 'O', 'draw', 'draw', 'O', 'X', 'O', 'X', null]
    room.ultimate.boards[8] = ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', null]

    expect(applyMove(room, 'host-socket', 8, 8)).toEqual({ ok: true })
    expect(room.ultimate.claims[8]).toBe('draw')
    expect(room.winner).toBe('draw')
    expect(room.matchWinner).toBe('draw')
    expect(room.scores.draws).toBe(1)
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

  it('stores trimmed room chat with server-derived player identity', () => {
    const room = liveRoom()
    const sent = appendChatMessage(room, 'host-socket', '  Good move.  ', {
      id: 'message-1',
      createdAt: '2026-07-30T12:00:00.000Z',
    })

    expect(sent).toEqual({
      ok: true,
      message: {
        id: 'message-1',
        senderId: 'host-socket',
        senderName: 'Host',
        body: 'Good move.',
        createdAt: '2026-07-30T12:00:00.000Z',
      },
    })
    expect(publicRoom(room, 'guest-socket').chatMessages).toEqual([sent.message])
  })

  it('rejects empty, oversized, and spectator chat messages', () => {
    const room = liveRoom()
    assignParticipant(room, {
      clientId: 'spectator-client',
      name: 'Watcher',
    })

    expect(appendChatMessage(room, 'host-socket', '   ')).toEqual({
      ok: false,
      error: 'Write a message before sending.',
    })
    expect(
      appendChatMessage(room, 'host-socket', 'x'.repeat(CHAT_MESSAGE_LIMIT + 1)),
    ).toEqual({
      ok: false,
      error: `Messages can be at most ${CHAT_MESSAGE_LIMIT} characters.`,
    })
    expect(appendChatMessage(room, 'spectator-client', 'Hello')).toEqual({
      ok: false,
      error: 'Spectators can read chat but cannot send messages.',
    })
  })

  it('retains only the latest room chat history', () => {
    const room = liveRoom()

    for (let index = 0; index < ROOM_CHAT_HISTORY_LIMIT + 3; index += 1) {
      appendChatMessage(room, 'host-socket', `Message ${index}`, {
        id: `message-${index}`,
        createdAt: `2026-07-30T12:00:${String(index).padStart(2, '0')}.000Z`,
      })
    }

    expect(room.chatMessages).toHaveLength(ROOM_CHAT_HISTORY_LIMIT)
    expect(room.chatMessages[0].body).toBe('Message 3')
    expect(room.chatMessages.at(-1).body).toBe(
      `Message ${ROOM_CHAT_HISTORY_LIMIT + 2}`,
    )
  })

  it('records match events separately from player chat', () => {
    const room = liveRoom()

    applyMove(room, 'host-socket', 0)
    appendChatMessage(room, 'guest-socket', 'Your turn.', {
      id: 'message-1',
    })

    expect(room.gameLog.at(-1).text).toBe('Host placed X in cell 1.')
    expect(room.gameLog.some((entry) => entry.text === 'Your turn.')).toBe(false)
  })
})
