import { ConnectFourBoard } from '../connect-four/ConnectFourBoard'
import { markLabel } from '../modes'
import { TicTacToeBoard } from '../tic-tac-toe/TicTacToeBoard'
import { ultimateBoardIsPlayable } from '../ultimate/playable'
import { UltimateBoard } from '../ultimate/UltimateBoard'
import type { Mark, RoomState } from '../../types'
import './board-stage.css'

export type BoardMove = { index: number; boardIndex?: number }

function winnerText(room: RoomState) {
  if (room.status === 'matchOver') {
    if (room.matchWinner === 'draw') {
      return 'Match level'
    }

    if (room.matchWinner) {
      return `${room.players[room.matchWinner]?.name ?? room.matchWinner} takes the match`
    }

    return 'Match complete'
  }

  if (room.status === 'roundOver') {
    if (room.winner === 'draw') {
      return 'Round drawn'
    }

    return `${room.players[room.winner as Mark]?.name ?? room.winner} wins round ${room.currentRound}`
  }

  if (room.status === 'playing') {
    return `${room.players[room.turn]?.name ?? room.turn} to move`
  }

  return 'Lobby open'
}

/**
 * Stage for the four board games (Normal, Misère, Ultimate, Connect Four):
 * status header, mode guidance, the board itself, round track and result card.
 */
export function BoardStage({
  room,
  canPlay,
  onMove,
}: {
  room: RoomState
  canPlay: boolean
  onMove: (move: BoardMove) => void
}) {
  const opponentMark = room.you.mark === 'X' ? 'O' : room.you.mark === 'O' ? 'X' : null

  return (
    <div className={`board-live-content ${room.status === 'lobby' ? 'lobby-board-content' : ''}`}>
      <div className="match-status">
        <span>{room.lastEvent}</span>
        <h2>{winnerText(room)}</h2>
        <p>
          {room.config.mode === 'misere' ? 'Three in a row loses. ' : ''}
          {room.config.mode === 'ultimate'
            ? 'Claim three small boards in a row. '
            : ''}
          {room.config.mode === 'connect4'
            ? 'Drop discs into columns and connect four. '
            : ''}
          You are {markLabel(room.you.mark, room.config.mode)}
          {opponentMark
            ? ` against ${room.players[opponentMark]?.name ?? opponentMark}`
            : ''}
        </p>
      </div>

      {room.config.mode === 'misere' && room.status === 'playing' ? (
        <div className="misere-warning">
          Reverse pressure · completing any line loses the round
        </div>
      ) : null}

      {room.config.mode === 'ultimate' && room.status === 'playing' ? (
        <div className="ultimate-guidance">
          {room.ultimate?.targetBoard !== null &&
          room.ultimate?.targetBoard !== undefined &&
          ultimateBoardIsPlayable(room, room.ultimate.targetBoard)
            ? `Target board ${room.ultimate.targetBoard + 1} · moves use board.cell`
            : 'Open move · choose any unfinished board'}
        </div>
      ) : null}

      {room.config.mode === 'connect4' && room.status === 'playing' ? (
        <div className="connect-four-guidance">
          Choose an open column · the disc falls to the lowest space
        </div>
      ) : null}

      {room.config.mode === 'connect4' ? (
        <ConnectFourBoard
          room={room}
          canPlay={canPlay}
          onPlay={(column) => onMove({ index: column })}
        />
      ) : room.config.mode === 'ultimate' ? (
        <UltimateBoard
          room={room}
          canPlay={canPlay}
          onPlay={(boardIndex, index) => onMove({ boardIndex, index })}
        />
      ) : (
        <TicTacToeBoard room={room} canPlay={canPlay} onPlay={(index) => onMove({ index })} />
      )}

      <div className="round-track" aria-label="Round track">
        {Array.from({ length: room.config.totalRounds }, (_, index) => {
          const round = room.rounds[index]
          const active =
            index + 1 === room.currentRound && room.status === 'playing'

          return (
            <span
              className={[
                'round-dot',
                active ? 'active' : '',
                round?.winner === 'X' ? 'x-win' : '',
                round?.winner === 'O' ? 'o-win' : '',
                round?.winner === 'draw' ? 'draw' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              key={index}
              title={
                round ? `Round ${round.round}: ${round.winner}` : `Round ${index + 1}`
              }
            />
          )
        })}
      </div>
      <div className="round-caption">
        <span>
          Round {Math.min(room.currentRound, room.config.totalRounds)} of{' '}
          {room.config.totalRounds}
        </span>
        <span>{room.status === 'playing' ? 'Match in progress' : room.lastEvent}</span>
      </div>

      {room.status === 'roundOver' || room.status === 'matchOver' ? (
        <div className="mobile-result-card">
          <strong>
            {room.status === 'matchOver'
              ? `${room.scores.X} – ${room.scores.O} final`
              : `Score ${room.scores.X} – ${room.scores.O}`}
          </strong>
          <small>
            {room.status === 'matchOver'
              ? 'The table is ready for a reset.'
              : 'The host controls the next round.'}
          </small>
        </div>
      ) : null}
    </div>
  )
}
