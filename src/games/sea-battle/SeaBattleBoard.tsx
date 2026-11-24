import { useEffect, useMemo, useState } from 'react'
import { Anchor, Check, RotateCw, Shuffle, Trash2 } from 'lucide-react'
import type {
  FleetSpecShip,
  Mark,
  PublicShip,
  RoomState,
  ShipOrientation,
  ShipPlacement,
  ShotResult,
} from '../../types'
import {
  cellLabel,
  type DraftFleet,
  occupiedCells,
  previewPlacement,
  randomFleet,
  SEA_SIZE,
  shipCells,
} from './fleet'
import './sea-battle.css'

const columns = Array.from({ length: SEA_SIZE }, (_, index) => index + 1)
const rows = Array.from({ length: SEA_SIZE }, (_, index) => String.fromCharCode(65 + index))

type ShipCell = {
  shipId: string
  state: 'afloat' | 'sunk' | 'revealed' | 'draft' | 'preview' | 'invalid'
  start: boolean
  end: boolean
  orientation: ShipOrientation
}

function shipCellMap(ships: Array<{ ship: PublicShip; state: ShipCell['state'] }>) {
  const map = new Map<number, ShipCell>()

  for (const { ship, state } of ships) {
    ship.cells.forEach((cell, offset) => {
      map.set(cell, {
        shipId: ship.id,
        state,
        start: offset === 0,
        end: offset === ship.cells.length - 1,
        orientation: ship.orientation,
      })
    })
  }

  return map
}

