import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it } from 'vitest'
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

    const joined = await request(guest, 'join-1', 'room:join', {
      clientId: 'guest-client-456',
      name: 'Guest',
      roomCode,
    })
    expect(joined.payload.mark).toBe('O')

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
    })

    expect(resumed.payload.room.you.isHost).toBe(true)
    expect(resumed.payload.room.players.X.connected).toBe(true)
    expect(resumed.payload.room.matchWinner).toBe('O')
  })
})
