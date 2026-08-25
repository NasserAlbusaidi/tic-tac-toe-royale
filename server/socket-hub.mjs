import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto'
import {
  applyAllegationVote,
  applyMove,
  appendChatMessage,
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
const validResumeToken = /^[A-Za-z0-9_-]{43}$/
const chatRateLimitWindowMs = 10_000
const chatRateLimitCount = 5
const legacyRoomError =
  'This room predates secure sessions. Ask the host to create a new room.'
const invalidResumeError =
  'Your secure room session could not be verified. Rejoin from the original tab.'

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

function createResumeCredential() {
  const token = randomBytes(32).toString('base64url')

  return {
    token,
    hash: hashResumeToken(token),
  }
}

function hashResumeToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function participantFor(room, clientId) {
  if (room.players.X?.id === clientId) {
    return room.players.X
  }

  if (room.players.O?.id === clientId) {
    return room.players.O
  }

  return room.spectators.find((spectator) => spectator.id === clientId) ?? null
}

function roomUsesSecureSessions(room) {
  return Boolean(room.players.X?.resumeTokenHash)
}

function verifyResumeToken(participant, token) {
  if (!participant?.resumeTokenHash || !validResumeToken.test(String(token ?? ''))) {
    return false
  }

  const expected = Buffer.from(participant.resumeTokenHash, 'hex')
  const actual = Buffer.from(hashResumeToken(token), 'hex')

  return expected.length === actual.length && timingSafeEqual(expected, actual)
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
    const credential = createResumeCredential()
    let room = null

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = createRoom({
        hostId: identity.clientId,
        hostConnectionId: session.connectionId,
        hostName: identity.name,
        hostResumeTokenHash: credential.hash,
        totalRounds: payload?.totalRounds,
        gameMode: payload?.gameMode,
        allegationsPack: payload?.allegationsPack,
        allegationsTone: payload?.allegationsTone,
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
      resumeToken: credential.token,
      room: publicRoom(room, identity.clientId),
    })
    await broadcastRoom(room.code)
  }

  async function joinRoom(socket, session, payload, requestId, { resumeOnly = false } = {}) {
    const identity = requireIdentity(payload)
    const roomCode = requireRoomCode(payload, session.roomCode)
    const credential = createResumeCredential()
    const mutation = await store.mutate(roomCode, (room) => {
      if (!roomUsesSecureSessions(room)) {
        return {
          commit: false,
          result: { ok: false, error: legacyRoomError },
        }
      }

      const existingParticipant = participantFor(room, identity.clientId)

      if (existingParticipant) {
        if (!verifyResumeToken(existingParticipant, payload.resumeToken)) {
          return {
            commit: false,
            result: { ok: false, error: invalidResumeError },
          }
        }

        return {
          result: {
            ok: true,
            ...assignParticipant(room, {
              clientId: identity.clientId,
              connectionId: session.connectionId,
              name: identity.name,
            }),
            resumeToken: payload.resumeToken,
          },
        }
      }

      if (resumeOnly) {
        return {
          commit: false,
          result: { ok: false, error: invalidResumeError },
        }
      }

      return {
        result: {
          ok: true,
          ...assignParticipant(room, {
            clientId: identity.clientId,
            connectionId: session.connectionId,
            name: identity.name,
            resumeTokenHash: credential.hash,
          }),
          resumeToken: credential.token,
        },
      }
    })

    if (!mutation) {
      throw new Error('Room not found.')
    }

    if (!mutation.result.ok) {
      failure(socket, requestId, mutation.result.error)
      return
    }

    session.clientId = identity.clientId
    session.roomCode = roomCode
    response(socket, requestId, {
      ok: true,
      role: mutation.result.role,
      mark: mutation.result.mark,
      resumeToken: mutation.result.resumeToken,
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

  function enforceChatRateLimit(session) {
    const now = Date.now()
    session.chatTimestamps = session.chatTimestamps.filter(
      (timestamp) => now - timestamp < chatRateLimitWindowMs,
    )

    if (session.chatTimestamps.length >= chatRateLimitCount) {
      throw new Error('Chat is moving too quickly. Wait a moment and try again.')
    }

    session.chatTimestamps.push(now)
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
          await joinRoom(socket, session, payload, message.requestId)
          break
        case 'room:resume':
          await joinRoom(socket, session, payload, message.requestId, {
            resumeOnly: true,
          })
          break
        case 'match:start':
          await mutateGameRoom(socket, session, payload, message.requestId, startMatch)
          break
        case 'cell:play':
          await mutateGameRoom(socket, session, payload, message.requestId, (room, clientId) =>
            applyMove(room, clientId, payload.index, payload.boardIndex),
          )
          break
        case 'allegation:vote':
          await mutateGameRoom(socket, session, payload, message.requestId, (room, clientId) =>
            applyAllegationVote(room, clientId, payload.target),
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
        case 'chat:send':
          enforceChatRateLimit(session)
          await mutateGameRoom(socket, session, payload, message.requestId, (room, clientId) =>
            appendChatMessage(room, clientId, payload.text, {
              id: randomUUID(),
            }),
          )
          break
        case 'room:leave':
          {
            const departingSession = { ...session }
            session.clientId = null
            session.roomCode = null
            await disconnectSession(departingSession)
          }
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
      chatTimestamps: [],
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