function SeaGrid({
  title,
  caption,
  shots,
  ships,
  compact = false,
  active = false,
  lastShot = null,
  disabled = true,
  cellLabelFor,
  onCell,
  onHover,
}: {
  title: string
  caption?: string
  shots: (ShotResult | null)[]
  ships: Map<number, ShipCell>
  compact?: boolean
  active?: boolean
  lastShot?: number | null
  disabled?: boolean
  cellLabelFor?: (index: number) => string
  onCell?: (index: number) => void
  onHover?: (index: number | null) => void
}) {
  return (
    <section
      className={['sea-panel', compact ? 'compact' : '', active ? 'active-turn' : '']
        .filter(Boolean)
        .join(' ')}
      aria-label={title}
    >
      <header className="sea-panel-head">
        <strong>{title}</strong>
        {caption ? <small>{caption}</small> : null}
      </header>
      <div className="sea-grid" onMouseLeave={() => onHover?.(null)}>
        <span className="sea-corner" aria-hidden="true" />
        {columns.map((column) => (
          <span className="sea-axis" key={`c${column}`} aria-hidden="true">
            {column}
          </span>
        ))}
        {rows.map((rowLabel, row) => (
          <div className="sea-row" key={rowLabel} role="row">
            <span className="sea-axis" aria-hidden="true">
              {rowLabel}
            </span>
            {columns.map((_, column) => {
              const index = row * SEA_SIZE + column
              const shot = shots[index]
              const ship = ships.get(index)

              return (
                <button
                  aria-label={cellLabelFor ? cellLabelFor(index) : cellLabel(index)}
                  className={[
                    'sea-cell',
                    ship ? `ship ship-${ship.state} ship-${ship.orientation}` : '',
                    ship?.start ? 'ship-start' : '',
                    ship?.end ? 'ship-end' : '',
                    shot ? `shot-${shot}` : '',
                    lastShot === index ? 'last-shot' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  disabled={disabled}
                  key={index}
                  type="button"
                  onClick={() => onCell?.(index)}
                  onFocus={() => onHover?.(index)}
                  onMouseEnter={() => onHover?.(index)}
                >
                  {shot ? <span className="shot-mark" aria-hidden="true" /> : null}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </section>
  )
}

function FleetRoster({
  title,
  spec,
  sunk,
}: {
  title: string
  spec: FleetSpecShip[]
  sunk: PublicShip[]
}) {
  const sunkIds = new Set(sunk.map((ship) => ship.id))

  return (
    <div className="fleet-roster">
      <span>{title}</span>
      <ul>
        {spec.map((ship) => (
          <li className={sunkIds.has(ship.id) ? 'sunk' : ''} key={ship.id}>
            <i aria-hidden="true">
              {Array.from({ length: ship.size }, (_, index) => (
                <b key={index} />
              ))}
            </i>
            {ship.name}
            {sunkIds.has(ship.id) ? <small>sunk</small> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

function FleetPlanner({
  spec,
  onLock,
}: {
  spec: FleetSpecShip[]
  onLock: (ships: ShipPlacement[]) => void
}) {
  const [draft, setDraft] = useState<DraftFleet>({})
  const [selected, setSelected] = useState<string | null>(spec[0]?.id ?? null)
  const [orientation, setOrientation] = useState<ShipOrientation>('h')
  const [hover, setHover] = useState<number | null>(null)

  const placedCount = spec.filter((ship) => draft[ship.id]).length
  const complete = placedCount === spec.length
  const selectedShip = spec.find((ship) => ship.id === selected) ?? null

  useEffect(() => {
    const rotate = (event: KeyboardEvent) => {
      if (event.key === 'r' || event.key === 'R') {
        const target = event.target as HTMLElement | null

        if (target?.closest('input, textarea')) {
          return
        }

        setOrientation((current) => (current === 'h' ? 'v' : 'h'))
      }
    }

    window.addEventListener('keydown', rotate)
    return () => window.removeEventListener('keydown', rotate)
  }, [])

  const preview =
    selectedShip && hover !== null
      ? previewPlacement(spec, draft, selectedShip, hover, orientation)
      : null

  const ships = useMemo(() => {
    const placed = spec
      .filter((ship) => draft[ship.id])
      .map((ship) => {
        const placement = draft[ship.id]
        return {
          ship: {
            ...ship,
            orientation: placement.orientation,
            cells: shipCells(ship.size, placement.index, placement.orientation) ?? [],
          },
          state: 'draft' as const,
        }
      })
    const map = shipCellMap(placed)

    if (preview && selectedShip) {
      preview.cells.forEach((cell, offset) => {
        map.set(cell, {
          shipId: selectedShip.id,
          state: preview.valid ? 'preview' : 'invalid',
          start: offset === 0,
          end: offset === preview.cells.length - 1,
          orientation,
        })
      })
    }

    return map
  }, [draft, orientation, preview, selectedShip, spec])

  function nextUnplaced(nextDraft: DraftFleet, after?: string) {
    const start = after ? spec.findIndex((ship) => ship.id === after) + 1 : 0
    const ordered = [...spec.slice(start), ...spec.slice(0, start)]
    return ordered.find((ship) => !nextDraft[ship.id])?.id ?? null
  }

  function handleCell(index: number) {
    const owner = occupiedCells(spec, draft).get(index)

    if (owner && (!selectedShip || owner !== selectedShip.id)) {
      // Pick an already placed ship back up.
      const { [owner]: lifted, ...rest } = draft
      setDraft(rest)
      setSelected(owner)
      setOrientation(lifted.orientation)
      return
    }

    if (!selectedShip) {
      return
    }

    if (!previewPlacement(spec, draft, selectedShip, index, orientation).valid) {
      return
    }

    const nextDraft = {
      ...draft,
      [selectedShip.id]: { id: selectedShip.id, index, orientation },
    }
    setDraft(nextDraft)
    setSelected(nextUnplaced(nextDraft, selectedShip.id))
  }

  return (
    <div className="fleet-planner">
      <SeaGrid
        title="Your waters"
        caption={
          selectedShip
            ? `Placing ${selectedShip.name} (${selectedShip.size}) · ${orientation === 'h' ? 'east' : 'south'}`
            : complete
              ? 'Fleet ready. Tap a ship to move it.'
              : 'Pick a ship'
        }
        shots={Array.from({ length: SEA_SIZE * SEA_SIZE }, () => null)}
        ships={ships}
        disabled={false}
        cellLabelFor={(index) => {
          const owner = occupiedCells(spec, draft).get(index)
          const ship = spec.find((item) => item.id === owner)
          return ship
            ? `${cellLabel(index)}, your ${ship.name}. Pick it up.`
            : selectedShip
              ? `Place ${selectedShip.name} at ${cellLabel(index)}`
              : cellLabel(index)
        }}
        onCell={handleCell}
        onHover={setHover}
      />

      <div className="planner-controls">
        <div className="planner-ships" role="group" aria-label="Ships to place">
          {spec.map((ship) => (
            <button
              className={[
                selected === ship.id ? 'active' : '',
                draft[ship.id] ? 'placed' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              key={ship.id}
              type="button"
              onClick={() => {
                if (draft[ship.id]) {
                  const { [ship.id]: lifted, ...rest } = draft
                  setDraft(rest)
                  setOrientation(lifted.orientation)
                }
                setSelected(ship.id)
              }}
            >
              <i aria-hidden="true">
                {Array.from({ length: ship.size }, (_, index) => (
                  <b key={index} />
                ))}
              </i>
              <span>{ship.name}</span>
              {draft[ship.id] ? <Check size={14} aria-label="placed" /> : null}
            </button>
          ))}
        </div>

        <div className="planner-actions">
          <button
            type="button"
            onClick={() => setOrientation((current) => (current === 'h' ? 'v' : 'h'))}
          >
            <RotateCw size={16} />
            Rotate <kbd>R</kbd>
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(randomFleet(spec))
              setSelected(null)
            }}
          >
            <Shuffle size={16} />
            Random
          </button>
          <button
            type="button"
            disabled={placedCount === 0}
            onClick={() => {
              setDraft({})
              setSelected(spec[0]?.id ?? null)
            }}
          >
            <Trash2 size={16} />
            Clear
          </button>
        </div>

        <button
          className="primary-action"
          disabled={!complete}
          type="button"
          onClick={() => onLock(spec.map((ship) => draft[ship.id]))}
        >
          <Anchor size={18} />
          {complete ? 'Lock in fleet' : `${spec.length - placedCount} ships to place`}
        </button>
      </div>
    </div>
  )
}

function otherMark(mark: Mark): Mark {
  return mark === 'X' ? 'O' : 'X'
}

export function SeaBattleBoard({
  room,
  canFire,
  onFire,
  onPlaceFleet,
}: {
  room: RoomState
  canFire: boolean
  onFire: (index: number) => void
  onPlaceFleet: (ships: ShipPlacement[]) => void
}) {
  const sea = room.seabattle

  if (!sea) {
    return <p className="system-message">Sea Battle state is unavailable.</p>
  }

  const me = room.you.mark
  const live = room.status === 'playing'

  if (live && me && sea.phase === 'placing' && !sea.ready[me]) {
    return <FleetPlanner spec={sea.fleetSpec} onLock={onPlaceFleet} />
  }

  const nameOf = (mark: Mark) => room.players[mark]?.name ?? mark
  const waterShips = (mark: Mark, includeOwn: boolean) => {
    const sunkIds = new Set(sea.sunk[mark].map((ship) => ship.id))
    const entries: Array<{ ship: PublicShip; state: ShipCell['state'] }> = []
    const known = includeOwn && sea.yourFleet ? sea.yourFleet : null
    const revealed = sea.revealedFleets?.[mark] ?? null

    for (const ship of known ?? revealed ?? []) {
      entries.push({
        ship,
        state: sunkIds.has(ship.id) ? 'sunk' : known ? 'afloat' : 'revealed',
      })
    }

    for (const ship of sea.sunk[mark]) {
      if (!entries.some((entry) => entry.ship.id === ship.id)) {
        entries.push({ ship, state: 'sunk' })
      }
    }

    return shipCellMap(entries)
  }
  const lastShotAt = (mark: Mark) =>
    sea.lastShot && sea.lastShot.by !== mark ? sea.lastShot.index : null
  const shotLabel = (mark: Mark) => (index: number) => {
    const shot = sea.shots[mark][index]
    return `${cellLabel(index)}${shot ? `, ${shot}` : ''}`
  }

  if (!me) {
    return (
      <div className="sea-battle spectating">
        {(['X', 'O'] as const).map((mark) => (
          <div className="sea-side" key={mark}>
            <SeaGrid
              title={`${nameOf(mark)}'s waters`}
              caption={sea.ready[mark] ? undefined : 'Deploying…'}
              shots={sea.shots[mark]}
              ships={waterShips(mark, false)}
              compact
              lastShot={lastShotAt(mark)}
              cellLabelFor={shotLabel(mark)}
            />
            <FleetRoster title={`${nameOf(mark)}'s fleet`} spec={sea.fleetSpec} sunk={sea.sunk[mark]} />
          </div>
        ))}
      </div>
    )
  }

  const enemy = otherMark(me)
  const firing = live && sea.phase === 'firing'
  const enemyCaption = !live
    ? 'Fleet revealed'
    : sea.phase === 'placing'
      ? `Waiting for ${nameOf(enemy)} to deploy`
      : canFire
        ? 'Your shot. Pick a target.'
        : `${nameOf(enemy)} is aiming…`

  return (
    <div className="sea-battle">
      <div className="sea-side primary">
        <SeaGrid
          title={`${nameOf(enemy)}'s waters`}
          caption={enemyCaption}
          shots={sea.shots[enemy]}
          ships={waterShips(enemy, false)}
          active={firing && canFire}
          disabled={!firing || !canFire}
          lastShot={lastShotAt(enemy)}
          cellLabelFor={(index) => {
            const shot = sea.shots[enemy][index]
            return shot ? `${cellLabel(index)}, ${shot}` : `Fire at ${cellLabel(index)}`
          }}
          onCell={(index) => {
            if (!sea.shots[enemy][index]) {
              onFire(index)
            }
          }}
        />
      </div>
      <div className="sea-side secondary">
        <SeaGrid
          title="Your waters"
          shots={sea.shots[me]}
          ships={waterShips(me, true)}
          compact
          lastShot={lastShotAt(me)}
          cellLabelFor={shotLabel(me)}
        />
        <FleetRoster title={`${nameOf(enemy)}'s fleet`} spec={sea.fleetSpec} sunk={sea.sunk[enemy]} />
        <FleetRoster title="Your fleet" spec={sea.fleetSpec} sunk={sea.sunk[me]} />
      </div>
    </div>
  )
}
