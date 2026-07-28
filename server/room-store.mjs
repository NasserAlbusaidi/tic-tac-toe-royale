import Redis from 'ioredis'

export const ROOM_TTL_SECONDS = 6 * 60 * 60

const roomPrefix = 'xo-royale:room:'
const roomEventsKey = 'xo-royale:room-events'
const maxMutationAttempts = 6

function normalizeCode(code) {
  return String(code ?? '').trim().toUpperCase()
}

function roomKey(code) {
  return `${roomPrefix}${normalizeCode(code)}`
}

function clone(value) {
  return structuredClone(value)
}

function parseEventFields(fields) {
  const event = {}

  for (let index = 0; index < fields.length; index += 2) {
    event[fields[index]] = fields[index + 1]
  }

  return event
}

export function createMemoryRoomStore() {
  const rooms = new Map()
  const listeners = new Set()

  function publish(code) {
    for (const listener of listeners) {
      queueMicrotask(() => listener(code))
    }
  }

  return {
    kind: 'memory',

    async create(room) {
      if (rooms.has(room.code)) {
        return false
      }

      rooms.set(room.code, clone(room))
      publish(room.code)
      return true
    },

    async read(code) {
      const room = rooms.get(normalizeCode(code))
      return room ? clone(room) : null
    },

    async mutate(code, update) {
      const normalizedCode = normalizeCode(code)
      const current = rooms.get(normalizedCode)

      if (!current) {
        return null
      }

      const draft = clone(current)
      const outcome = await update(draft)

      if (outcome?.commit === false) {
        return { room: clone(current), result: outcome.result }
      }

      rooms.set(normalizedCode, draft)
      publish(normalizedCode)
      return { room: clone(draft), result: outcome?.result }
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    async close() {
      rooms.clear()
      listeners.clear()
    },
  }
}

export function createRedisRoomStore(redisUrl) {
  if (!redisUrl) {
    throw new Error('REDIS_URL is required for the Redis room store.')
  }

  const redis = new Redis(redisUrl, {
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
  })

  function addRoomEvent(transaction, code) {
    transaction.xadd(
      roomEventsKey,
      'MAXLEN',
      '~',
      1000,
      '*',
      'room',
      normalizeCode(code),
    )
  }

  return {
    kind: 'redis',

    async create(room) {
      const created = await redis.set(
        roomKey(room.code),
        JSON.stringify(room),
        'EX',
        ROOM_TTL_SECONDS,
        'NX',
      )

      if (created !== 'OK') {
        return false
      }

      await redis.xadd(
        roomEventsKey,
        'MAXLEN',
        '~',
        1000,
        '*',
        'room',
        room.code,
      )
      return true
    },

    async read(code) {
      const raw = await redis.get(roomKey(code))
      return raw ? JSON.parse(raw) : null
    },

    async mutate(code, update) {
      const normalizedCode = normalizeCode(code)
      const client = redis.duplicate()

      try {
        for (let attempt = 0; attempt < maxMutationAttempts; attempt += 1) {
          await client.watch(roomKey(normalizedCode))
          const raw = await client.get(roomKey(normalizedCode))

          if (!raw) {
            await client.unwatch()
            return null
          }

          const current = JSON.parse(raw)
          const draft = clone(current)
          const outcome = await update(draft)

          if (outcome?.commit === false) {
            await client.unwatch()
            return { room: current, result: outcome.result }
          }

          const transaction = client.multi()
          transaction.set(
            roomKey(normalizedCode),
            JSON.stringify(draft),
            'EX',
            ROOM_TTL_SECONDS,
          )
          addRoomEvent(transaction, normalizedCode)

          const committed = await transaction.exec()

          if (committed) {
            return { room: draft, result: outcome?.result }
          }
        }
      } finally {
        client.disconnect()
      }

      throw new Error('The room changed too quickly. Please try again.')
    },

    subscribe(listener) {
      const reader = redis.duplicate()
      let active = true
      let lastId = '$'

      void (async () => {
        while (active) {
          try {
            const response = await reader.xread(
              'BLOCK',
              5000,
              'COUNT',
              50,
              'STREAMS',
              roomEventsKey,
              lastId,
            )

            if (!response) {
              continue
            }

            for (const [, events] of response) {
              for (const [eventId, fields] of events) {
                lastId = eventId
                const event = parseEventFields(fields)

                if (event.room) {
                  await listener(event.room)
                }
              }
            }
          } catch (error) {
            if (active) {
              console.error('Redis room subscription failed.', error)
            }
          }
        }
      })()

      return () => {
        active = false
        reader.disconnect()
      }
    },

    async close() {
      redis.disconnect()
    },
  }
}

export function createRoomStore(redisUrl = process.env.REDIS_URL) {
  return redisUrl ? createRedisRoomStore(redisUrl) : createMemoryRoomStore()
}
