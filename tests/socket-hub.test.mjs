import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it } from 'vitest'
import { createRoom } from '../server/game-engine.mjs'
import { createMemoryRoomStore } from '../server/room-store.mjs'
import { createSocketHub } from '../server/socket-hub.mjs'

class FakeSocket extends EventEmitter {
  readyState = 1
  sent = []

  send(payload) {
    this.sent.push(JSON.parse(payload))
  }

  receive(message) {
    this.emit('message', JSON.stringify(message))
  }

  close() {
    if (this.readyState === 3) {
      return
    }

    this.readyState = 3
    this.emit('close')
  }
}

async function eventually(read, timeout = 1000) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeout) {
    const value = read()

    if (value) {
      return value
    }

    await new Promise((resolve) => setTimeout(resolve, 5))
  }

  throw new Error('Timed out waiting for the socket response.')
}

function request(socket, requestId, type, payload) {
  socket.receive({ requestId, type, payload })
  return eventually(() =>
    socket.sent.find(
      (message) => message.type === 'response' && message.requestId === requestId,
    ),
  )
}

describe('socket hub', () => {
  let hub

  afterEach(async () => {
    await hub?.close()
  })

  it('plays a complete online Misère round and restores the host after reconnecting', async () => {
    hub = createSocketHub({
      store: createMemoryRoomStore(),
      instanceId: 'test-instance',
    })
    const host = new FakeSocket()
    const guest = new FakeSocket()
    hub.register(host)
    hub.register(guest)

    const created = await request(host, 'create-1', 'room:create', {
      clientId: 'host-client-123',
      name: 'Host',
      totalRounds: 1,
      gameMode: 'misere',
    })
    const roomCode = created.payload.room.code
    expect(created.payload.room.config.mode).toBe('misere')
    expect(created.payload.resumeToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(created.payload.room.players.X).not.toHaveProperty('resumeTokenHash')
    expect(JSON.stringify(created.payload.room)).not.toContain(
      created.payload.resumeToken,
    )

    const joined = await request(guest, 'join-1', 'room:join', {
      clientId: 'guest-client-456',
      name: 'Guest',
      roomCode,
    })
    expect(joined.payload.mark).toBe('O')

    const chat = await request(host, 'chat-1', 'chat:send', {
      roomCode,
      text: '  Ready for Misère?  ',
      senderName: 'Spoofed name',
    })
    expect(chat.payload.room.chatMessages).toEqual([
      expect.objectContaining({
        senderId: 'host-client-123',
        senderName: 'Host',
        body: 'Ready for Misère?',
      }),
    ])

    await request(host, 'start-1', 'match:start', { roomCode })
    await request(host, 'move-1', 'cell:play', { roomCode, index: 0 })
    await request(guest, 'move-2', 'cell:play', { roomCode, index: 3 })
    await request(host, 'move-3', 'cell:play', { roomCode, index: 1 })
    await request(guest, 'move-4', 'cell:play', { roomCode, index: 4 })
    const winningMove = await request(host, 'move-5', 'cell:play', {
      roomCode,
      index: 2,
    })

    expect(winningMove.payload.room.status).toBe('matchOver')
    expect(winningMove.payload.room.matchWinner).toBe('O')
    expect(winningMove.payload.room.rounds[0].completedBy).toBe('X')

    host.close()
    const restoredHost = new FakeSocket()
    hub.register(restoredHost)
    const resumed = await request(restoredHost, 'resume-1', 'room:resume', {
      clientId: 'host-client-123',
      name: 'Host',
      roomCode,
      resumeToken: created.payload.resumeToken,
    })

    expect(resumed.payload.room.you.isHost).toBe(true)
    expect(resumed.payload.room.players.X.connected).toBe(true)
    expect(resumed.payload.room.matchWinner).toBe('O')
    expect(resumed.payload.room.chatMessages).toHaveLength(1)
    expect(resumed.payload.room.gameLog.some((entry) =>
      entry.text.includes('placed X in cell 3'),
    )).toBe(true)
  })

  it('lets spectators read room chat but rejects sending', async () => {
    hub = createSocketHub({
      store: createMemoryRoomStore(),
      instanceId: 'test-instance',
    })
    const host = new FakeSocket()
    const guest = new FakeSocket()
    const spectator = new FakeSocket()
    hub.register(host)
    hub.register(guest)
    hub.register(spectator)

    const created = await request(host, 'create-1', 'room:create', {
      clientId: 'host-client-123',
      name: 'Host',
    })
    const roomCode = created.payload.room.code
    await request(guest, 'join-1', 'room:join', {
      clientId: 'guest-client-456',
      name: 'Guest',
      roomCode,
    })
    const watched = await request(spectator, 'watch-1', 'room:join', {
      clientId: 'spectator-client-789',
      name: 'Watcher',
      roomCode,
    })
    expect(watched.payload.role).toBe('spectator')

    await request(host, 'chat-1', 'chat:send', {
      roomCode,
      text: 'Welcome.',
    })
    const rejected = await request(spectator, 'chat-2', 'chat:send', {
      roomCode,
      text: 'Hello.',
    })

    expect(rejected.payload).toEqual({
      ok: false,
      error: 'Spectators can read chat but cannot send messages.',
    })

    const refreshed = await request(spectator, 'watch-2', 'room:resume', {
      clientId: 'spectator-client-789',
      name: 'Watcher',
      roomCode,
      resumeToken: watched.payload.resumeToken,
    })
    expect(refreshed.payload.room.chatMessages).toHaveLength(1)
    expect(refreshed.payload.room.chatMessages[0].body).toBe('Welcome.')
  })

  it('rate limits chat per socket', async () => {
    hub = createSocketHub({
      store: createMemoryRoomStore(),
      instanceId: 'test-instance',
    })
    const host = new FakeSocket()
    hub.register(host)

    const created = await request(host, 'create-1', 'room:create', {
      clientId: 'host-client-123',
      name: 'Host',
    })
    const roomCode = created.payload.room.code

    for (let index = 0; index < 5; index += 1) {
      const sent = await request(host, `chat-${index}`, 'chat:send', {
        roomCode,
        text: `Message ${index}`,
      })
      expect(sent.payload.ok).toBe(true)
    }

    const limited = await request(host, 'chat-limited', 'chat:send', {
      roomCode,
      text: 'One too many',
    })
    expect(limited.payload).toEqual({
      ok: false,
      error: 'Chat is moving too quickly. Wait a moment and try again.',
    })
  })

  it('keeps chat isolated to its room', async () => {
    const store = createMemoryRoomStore()
    hub = createSocketHub({
      store,
      instanceId: 'test-instance',
    })
    const firstHost = new FakeSocket()
    const secondHost = new FakeSocket()
    hub.register(firstHost)
    hub.register(secondHost)

    const first = await request(firstHost, 'create-1', 'room:create', {
      clientId: 'first-host-client',
      name: 'First host',
    })
    const second = await request(secondHost, 'create-2', 'room:create', {
      clientId: 'second-host-client',
      name: 'Second host',
    })

    await request(firstHost, 'chat-1', 'chat:send', {
      roomCode: first.payload.room.code,
      text: 'First room only.',
    })

    expect((await store.read(first.payload.room.code)).chatMessages).toHaveLength(1)
    expect((await store.read(second.payload.room.code)).chatMessages).toEqual([])
  })

  it('does not push stale room state back to a socket that leaves', async () => {
    hub = createSocketHub({
      store: createMemoryRoomStore(),
      instanceId: 'test-instance',
    })
    const host = new FakeSocket()
    const guest = new FakeSocket()
    hub.register(host)
    hub.register(guest)

    const created = await request(host, 'create-1', 'room:create', {
      clientId: 'host-client-123',
      name: 'Host',
    })
    const roomCode = created.payload.room.code
    await request(guest, 'join-1', 'room:join', {
      clientId: 'guest-client-456',
      name: 'Guest',
      roomCode,
    })

    const statesBeforeLeave = host.sent.filter(
      (message) => message.type === 'room:state',
    ).length
    const left = await request(host, 'leave-1', 'room:leave', { roomCode })

    expect(left.payload).toEqual({ ok: true })
    expect(
      host.sent.filter((message) => message.type === 'room:state'),
    ).toHaveLength(statesBeforeLeave)
    expect(
      guest.sent
        .filter((message) => message.type === 'room:state')
        .at(-1).payload.players.X.connected,
    ).toBe(false)
  })

  it('rejects player impersonation with a public client id', async () => {
    const store = createMemoryRoomStore()
    hub = createSocketHub({
      store,
      instanceId: 'test-instance',
    })
    const host = new FakeSocket()
    const guest = new FakeSocket()
    const attacker = new FakeSocket()
    hub.register(host)
    hub.register(guest)
    hub.register(attacker)

    const created = await request(host, 'create-1', 'room:create', {
      clientId: 'host-client-123',
      name: 'Host',
    })
    const roomCode = created.payload.room.code
    const joined = await request(guest, 'join-1', 'room:join', {
      clientId: 'guest-client-456',
      name: 'Guest',
      roomCode,
    })
    const publicHostId = joined.payload.room.players.X.id
    const impersonated = await request(attacker, 'resume-attacker', 'room:resume', {
      clientId: publicHostId,
      name: 'Fake Host',
      roomCode,
      resumeToken: 'a'.repeat(43),
    })

    expect(impersonated.payload).toEqual({
      ok: false,
      error:
        'Your secure room session could not be verified. Rejoin from the original tab.',
    })

    const stored = await store.read(roomCode)
    expect(stored.players.X.resumeTokenHash).toMatch(/^[a-f0-9]{64}$/)
    expect(stored.players.X.resumeTokenHash).not.toBe(created.payload.resumeToken)

    const restoredHost = new FakeSocket()
    hub.register(restoredHost)
    const resumed = await request(restoredHost, 'resume-host', 'room:resume', {
      clientId: publicHostId,
      name: 'Host',
      roomCode,
      resumeToken: created.payload.resumeToken,
    })

    expect(resumed.payload.ok).toBe(true)
    expect(resumed.payload.room.you.isHost).toBe(true)
  })

  it('requires legacy rooms to be recreated instead of allowing an insecure claim', async () => {
    const store = createMemoryRoomStore()
    await store.create(
      createRoom({
        hostId: 'legacy-host-123',
        hostName: 'Legacy Host',
        roomCode: 'OLD22',
      }),
    )
    hub = createSocketHub({
      store,
      instanceId: 'test-instance',
    })
    const visitor = new FakeSocket()
    hub.register(visitor)

    const rejected = await request(visitor, 'join-legacy', 'room:join', {
      clientId: 'visitor-client-123',
      name: 'Visitor',
      roomCode: 'OLD22',
    })

    expect(rejected.payload).toEqual({
      ok: false,
      error:
        'This room predates secure sessions. Ask the host to create a new room.',
    })
  })
})
