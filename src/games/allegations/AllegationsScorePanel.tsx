import { Scale } from 'lucide-react'
import type { RoomState } from '../../types'

export function AllegationsScorePanel({
  room,
  compact = false,
}: {
  room: RoomState
  compact?: boolean
}) {
  const court = room.allegations

  if (!court) {
    return null
  }

  const chaos = court.cases.filter((item) => item.outcome !== 'unanimous').length

  return (
    <section
      className={`allegations-score-panel${compact ? ' compact' : ''}`}
      aria-label="Criminal charges"
    >
      <header>
        <Scale size={compact ? 16 : 20} aria-hidden="true" />
        <span>Charges</span>
      </header>
      <div>
        <span>
          <small>Suspect X</small>
          <strong>{room.players.X?.name ?? 'Open seat'}</strong>
          <b>{court.charges.X}</b>
        </span>
        <span>
          <small>Suspect O</small>
          <strong>{room.players.O?.name ?? 'Open seat'}</strong>
          <b>{court.charges.O}</b>
        </span>
        <span className="court-chaos">
          <small>Dismissed</small>
          <strong>Court chaos</strong>
          <b>{chaos}</b>
        </span>
      </div>
    </section>
  )
}
