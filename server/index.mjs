import express from 'express'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { getSocketHub } from './socket-hub.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const distDir = path.join(rootDir, 'dist')
const port = Number.parseInt(process.env.PORT ?? '4242', 10)
const hostArgument = process.argv.indexOf('--host')
const host =
  (hostArgument >= 0 ? process.argv[hostArgument + 1] : null) ??
  process.env.HOST ??
  '127.0.0.1'
const isProduction =
  process.env.NODE_ENV === 'production' || process.argv.includes('--production')

const app = express()
const httpServer = createServer(app)
const socketServer = new WebSocketServer({
  noServer: true,
  maxPayload: 16 * 1024,
})
const hub = getSocketHub()

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    mode: isProduction ? 'production' : 'development',
    store: process.env.REDIS_URL ? 'redis' : 'memory',
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

httpServer.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url ?? '/', `http://${request.headers.host}`).pathname

  if (pathname !== '/api/ws') {
    socket.destroy()
    return
  }

  socketServer.handleUpgrade(request, socket, head, (webSocket) => {
    hub.register(webSocket)
  })
})

httpServer.listen(port, host, () => {
  console.log(`XO Royale server listening on http://${host}:${port}`)
  console.log(`Room store: ${process.env.REDIS_URL ? 'Redis' : 'local memory'}`)

  if (!isProduction) {
    console.log('Vite client expected on port 5173')
  }
})

async function shutdown() {
  await hub.close()
  httpServer.close()
}

process.once('SIGINT', () => void shutdown())
process.once('SIGTERM', () => void shutdown())
