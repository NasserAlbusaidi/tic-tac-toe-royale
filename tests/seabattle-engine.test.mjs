import { describe, expect, it } from 'vitest'
import {
  applyMove,
  assignParticipant,
  createRoom,
  nextRound,
  normalizeGameMode,
  placeFleet,
  publicRoom,
  resetMatch,
  startMatch,
} from '../server/game-engine.mjs'
import { FLEET, SEA_CELLS, validateFleet } from '../server/seabattle-engine.mjs'

// Ships on rows A..E, each starting in column 1, heading east.
const rowFleet = FLEET.map((ship, row) => ({ id: ship.id, index: row * 10, orientation: 'h' }))
// Ships in columns 1..5, each starting on row A, heading south.
const columnFleet = FLEET.map((ship, column) => ({ id: ship.id, index: column, orientation: 'v' }))
const rowFleetCells = FLEET.flatMap((ship, row) =>
  Array.from({ length: ship.size }, (_, offset) => row * 10 + offset),
)

function seaRoom(totalRounds = 1) {
  const room = createRoom({
    hostId: 'host-socket',
    hostName: 'Host',
    totalRounds,
    gameMode: 'seabattle',
    roomCode: 'SEA01',
  })

  assignParticipant(room, { clientId: 'guest-socket', name: 'Guest' })
  startMatch(room, 'host-socket')
  return room
}

function deployedRoom(totalRounds = 1) {
  const room = seaRoom(totalRounds)
  expect(placeFleet(room, 'host-socket', rowFleet).ok).toBe(true)
  expect(placeFleet(room, 'guest-socket', columnFleet).ok).toBe(true)
  return room
}

// A cell in the guest's waters (columns 6..10) that holds no ship.
const guestMisses = Array.from({ length: 50 }, (_, index) => Math.floor(index / 5) * 10 + 5 + (index % 5))

