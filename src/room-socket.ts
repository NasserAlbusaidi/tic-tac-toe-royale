import type { RoomResponse, RoomState } from './types'

type ConnectionState = 'connecting' | 'online' | 'offline'

type PendingRequest = {
  resolve: (response: RoomResponse) => void
  reject: (error: Error) => void
  timer: number
}

type ActiveRoom = {
  roomCode: string
  name: string
  resumeToken: string
}

type RoomSocketOptions = {
  clientId: string
  onConnection: (state: ConnectionState) => void
  onRoomState: (room: RoomState) => void
  onError: (message: string) => void
  onResumeFailure: () => void
}

function websocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/api/ws`
}

export class RoomSocket {
  private readonly options: RoomSocketOptions
  private socket: WebSocket | null = null
  private pending = new Map<string, PendingRequest>()
  private reconnectTimer: number | null = null
  private reconnectDelay = 1000
  private cancelled = false
  private activeRoom: ActiveRoom | null = null

  constructor(options: RoomSocketOptions) {
    this.options = options
  }

  connect() {
    this.cancelled = false
    this.open()
  }

  disconnect() {
    this.cancelled = true

    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    this.rejectPending(new Error('Connection closed.'))
    this.socket?.close()
    this.socket = null
  }

  setActiveRoom(activeRoom: ActiveRoom | null) {
    this.activeRoom = activeRoom
  }

  async request(
    type: string,
    payload: Record<string, unknown> = {},
  ): Promise<RoomResponse> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('The game server is offline. Wait for it to reconnect.')
    }

    const requestId = crypto.randomUUID()

    return new Promise<RoomResponse>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error('The game server took too long to respond.'))
      }, 10_000)

      this.pending.set(requestId, { resolve, reject, timer })
      this.socket?.send(
        JSON.stringify({
          type,
          requestId,
          payload: {
            ...payload,
            clientId: this.options.clientId,
          },
        }),
      )
    })
  }

  send(type: string, payload: Record<string, unknown> = {}) {
    void this.request(type, payload).catch((error: Error) => {
      this.options.onError(error.message)
    })
  }

  private open() {
    if (this.cancelled) {
      return
    }

    this.options.onConnection('connecting')
    const socket = new WebSocket(websocketUrl())
    this.socket = socket

    socket.addEventListener('open', () => {
      this.reconnectDelay = 1000
      this.options.onConnection('online')

      if (this.activeRoom) {
        void this.request('room:resume', {
          roomCode: this.activeRoom.roomCode,
          name: this.activeRoom.name,
          resumeToken: this.activeRoom.resumeToken,
        })
          .then((result) => {
            if (!result.ok) {
              this.options.onError(result.error ?? 'Could not restore the room.')
              this.options.onResumeFailure()
            }
          })
          .catch((error: Error) => {
            this.options.onError(error.message)
          })
      }
    })

    socket.addEventListener('message', (event) => {
      this.handleMessage(event.data)
    })

    socket.addEventListener('close', () => {
      if (this.socket === socket) {
        this.socket = null
      }

      this.rejectPending(new Error('Connection interrupted. Reconnecting…'))
      this.options.onConnection('offline')

      if (!this.cancelled) {
        this.reconnectTimer = window.setTimeout(() => {
          this.reconnectTimer = null
          this.open()
        }, this.reconnectDelay)
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000)
      }
    })

    socket.addEventListener('error', () => {
      socket.close()
    })
  }

  private handleMessage(raw: unknown) {
    let message: {
      type?: string
      requestId?: string
      payload?: RoomResponse | RoomState | string
    }

    try {
      message = JSON.parse(String(raw))
    } catch {
      return
    }

    if (message.type === 'response' && message.requestId) {
      const request = this.pending.get(message.requestId)

      if (request) {
        window.clearTimeout(request.timer)
        this.pending.delete(message.requestId)
        request.resolve(message.payload as RoomResponse)
      }

      return
    }

    if (message.type === 'room:state') {
      this.options.onRoomState(message.payload as RoomState)
      return
    }

    if (message.type === 'room:error') {
      this.options.onError(String(message.payload ?? 'Something went wrong.'))
    }
  }

  private rejectPending(error: Error) {
    for (const request of this.pending.values()) {
      window.clearTimeout(request.timer)
      request.reject(error)
    }

    this.pending.clear()
  }
}

export type { ConnectionState }
