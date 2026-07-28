import { experimental_upgradeWebSocket } from '@vercel/functions'
import { getSocketHub } from '../server/socket-hub.mjs'

export function GET() {
  return experimental_upgradeWebSocket(
    (socket) => {
      getSocketHub().register(socket)
    },
    {
      maxPayload: 16 * 1024,
    },
  )
}