describe('sea battle', () => {
  it('is a recognised room mode', () => {
    expect(normalizeGameMode('seabattle')).toBe('seabattle')
    const room = seaRoom()
    expect(room.status).toBe('playing')
    expect(room.seabattle.phase).toBe('placing')
  })

  it('validates fleet layouts', () => {
    expect(validateFleet(rowFleet).ok).toBe(true)
    expect(validateFleet(rowFleet.slice(1)).ok).toBe(false)
    expect(validateFleet([...rowFleet.slice(1), rowFleet[1]]).error).toMatch(/exactly once/)
    expect(
      validateFleet([{ ...rowFleet[0], index: 7 }, ...rowFleet.slice(1)]).error,
    ).toMatch(/runs off the chart/)
    expect(
      validateFleet([{ ...rowFleet[0], index: 60, orientation: 'v' }, ...rowFleet.slice(1)]).error,
    ).toMatch(/runs off the chart/)
    expect(
      validateFleet([{ ...rowFleet[0], index: 10 }, ...rowFleet.slice(1)]).error,
    ).toMatch(/overlaps/)
    expect(
      validateFleet([{ ...rowFleet[0], orientation: 'd' }, ...rowFleet.slice(1)]).error,
    ).toMatch(/heading/)
    expect(
      validateFleet([{ ...rowFleet[0], index: SEA_CELLS }, ...rowFleet.slice(1)]).error,
    ).toMatch(/off the chart/)
  })

  it('keeps fleets secret from the opponent and spectators', () => {
    const room = seaRoom()
    assignParticipant(room, { clientId: 'watcher-1', name: 'Watcher' })
    placeFleet(room, 'host-socket', rowFleet)

    const hostView = publicRoom(room, 'host-socket')
    const guestView = publicRoom(room, 'guest-socket')
    const watcherView = publicRoom(room, 'watcher-1')

    expect(hostView.seabattle.yourFleet).toHaveLength(FLEET.length)
    expect(hostView.seabattle.ready).toEqual({ X: true, O: false })
    expect(guestView.seabattle.yourFleet).toBeNull()
    expect(guestView.seabattle.revealedFleets).toBeNull()
    expect(watcherView.seabattle.yourFleet).toBeNull()
    expect(watcherView.seabattle.revealedFleets).toBeNull()
    expect(JSON.stringify(guestView)).not.toContain('"cells"')
    expect(JSON.stringify(watcherView)).not.toContain('"cells"')
  })

  it('refuses to fire before both fleets are placed, and refuses a second placement', () => {
    const room = seaRoom()
    placeFleet(room, 'host-socket', rowFleet)
    expect(applyMove(room, 'host-socket', 50).error).toMatch(/Both fleets/)
    expect(placeFleet(room, 'host-socket', columnFleet).error).toMatch(/already locked/)
    expect(placeFleet(room, 'watcher', columnFleet).ok).toBe(false)
  })

  it('alternates turns, records hits and misses, and rejects repeat shots', () => {
    const room = deployedRoom()
    expect(room.seabattle.phase).toBe('firing')
    expect(room.turn).toBe('X')

    expect(applyMove(room, 'guest-socket', 0).error).toMatch(/Wait for your turn/)
    expect(applyMove(room, 'host-socket', 0).ok).toBe(true)
    expect(room.seabattle.shots.O[0]).toBe('hit')
    expect(room.turn).toBe('O')

    expect(applyMove(room, 'guest-socket', 99).ok).toBe(true)
    expect(room.seabattle.shots.X[99]).toBe('miss')
    expect(room.turn).toBe('X')

    expect(applyMove(room, 'host-socket', 0).error).toMatch(/already fired at A1/)
    expect(applyMove(room, 'host-socket', 100).error).toMatch(/off the chart/)
  })

  it('reveals a ship to everyone once it is sunk', () => {
    const room = deployedRoom()
    // The guest's Skiff (size 2) is in column 5, rows A..B: cells 4 and 14.
    applyMove(room, 'host-socket', 4)
    applyMove(room, 'guest-socket', 99)
    applyMove(room, 'host-socket', 14)

    const view = publicRoom(room, 'host-socket')
    expect(view.seabattle.sunk.O.map((ship) => ship.id)).toEqual(['skiff'])
    expect(view.seabattle.sunk.O[0].cells).toEqual([4, 14])
    expect(view.seabattle.lastShot).toMatchObject({ by: 'X', index: 14, result: 'hit', sunk: 'skiff' })
    expect(room.gameLog.at(-1).text).toMatch(/sank Guest's Skiff/)
  })

  it('wins the round when a fleet is destroyed and then reveals both fleets', () => {
    const room = deployedRoom(1)
    let miss = 0

    for (const cell of rowFleetCells) {
      // X wastes its shots on empty water while O sinks X's fleet.
      expect(applyMove(room, 'host-socket', guestMisses[miss++]).ok).toBe(true)
      expect(applyMove(room, 'guest-socket', cell).ok).toBe(true)
    }

    expect(room.status).toBe('matchOver')
    expect(room.winner).toBe('O')
    expect(room.matchWinner).toBe('O')
    expect(room.rounds[0].moves).toBe(rowFleetCells.length * 2)

    const view = publicRoom(room, 'host-socket')
    expect(view.seabattle.revealedFleets.O).toHaveLength(FLEET.length)
    expect(view.seabattle.revealedFleets.X).toHaveLength(FLEET.length)
  })

  it('starts a fresh deployment each round and on reset', () => {
    const room = deployedRoom(3)

    for (const [index, cell] of rowFleetCells.entries()) {
      applyMove(room, 'host-socket', guestMisses[index])
      applyMove(room, 'guest-socket', cell)
    }

    expect(room.status).toBe('roundOver')
    expect(nextRound(room, 'host-socket').ok).toBe(true)
    expect(room.seabattle.phase).toBe('placing')
    expect(room.seabattle.fleets).toEqual({ X: null, O: null })
    expect(room.lastEvent).toMatch(/place your fleets/)

    placeFleet(room, 'host-socket', rowFleet)
    placeFleet(room, 'guest-socket', columnFleet)
    expect(room.turn).toBe('O')

    expect(resetMatch(room, 'host-socket', 1).ok).toBe(true)
    expect(room.seabattle.phase).toBe('placing')
    expect(room.seabattle.shots.X.every((value) => value === null)).toBe(true)
  })

  it('does not attach sea battle state to other modes', () => {
    const room = createRoom({ hostId: 'host-socket', hostName: 'Host', roomCode: 'NORM1' })
    expect(publicRoom(room, 'host-socket').seabattle).toBeNull()
    expect(placeFleet(room, 'host-socket', rowFleet).error).toMatch(/not a Sea Battle/)
  })
})
