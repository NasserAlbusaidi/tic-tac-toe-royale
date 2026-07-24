import express from 'express'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Server } from 'socket.io'
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

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const distDir = path.join(rootDir, 'dist')
const port = Number.parseInt(process.env.PORT ?? '4242', 10)
const host = process.env.HOST ?? '127.0.0.1'
const isProduction = process.env.NODE_ENV === 'production'

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: isProduction ? false : true,
  },
})
const rooms = new Map()

app.use(express.json())

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    rooms: rooms.size,
    mode: isProduction ? 'production' : 'development',
  })
})

if (isProduction) {
  app.use(express.static(distDir))
  app.use((request, response, next) => {
    if (request.method !== 'GET') {
      next()
      return
    }

    response.sendFile(path.join(distDir, 'index.html'))
  })
}

function reply(callback, payload) {
  if (typeof callback === 'function') {
    callback(payload)
  }
}

function getRoom(code) {
  return rooms.get(String(code ?? '').trim().toUpperCase())
}

function emitRoom(room) {
  for (const socketId of room.sockets) {
    const socket = io.sockets.sockets.get(socketId)

    if (socket) {
      socket.emit('room:state', publicRoom(room, socketId))
    }
  }
}

function emitFailure(socket, result) {
  if (!result.ok) {
    socket.emit('room:error', result.error)
  }
}

io.on('connection', (socket) => {
  socket.on('room:create', (payload, callback) => {
    const room = createRoom({
      hostId: socket.id,
      hostName: payload?.hostName,
      totalRounds: payload?.totalRounds,
    })

    rooms.set(room.code, room)
    socket.join(room.code)

    reply(callback, { ok: true, room: publicRoom(room, socket.id) })
    emitRoom(room)
  })

  socket.on('room:join', (payload, callback) => {
    const room = getRoom(payload?.roomCode)

    if (!room) {
      reply(callback, { ok: false, error: 'Room not found.' })
      return
    }

    const participant = assignParticipant(room, {
      socketId: socket.id,
      name: payload?.name,
    })

    socket.join(room.code)
    reply(callback, {
      ok: true,
      role: participant.role,
      mark: participant.mark,
      room: publicRoom(room, socket.id),
    })
    emitRoom(room)
  })

  socket.on('match:start', (payload) => {
    const room = getRoom(payload?.roomCode)

    if (!room) {
      socket.emit('room:error', 'Room not found.')
      return
    }

    const result = startMatch(room, socket.id)
    emitFailure(socket, result)
    emitRoom(room)
  })

  socket.on('cell:play', (payload) => {
    const room = getRoom(payload?.roomCode)

    if (!room) {
      socket.emit('room:error', 'Room not found.')
      return
    }

    const result = applyMove(room, socket.id, payload?.index)
    emitFailure(socket, result)
    emitRoom(room)
  })

  socket.on('round:next', (payload) => {
    const room = getRoom(payload?.roomCode)

    if (!room) {
      socket.emit('room:error', 'Room not found.')
      return
    }

    const result = nextRound(room, socket.id)
    emitFailure(socket, result)
    emitRoom(room)
  })

  socket.on('match:reset', (payload) => {
    const room = getRoom(payload?.roomCode)

    if (!room) {
      socket.emit('room:error', 'Room not found.')
      return
    }

    const result = resetMatch(room, socket.id, payload?.totalRounds)
    emitFailure(socket, result)
    emitRoom(room)
  })

  socket.on('disconnect', () => {
    for (const room of rooms.values()) {
      const changed = markDisconnected(room, socket.id)

      if (changed) {
        emitRoom(room)
      }
    }
  })
})

httpServer.listen(port, host, () => {
  console.log(`XO Royale server listening on http://${host}:${port}`)
  if (!isProduction) {
    console.log('Vite client expected on port 5173')
  }
})
