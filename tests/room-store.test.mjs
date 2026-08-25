import { describe, expect, it } from 'vitest'
import { createMemoryRoomStore } from '../server/room-store.mjs'

describe('memory room store', () => {
  it('serializes concurrent async reducers without losing either update', async () => {
    const store = createMemoryRoomStore()
    await store.create({ code: 'LOCK1', count: 0 })

    const increment = (label, delay) =>
      store.mutate('LOCK1', async (room) => {
        await new Promise((resolve) => setTimeout(resolve, delay))
        room.count += 1
        return { result: label }
      })

    const [first, second] = await Promise.all([
      increment('first', 8),
      increment('second', 0),
    ])

    expect(first.result).toBe('first')
    expect(second.result).toBe('second')
    expect((await store.read('LOCK1')).count).toBe(2)
    await store.close()
  })
})
