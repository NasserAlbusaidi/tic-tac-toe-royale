import type { RoomState } from '../../types'
import './tic-tac-toe.css'

/** The 3×3 board shared by Normal and Misère. */
export function TicTacToeBoard({
  room,
  canPlay,
  onPlay,
}: {
  room: RoomState
  canPlay: boolean
  onPlay: (index: number) => void
}) {
  return (
    <div className={`board ${canPlay ? 'active-turn' : ''}`} role="grid">
      {room.board.map((cell, index) => (
        <button
          aria-label={`Cell ${index + 1}${cell ? ` ${cell}` : ''}`}
          className={[
            'cell',
            cell ? `mark-${cell.toLowerCase()}` : '',
            room.winningLine.includes(index)
              ? room.config.mode === 'misere'
                ? 'losing'
                : 'winning'
              : '',
          ]
            .filter(Boolean)
            .join(' ')}
          disabled={!canPlay || Boolean(cell)}
          key={index}
          type="button"
          onClick={() => onPlay(index)}
        >
          {cell}
        </button>
      ))}
    </div>
  )
}
