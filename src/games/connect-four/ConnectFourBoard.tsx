import { markLabel } from '../modes'
import type { RoomState } from '../../types'
import './connect-four.css'

const connectFourRows = 6
const connectFourColumns = 7

export function ConnectFourBoard({
  room,
  canPlay,
  onPlay,
}: {
  room: RoomState
  canPlay: boolean
  onPlay: (column: number) => void
}) {
  const landingIndex = (column: number) => {
    for (let row = connectFourRows - 1; row >= 0; row -= 1) {
      const index = row * connectFourColumns + column

      if (!room.board[index]) {
        return index
      }
    }

    return -1
  }

  return (
    <div className="connect-four-shell">
      <div className="connect-four-column-labels" aria-hidden="true">
        {Array.from({ length: connectFourColumns }, (_, column) => (
          <span key={column}>{column + 1}</span>
        ))}
      </div>
      <div
        className={`connect-four-board ${canPlay ? 'active-turn' : ''}`}
        role="group"
        aria-label="Connect Four board. Choose a column from 1 through 7."
      >
        {Array.from({ length: connectFourColumns }, (_, column) => {
          const landing = landingIndex(column)

          return (
            <button
              aria-label={
                landing < 0
                  ? `Column ${column + 1}, full`
                  : `Drop ${markLabel(room.turn, room.config.mode)} in column ${column + 1}`
              }
              className="connect-four-column"
              disabled={!canPlay || landing < 0}
              key={column}
              type="button"
              onClick={() => onPlay(column)}
            >
              {Array.from({ length: connectFourRows }, (_, row) => {
                const index = row * connectFourColumns + column
                const mark = room.board[index]

                return (
                  <span
                    className={[
                      'connect-four-slot',
                      index === landing && canPlay ? 'landing-slot' : '',
                      room.winningLine.includes(index) ? 'winning' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    key={row}
                    aria-hidden="true"
                  >
                    {mark ? (
                      <span className={`connect-four-disc mark-${mark.toLowerCase()}`} />
                    ) : null}
                  </span>
                )
              })}
            </button>
          )
        })}
      </div>
      <div className="connect-four-foot" aria-hidden="true" />
    </div>
  )
}
