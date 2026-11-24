// Sea Battle: each player secretly places a fleet on a 10×10 grid, then the
// two take turns firing at each other's waters. The server holds both fleets;
// publicSeaBattleState() is the only thing that leaves it, and it never sends
// a ship the viewer is not allowed to see.

export const SEA_SIZE = 10
export const SEA_CELLS = SEA_SIZE * SEA_SIZE

export const FLEET = [
  { id: 'flagship', name: 'Flagship', size: 5 },
  { id: 'cruiser', name: 'Cruiser', size: 4 },
  { id: 'frigate', name: 'Frigate', size: 3 },
  { id: 'corvette', name: 'Corvette', size: 3 },
  { id: 'skiff', name: 'Skiff', size: 2 },
]

const FLEET_CELLS = FLEET.reduce((total, ship) => total + ship.size, 0)

function emptyWaters() {
  return Array.from({ length: SEA_CELLS }, () => null)
}

export function createSeaBattleState() {
  return {
    phase: 'placing',
    fleets: { X: null, O: null },
    shots: { X: emptyWaters(), O: emptyWaters() },
    lastShot: null,
  }
}

export function cellLabel(index) {
  const row = Math.floor(index / SEA_SIZE)
  const column = index % SEA_SIZE
  return `${String.fromCharCode(65 + row)}${column + 1}`
}

/**
 * Validates a fleet layout sent by a client: every ship in FLEET exactly once,
 * straight, inside the grid, and not overlapping another ship.
 * Ships may touch. Returns the normalized fleet or an error.
 */
export function validateFleet(layout) {
  if (!Array.isArray(layout) || layout.length !== FLEET.length) {
    return { ok: false, error: `Place all ${FLEET.length} ships.` }
  }

  const occupied = new Set()
  const fleet = []

  for (const spec of FLEET) {
    const placed = layout.filter((ship) => ship && ship.id === spec.id)

    if (placed.length !== 1) {
      return { ok: false, error: `Place your ${spec.name} exactly once.` }
    }

    const { index, orientation } = placed[0]
    const start = Number(index)

    if (!Number.isInteger(start) || start < 0 || start >= SEA_CELLS) {
      return { ok: false, error: `Your ${spec.name} is off the chart.` }
    }

    if (orientation !== 'h' && orientation !== 'v') {
      return { ok: false, error: `Your ${spec.name} needs a heading.` }
    }

    const row = Math.floor(start / SEA_SIZE)
    const column = start % SEA_SIZE

    if (
      (orientation === 'h' && column + spec.size > SEA_SIZE) ||
      (orientation === 'v' && row + spec.size > SEA_SIZE)
    ) {
      return { ok: false, error: `Your ${spec.name} runs off the chart.` }
    }

    const cells = Array.from({ length: spec.size }, (_, offset) =>
      orientation === 'h' ? start + offset : start + offset * SEA_SIZE,
    )

    if (cells.some((cell) => occupied.has(cell))) {
      return { ok: false, error: `Your ${spec.name} overlaps another ship.` }
    }

    cells.forEach((cell) => occupied.add(cell))
    fleet.push({ id: spec.id, name: spec.name, size: spec.size, orientation, cells })
  }

  return { ok: true, fleet }
}

/** Stores a validated fleet. Returns { ok, bothReady } or an error. */
export function placeFleetInState(state, mark, layout) {
  if (state.phase !== 'placing') {
    return { ok: false, error: 'The fleets are already at sea.' }
  }

  if (state.fleets[mark]) {
    return { ok: false, error: 'Your fleet is already locked in.' }
  }

  const result = validateFleet(layout)

  if (!result.ok) {
    return result
  }

  state.fleets[mark] = result.fleet
  const bothReady = Boolean(state.fleets.X && state.fleets.O)

  if (bothReady) {
    state.phase = 'firing'
  }

  return { ok: true, bothReady }
}

function shipIsSunk(ship, waters) {
  return ship.cells.every((cell) => waters[cell] === 'hit')
}

/**
 * Fires `shooter`'s shot at the opponent's waters.
 * Returns { ok, result: 'hit' | 'miss', sunk: ship | null, fleetDestroyed }.
 */
export function fireShotInState(state, shooter, index) {
  if (state.phase !== 'firing') {
    return { ok: false, error: 'Both fleets must be placed before firing.' }
  }

  const cell = Number(index)

  if (!Number.isInteger(cell) || cell < 0 || cell >= SEA_CELLS) {
    return { ok: false, error: 'That shot lands off the chart.' }
  }

  const target = shooter === 'X' ? 'O' : 'X'
  const waters = state.shots[target]

  if (waters[cell]) {
    return { ok: false, error: `You already fired at ${cellLabel(cell)}.` }
  }

  const ship = state.fleets[target].find((candidate) => candidate.cells.includes(cell))
  const result = ship ? 'hit' : 'miss'
  waters[cell] = result

  const sunk = ship && shipIsSunk(ship, waters) ? ship : null
  const fleetDestroyed =
    waters.filter((value) => value === 'hit').length === FLEET_CELLS

  state.lastShot = {
    by: shooter,
    index: cell,
    result,
    sunk: sunk ? sunk.id : null,
  }

  return { ok: true, result, sunk, fleetDestroyed }
}

function publicShip(ship) {
  return {
    id: ship.id,
    name: ship.name,
    size: ship.size,
    orientation: ship.orientation,
    cells: [...ship.cells],
  }
}

/**
 * What one viewer may see. Shots are public. A fleet is visible to its owner,
 * a sunk ship to everyone, and both fleets once the round is over.
 * Spectators never see an unsunk ship mid-round.
 */
export function publicSeaBattleState(state, { viewerMark, revealed }) {
  const safe = state ?? createSeaBattleState()
  const sunkFor = (mark) =>
    (safe.fleets[mark] ?? [])
      .filter((ship) => shipIsSunk(ship, safe.shots[mark]))
      .map(publicShip)
  const fleetFor = (mark) =>
    safe.fleets[mark] ? safe.fleets[mark].map(publicShip) : null

  return {
    phase: safe.phase,
    size: SEA_SIZE,
    fleetSpec: FLEET.map((ship) => ({ ...ship })),
    ready: {
      X: Boolean(safe.fleets.X),
      O: Boolean(safe.fleets.O),
    },
    shots: {
      X: [...safe.shots.X],
      O: [...safe.shots.O],
    },
    sunk: {
      X: sunkFor('X'),
      O: sunkFor('O'),
    },
    yourFleet: viewerMark ? fleetFor(viewerMark) : null,
    revealedFleets: revealed
      ? { X: fleetFor('X'), O: fleetFor('O') }
      : null,
    lastShot: safe.lastShot ? { ...safe.lastShot } : null,
  }
}

export function seaBattleShotCount(state) {
  if (!state) {
    return 0
  }

  return [...state.shots.X, ...state.shots.O].filter(Boolean).length
}
