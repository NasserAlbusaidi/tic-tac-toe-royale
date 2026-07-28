import { randomUUID } from 'node:crypto'
import {
  applyMove,
  assignParticipant,
  createRoom,
  markDisconnected,
  nextRound,
  publicRoom,
  resetMatch,
  startMatch,
} from './game-engine.mjs'
import { createRoomStore } from './room-store.mjs'

const validClientId = /^[A-Za-z0-9_-]{8,64}$/
const validRoomCode = /^[A-Z2-9]{5}$/

function normalizeRoomCode(code) {
  return String(code ?? '').trim().toUpperCase()
}

function parseMessage(data) {
  const message = JSON.parse(String(data))

  if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
    throw new Error('Invalid message.')
  }

  return message
}

function safeSend(socket, message) {
  if (socket.readyState === 1) {
    socket.send(JSON.stringify(message))
  }
}

function response(socket, requestId, payload) {
  if (requestId) {
    safeSend(socket, { type: 'response', requestId, payload })
  }
}

function failure(socket, requestId, error) {
  const message = error instanceof Error ? error.message : String(error)
  response(socket, requestId, { ok: false, error: message })
  safeSend(socket, { type: 'room:error', payload: message })
}

function requireIdentity(payload) {
  const clientId = String(payload?.clientId ?? '')

  if (!validClientId.test(clientId)) {
    throw new Error('Your player session is invalid. Reload the page and try again.')
  }

  return {
    clientId,
    name: payload?.name,
  }
}

function requireRoomCode(payload, fallback) {
  const roomCode = normalizeRoomCode(payload?.roomCode ?? fallback)

  if (!validRoomCode.test(roomCode)) {
    throw new Error('Enter a valid five-character room code.')
  }

  return roomCode
}

export function createSocketHub({
  store = createRoomStore(),
  instanceId = randomUUID(),
} = {}) {
  const sockets = new Map()
  let unsubscribe = null

  async function broadcastRoom(roomCode) {
    const room = await store.read(roomCode)

    if (!room) {
      return
    }

    for (const [socket, session] of sockets) {
      if (session.roomCode === room.code && session.clientId) {
        safeSend(socket, {
          type: 'room:state',
          payload: publicRoom(room, session.clientId),
        })
      }
    }
  }

  function ensureSubscription() {
    if (!unsubscribe) {
      unsubscribe = store.subscribe(broadcastRoom)
    }
  }

  function stopSubscriptionIfIdle() {
    if (sockets.size === 0 && unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
  }

  async function createNewRoom(socket, session, payload, requestId) {
    const identity = requireIdentity(payload)
    let room = null

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = createRoom({
        hostId: identity.clientId,
        hostConnectionId: session.connectionId,
        hostName: identity.name,
        totalRounds: payload?.totalRounds,
      })

      if (await store.create(candidate)) {
        room = candidate
        break
      }
    }

    if (!room) {
      throw new Error('Could not reserve a room code. Try again.')
    }

    session.clientId = identity.clientId
    session.roomCode = room.code
    response(socket, requestId, {
      ok: true,
      room: publicRoom(room, identity.clientId),
    })
    await broadcastRoom(room.code)
  }

  async function joinRoom(socket, session, payload, requestId) {
    const identity = requireIdentity(payload)
    const roomCode = requireRoomCode(payload, session.roomCode)
    const mutation = await store.mutate(roomCode, (room) => ({
      result: assignParticipant(room, {
        clientId: identity.clientId,
        connectionId: session.connectionId,
        name: identity.name,
      }),
    }))

    if (!mutation) {
      throw new Error('Room not found.')
    }

    session.clientId = identity.clientId
    session.roomCode = roomCode
    response(socket, requestId, {
      ok: true,
      role: mutation.result.role,
      mark: mutation.result.mark,
      room: publicRoom(mutation.room, identity.clientId),
    })
    await broadcastRoom(roomCode)
  }

  async function mutateGameRoom(socket, session, payload, requestId, update) {
    if (!session.clientId) {
      throw new Error('Join the room before changing the match.')
    }

    const roomCode = requireRoomCode(payload, session.roomCode)
    const mutation = await store.mutate(roomCode, (room) => {
      const result = update(room, session.clientId)
      return {
        commit: result.ok,
        result,
      }
    })

    if (!mutation) {
      throw new Error('Room not found.')
    }

    if (!mutation.result.ok) {
      failure(socket, requestId, mutation.result.error)
      return
    }

    response(socket, requestId, {
      ok: true,
      room: publicRoom(mutation.room, session.clientId),
    })
    await broadcastRoom(roomCode)
  }

  async function handleMessage(socket, session, data) {
    let message

    try {
      message = parseMessage(data)
      const payload = message.payload ?? {}

      switch (message.type) {
        case 'room:create':
          await createNewRoom(socket, session, payload, message.requestId)
          break
        case 'room:join':
        case 'room:resume':
          await joinRoom(socket, session, payload, message.requestId)
          break
        case 'match:start':
          await mutateGameRoom(socket, session, payload, message.requestId, startMatch)
          break
        case 'cell:play':
          await mutateGameRoom(socket, session, payload, message.requestId, (room, clientId) =>
            applyMove(room, clientId, payload.index),
          )
          break
        case 'round:next':
          await mutateGameRoom(socket, session, payload, message.requestId, nextRound)
          break
        case 'match:reset':
          await mutateGameRoom(socket, session, payload, message.requestId, (room, clientId) =>
            resetMatch(room, clientId, payload.totalRounds),
          )
          break
        case 'room:leave':
          await disconnectSession(session)
          session.clientId = null
          session.roomCode = null
          response(socket, message.requestId, { ok: true })
          break
        default:
          throw new Error('Unknown message type.')
      }
    } catch (error) {
      failure(socket, message?.requestId, error)
    }
  }

  async function disconnectSession(session) {
    if (!session.clientId || !session.roomCode) {
      return
    }

    await store.mutate(session.roomCode, (room) => {
      const disconnected = markDisconnected(
        room,
        session.clientId,
        session.connectionId,
      )

      return {
        commit: Boolean(disconnected),
        result: disconnected,
      }
    })
  }

  function register(socket) {
    const session = {
      connectionId: `${instanceId}_${randomUUID()}`,
      clientId: null,
      roomCode: null,
      queue: Promise.resolve(),
    }

    sockets.set(socket, session)
    ensureSubscription()

    socket.on('message', (data) => {
      session.queue = session.queue
        .then(() => handleMessage(socket, session, data))
        .catch((error) => failure(socket, null, error))
    })

    socket.on('close', () => {
      sockets.delete(socket)
      void disconnectSession(session).finally(stopSubscriptionIfIdle)
    })

    socket.on('error', () => {
      socket.close()
    })
  }

  async function close() {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }

    for (const socket of sockets.keys()) {
      socket.close()
    }

    sockets.clear()
    await store.close()
  }

  return {
    register,
    close,
    broadcastRoom,
  }
}

let sharedHub

export function getSocketHub() {
  sharedHub ??= createSocketHub()
  return sharedHub
}
