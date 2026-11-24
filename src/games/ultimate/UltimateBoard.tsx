import type { RoomState } from '../../types'
import { ultimateBoardIsPlayable } from './playable'
import './ultimate.css'

export function UltimateBoard({
  room,
  canPlay,
  onPlay,
}: {
  room: RoomState
  canPlay: boolean
  onPlay: (boardIndex: number, index: number) => void
}) {
  const ultimate = room.ultimate

  if (!ultimate) {
    return <p className="system-message">Ultimate board state is unavailable.</p>
  }

  const targetBoard =
    ultimate.targetBoard !== null &&
    ultimateBoardIsPlayable(room, ultimate.targetBoard)
      ? ultimate.targetBoard
      : null

  return (
    <div
      className={`ultimate-board ${canPlay ? 'active-turn' : ''}`}
      role="group"
      aria-label="Ultimate Tic Tac Toe board"
    >
      {ultimate.boards.map((board, boardIndex) => {
        const claim = ultimate.claims[boardIndex]
        const playable = ultimateBoardIsPlayable(room, boardIndex)
        const available = playable && (targetBoard === null || targetBoard === boardIndex)

        return (
          <section
            aria-label={`Board ${boardIndex + 1}${claim ? ` claimed ${claim}` : ''}`}
            className={[
              'ultimate-mini-board',
              available ? 'available' : '',
              targetBoard === boardIndex ? 'target-board' : '',
              claim === 'X' ? 'claimed-x' : '',
              claim === 'O' ? 'claimed-o' : '',
              claim === 'draw' ? 'claimed-draw' : '',
              room.winningLine.includes(boardIndex) ? 'ultimate-winning' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            key={boardIndex}
          >
            <span className="ultimate-board-number">{boardIndex + 1}</span>
            <div className="ultimate-mini-grid" role="grid">
              {board.map((cell, index) => (
                <button
                  aria-label={`Board ${boardIndex + 1}, cell ${index + 1}${cell ? `, ${cell}` : ''}`}
                  className={[
                    'ultimate-cell',
                    cell ? `mark-${cell.toLowerCase()}` : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  disabled={!canPlay || !available || Boolean(cell)}
                  key={index}
                  type="button"
                  onClick={() => onPlay(boardIndex, index)}
                >
                  {cell ?? <span>{index + 1}</span>}
                </button>
              ))}
            </div>
            {claim ? (
              <span className="ultimate-claim" aria-hidden="true">
                {claim === 'draw' ? '—' : claim}
              </span>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
