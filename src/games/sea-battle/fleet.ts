import type { FleetSpecShip, ShipOrientation, ShipPlacement } from '../../types'

export const SEA_SIZE = 10

export function cellLabel(index: number) {
  return `${String.fromCharCode(65 + Math.floor(index / SEA_SIZE))}${(index % SEA_SIZE) + 1}`
}

/** Cells a ship covers, or null if it would run off the grid. Mirrors server/seabattle-engine.mjs. */
export function shipCells(size: number, index: number, orientation: ShipOrientation) {
  const row = Math.floor(index / SEA_SIZE)
  const column = index % SEA_SIZE

  if (
    index < 0 ||
    index >= SEA_SIZE * SEA_SIZE ||
    (orientation === 'h' && column + size > SEA_SIZE) ||
    (orientation === 'v' && row + size > SEA_SIZE)
  ) {
    return null
  }

  return Array.from({ length: size }, (_, offset) =>
    orientation === 'h' ? index + offset : index + offset * SEA_SIZE,
  )
}

export type DraftFleet = Record<string, ShipPlacement>

export function occupiedCells(spec: FleetSpecShip[], draft: DraftFleet, ignoreId?: string) {
  const occupied = new Map<number, string>()

  for (const ship of spec) {
    const placed = draft[ship.id]

    if (!placed || ship.id === ignoreId) {
      continue
    }

    for (const cell of shipCells(ship.size, placed.index, placed.orientation) ?? []) {
      occupied.set(cell, ship.id)
    }
  }

  return occupied
}

/** Where `ship` would sit if dropped at `index`, and whether that is legal. */
export function previewPlacement(
  spec: FleetSpecShip[],
  draft: DraftFleet,
  ship: FleetSpecShip,
  index: number,
  orientation: ShipOrientation,
) {
  const cells = shipCells(ship.size, index, orientation)
  const occupied = occupiedCells(spec, draft, ship.id)
  const valid = Boolean(cells && cells.every((cell) => !occupied.has(cell)))
  return { cells: cells ?? [], valid }
}

export function randomFleet(spec: FleetSpecShip[], random = Math.random): DraftFleet {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const draft: DraftFleet = {}
    let failed = false

    for (const ship of spec) {
      let placed = false

      for (let tries = 0; tries < 200 && !placed; tries += 1) {
        const orientation: ShipOrientation = random() < 0.5 ? 'h' : 'v'
        const index = Math.floor(random() * SEA_SIZE * SEA_SIZE)

        if (previewPlacement(spec, draft, ship, index, orientation).valid) {
          draft[ship.id] = { id: ship.id, index, orientation }
          placed = true
        }
      }

      if (!placed) {
        failed = true
        break
      }
    }

    if (!failed) {
      return draft
    }
  }

  return {}
}
