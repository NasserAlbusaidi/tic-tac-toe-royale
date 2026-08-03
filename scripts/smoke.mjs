import { randomUUID } from 'node:crypto'
import { WebSocket } from 'ws'

const urlArgument = process.argv.indexOf('--url')
const targetUrl =
  (urlArgument >= 0 ? process.argv[urlArgument + 1] : null) ??
  process.env.SMOKE_WS_URL ??
  'ws://127.0.0.1:4242/api/ws'

if (!targetUrl.startsWith('ws://') && !targetUrl.startsWith('wss://')) {
  throw new Error('Smoke URL must start with ws:// or wss://.')
}

let requestNumber = 0

function openSocket() {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(targetUrl)
    const timer = setTimeout(() => {
      socket.terminate()
      reject(new Error(`Timed out connecting to ${targetUrl}.`))
    }, 15_000)

    socket.once('open', () => {
      clearTimeout(timer)
      resolve(socket)
    })
    socket.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

function request(socket, type, payload) {
  return new Promise((resolve, reject) => {
    const requestId = `smoke-${++requestNumber}`
    const timer = setTimeout(() => {
      socket.off('message', onMessage)
      reject(new Error(`${type} timed out.`))
    }, 15_000)

    function onMessage(data) {
      let message

      try {
        message = JSON.parse(String(data))
      } catch {
        return
      }

      if (message.type !== 'response' || message.requestId !== requestId) {
        return
      }

      clearTimeout(timer)
      socket.off('message', onMessage)

      if (!message.payload?.ok) {
        reject(new Error(message.payload?.error ?? `${type} failed.`))
        return
      }

      resolve(message.payload)
    }

    socket.on('message', onMessage)
    socket.send(JSON.stringify({ type, requestId, payload }))
  })
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

const hostId = `smoke-host-${randomUUID()}`
const guestId = `smoke-guest-${randomUUID()}`
let hostSocket
let guestSocket

try {
  hostSocket = await openSocket()
  guestSocket = await openSocket()

  const created = await request(hostSocket, 'room:create', {
    clientId: hostId,
    name: 'Smoke Host',
    totalRounds: 1,
    gameMode: 'ultimate',
  })
  const roomCode = created.room.code

  await request(guestSocket, 'room:join', {
    clientId: guestId,
    name: 'Smoke Guest',
    roomCode,
  })
  await request(hostSocket, 'match:start', {
    clientId: hostId,
    roomCode,
  })

  const firstMove = await request(hostSocket, 'cell:play', {
    clientId: hostId,
    roomCode,
    boardIndex: 4,
    index: 2,
  })

  assert(firstMove.room.config.mode === 'ultimate', 'Room is not in Ultimate mode.')
  assert(firstMove.room.ultimate.boards[4][2] === 'X', 'Move 5.3 was not recorded.')
  assert(firstMove.room.ultimate.targetBoard === 2, 'Move 5.3 did not target board 3.')

  const secondMove = await request(guestSocket, 'cell:play', {
    clientId: guestId,
    roomCode,
    boardIndex: 2,
    index: 0,
  })

  assert(secondMove.room.ultimate.boards[2][0] === 'O', 'Move 3.1 was not recorded.')
  assert(secondMove.room.ultimate.targetBoard === 0, 'Move 3.1 did not target board 1.')

  const chat = await request(hostSocket, 'chat:send', {
    clientId: hostId,
    roomCode,
    text: 'Smoke test complete.',
  })

  assert(chat.room.chatMessages.at(-1)?.body === 'Smoke test complete.', 'Chat failed.')

  const connectFourCreated = await request(hostSocket, 'room:create', {
    clientId: hostId,
    name: 'Smoke Host',
    totalRounds: 1,
    gameMode: 'connect4',
  })
  const connectFourRoomCode = connectFourCreated.room.code

  await request(guestSocket, 'room:join', {
    clientId: guestId,
    name: 'Smoke Guest',
    roomCode: connectFourRoomCode,
  })
  await request(hostSocket, 'match:start', {
    clientId: hostId,
    roomCode: connectFourRoomCode,
  })

  const connectFourMoves = [
    [hostSocket, hostId, 0],
    [guestSocket, guestId, 0],
    [hostSocket, hostId, 1],
    [guestSocket, guestId, 1],
    [hostSocket, hostId, 2],
    [guestSocket, guestId, 2],
    [hostSocket, hostId, 3],
  ]
  let connectFourResult

  for (const [socket, clientId, column] of connectFourMoves) {
    connectFourResult = await request(socket, 'cell:play', {
      clientId,
      roomCode: connectFourRoomCode,
      index: column,
    })
  }

  assert(
    connectFourResult.room.config.mode === 'connect4',
    'Room is not in Connect Four mode.',
  )
  assert(connectFourResult.room.winner === 'X', 'Connect Four winner was not X.')
  assert(
    connectFourResult.room.winningLine.join(',') === '35,36,37,38',
    'Connect Four winning line was not recorded.',
  )

  console.log(`Smoke passed: ${targetUrl}`)
  console.log(`Room ${roomCode}: 5.3 → board 3 → 3.1 → board 1`)
  console.log(`Room ${connectFourRoomCode}: columns 1, 1, 2, 2, 3, 3, 4 → X wins`)
} finally {
  hostSocket?.close()
  guestSocket?.close()
}
