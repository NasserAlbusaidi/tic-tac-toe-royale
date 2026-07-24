import { useEffect, useMemo, useState } from 'react'
import {
  Copy,
  Crown,
  Play,
  RotateCcw,
  Share2,
  Sparkles,
  Trophy,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { io, type Socket } from 'socket.io-client'
import './App.css'
import type { Mark, RoomResponse, RoomState, Winner } from './types'

type ConnectionState = 'connecting' | 'online' | 'offline'
type LobbyMode = 'host' | 'join'

const roundOptions = [1, 3, 5, 7, 9]
const savedNameKey = 'xo-royale-name'

function getInitialRoomCode() {
  return new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? ''
}

function markLabel(mark: Mark | null) {
  if (!mark) {
    return 'Watching'
  }

  return mark === 'X' ? 'Crosses' : 'Noughts'
}

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

function scoreFor(room: RoomState, winner: Winner) {
  if (winner === 'X') {
    return room.scores.X
  }

  if (winner === 'O') {
    return room.scores.O
  }

  return room.scores.draws
}

function App() {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connection, setConnection] = useState<ConnectionState>('connecting')
  const [room, setRoom] = useState<RoomState | null>(null)
  const [mode, setMode] = useState<LobbyMode>(getInitialRoomCode() ? 'join' : 'host')
  const [playerName, setPlayerName] = useState(
    () => window.localStorage.getItem(savedNameKey) ?? '',
  )
  const [roomCode, setRoomCode] = useState(getInitialRoomCode())
  const [rounds, setRounds] = useState(5)
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const nextSocket = io({
      transports: ['websocket', 'polling'],
    })

    setSocket(nextSocket)
    nextSocket.on('connect', () => setConnection('online'))
    nextSocket.on('disconnect', () => setConnection('offline'))
    nextSocket.on('connect_error', () => setConnection('offline'))
    nextSocket.on('room:error', (error: string) => setMessage(error))
    nextSocket.on('room:state', (nextRoom: RoomState) => {
      setRoom(nextRoom)
      setMessage('')
      const nextUrl = new URL(window.location.href)
      nextUrl.searchParams.set('room', nextRoom.code)
      window.history.replaceState(null, '', nextUrl)
    })

    return () => {
      nextSocket.disconnect()
    }
  }, [])

  useEffect(() => {
    if (playerName.trim()) {
      window.localStorage.setItem(savedNameKey, playerName.trim())
    }
  }, [playerName])

  const shareUrl = useMemo(() => {
    if (!room) {
      return ''
    }

    const url = new URL(window.location.href)
    url.searchParams.set('room', room.code)
    return url.toString()
  }, [room])

  const canPlay = Boolean(
    room &&
      room.status === 'playing' &&
      room.you.mark &&
      room.turn === room.you.mark &&
      room.players[room.you.mark]?.connected,
  )

  const opponentMark = room?.you.mark === 'X' ? 'O' : room?.you.mark === 'O' ? 'X' : null
  const isWaitingForGuest = room?.status === 'lobby' && !room.players.O?.connected

  function handleCreateRoom() {
    if (!socket) {
      return
    }

    socket.emit(
      'room:create',
      { hostName: playerName, totalRounds: rounds },
      (response: RoomResponse) => {
        if (!response.ok || !response.room) {
          setMessage(response.error ?? 'Could not create room.')
          return
        }

        setRoom(response.room)
        setMessage('')
      },
    )
  }

  function handleJoinRoom() {
    if (!socket) {
      return
    }

    socket.emit(
      'room:join',
      { roomCode, name: playerName },
      (response: RoomResponse) => {
        if (!response.ok || !response.room) {
          setMessage(response.error ?? 'Could not join room.')
          return
        }

        setRoom(response.room)
        setMessage(
          response.role === 'spectator'
            ? 'Room is full. You joined the rail.'
            : `Joined as ${markLabel(response.mark ?? null)}.`,
        )
      },
    )
  }

  async function copyInvite() {
    if (!room || !shareUrl) {
      return
    }

    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  function emitRoomEvent(event: string, payload: Record<string, unknown> = {}) {
    if (!socket || !room) {
      return
    }

    socket.emit(event, { roomCode: room.code, ...payload })
  }

  function resetToLobby() {
    setRoom(null)
    setMessage('')
    const nextUrl = new URL(window.location.href)
    nextUrl.searchParams.delete('room')
    window.history.replaceState(null, '', nextUrl)
  }

  return (
    <main className="app-shell">
      <header className="topbar" aria-label="Game header">
        <a className="brand" href="/" onClick={(event) => event.preventDefault()}>
          <span className="brand-mark">XO</span>
          <span>
            <strong>XO Royale</strong>
            <small>private match room</small>
          </span>
        </a>
        <div className={`connection ${connection}`}>
          {connection === 'online' ? <Wifi size={18} /> : <WifiOff size={18} />}
          <span>{connection}</span>
        </div>
      </header>

      {!room ? (
        <section className="welcome-grid" aria-label="Create or join a match">
          <div className="welcome-copy">
            <span className="eyebrow">Browser table</span>
            <h1>Play a sharper Tic Tac Toe match.</h1>
            <p>Private table. Clean score. Every move visible.</p>
          </div>

          <div className="setup-panel">
            <div className="mode-switch" aria-label="Lobby mode">
              <button
                className={mode === 'host' ? 'active' : ''}
                type="button"
                onClick={() => setMode('host')}
              >
                <Crown size={18} />
                Host
              </button>
              <button
                className={mode === 'join' ? 'active' : ''}
                type="button"
                onClick={() => setMode('join')}
              >
                <Users size={18} />
                Join
              </button>
            </div>

            <label>
              <span>Name</span>
              <input
                autoComplete="name"
                maxLength={18}
                onChange={(event) => setPlayerName(event.target.value)}
                placeholder="Nasser"
                value={playerName}
              />
            </label>

            {mode === 'host' ? (
              <>
                <fieldset className="round-select">
                  <legend>Rounds</legend>
                  <div>
                    {roundOptions.map((option) => (
                      <button
                        className={rounds === option ? 'active' : ''}
                        key={option}
                        type="button"
                        onClick={() => setRounds(option)}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <button className="primary-action" type="button" onClick={handleCreateRoom}>
                  <Play size={19} />
                  Create room
                </button>
              </>
            ) : (
              <>
                <label>
                  <span>Room code</span>
                  <input
                    autoCapitalize="characters"
                    maxLength={5}
                    onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                    placeholder="A7KQ2"
                    value={roomCode}
                  />
                </label>
                <button className="primary-action" type="button" onClick={handleJoinRoom}>
                  <Play size={19} />
                  Join room
                </button>
              </>
            )}

            {message ? <p className="system-message">{message}</p> : null}
          </div>

          <div className="visual-panel" aria-hidden="true">
            <img src="/table-etch.svg" alt="" />
            <div className="sample-board">
              <span>X</span>
              <span></span>
              <span>O</span>
              <span></span>
              <span>X</span>
              <span></span>
              <span>O</span>
              <span></span>
              <span>X</span>
            </div>
          </div>
        </section>
      ) : (
        <section className="match-grid" aria-label={`Room ${room.code}`}>
          <aside className="room-panel">
            <div className="room-code">
              <span>Room</span>
              <strong>{room.code}</strong>
              <button type="button" onClick={copyInvite}>
                {copied ? <Sparkles size={18} /> : <Copy size={18} />}
                {copied ? 'Copied' : 'Copy invite'}
              </button>
            </div>

            <div className="player-list">
              <PlayerTile mark="X" player={room.players.X} you={room.you.mark === 'X'} />
              <PlayerTile mark="O" player={room.players.O} you={room.you.mark === 'O'} />
            </div>

            <div className="meta-strip">
              <span>{room.config.totalRounds} rounds</span>
              <span>Round {Math.min(room.currentRound, room.config.totalRounds)}</span>
              <span>{room.spectators.length} watching</span>
            </div>

            {message ? <p className="system-message">{message}</p> : null}

            <div className="host-controls">
              {room.you.isHost && room.status === 'lobby' ? (
                <button
                  className="primary-action"
                  disabled={!room.players.O?.connected}
                  type="button"
                  onClick={() => emitRoomEvent('match:start')}
                >
                  <Play size={19} />
                  {isWaitingForGuest ? 'Waiting for guest' : 'Start match'}
                </button>
              ) : null}

              {room.you.isHost && room.status === 'roundOver' ? (
                <button
                  className="primary-action"
                  type="button"
                  onClick={() => emitRoomEvent('round:next')}
                >
                  <Play size={19} />
                  Next round
                </button>
              ) : null}

              {room.you.isHost && room.status === 'matchOver' ? (
                <button
                  className="primary-action"
                  type="button"
                  onClick={() => emitRoomEvent('match:reset', { totalRounds: rounds })}
                >
                  <RotateCcw size={19} />
                  Reset table
                </button>
              ) : null}

              <button className="secondary-action" type="button" onClick={resetToLobby}>
                <Share2 size={18} />
                Leave room
              </button>
            </div>
          </aside>

          <section className="board-stage">
            <div className="match-status">
              <span>{room.lastEvent}</span>
              <h2>{winnerText(room)}</h2>
              <p>
                You are {markLabel(room.you.mark)}
                {opponentMark ? ` against ${room.players[opponentMark]?.name ?? opponentMark}` : ''}
              </p>
            </div>

            <div className={`board ${canPlay ? 'active-turn' : ''}`} role="grid">
              {room.board.map((cell, index) => (
                <button
                  aria-label={`Cell ${index + 1}${cell ? ` ${cell}` : ''}`}
                  className={[
                    'cell',
                    cell ? `mark-${cell.toLowerCase()}` : '',
                    room.winningLine.includes(index) ? 'winning' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  disabled={!canPlay || Boolean(cell)}
                  key={index}
                  type="button"
                  onClick={() => emitRoomEvent('cell:play', { index })}
                >
                  {cell}
                </button>
              ))}
            </div>

            <div className="round-track" aria-label="Round track">
              {Array.from({ length: room.config.totalRounds }, (_, index) => {
                const round = room.rounds[index]
                const active = index + 1 === room.currentRound && room.status === 'playing'

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
                    title={round ? `Round ${round.round}: ${round.winner}` : `Round ${index + 1}`}
                  />
                )
              })}
            </div>
          </section>

          <aside className="score-panel">
            <div className="score-card lead">
              <Trophy size={22} />
              <span>Score</span>
              <strong>
                {room.scores.X} - {room.scores.O}
              </strong>
              <small>{room.scores.draws} draws</small>
            </div>

            {(['X', 'O', 'draw'] as const).map((winner) => (
              <div className="score-card" key={winner}>
                <span>{winner === 'draw' ? 'Draws' : room.players[winner]?.name ?? winner}</span>
                <strong>{scoreFor(room, winner)}</strong>
              </div>
            ))}

            <div className="history-list">
              <h3>Rounds</h3>
              {room.rounds.length === 0 ? (
                <p>No rounds finished yet.</p>
              ) : (
                room.rounds.map((round) => (
                  <div className="history-item" key={round.round}>
                    <span>R{round.round}</span>
                    <strong>
                      {round.winner === 'draw'
                        ? 'Draw'
                        : `${room.players[round.winner as Mark]?.name ?? round.winner}`}
                    </strong>
                  </div>
                ))
              )}
            </div>
          </aside>
        </section>
      )}
    </main>
  )
}

function PlayerTile({
  mark,
  player,
  you,
}: {
  mark: Mark
  player: RoomState['players'][Mark]
  you: boolean
}) {
  return (
    <div className={`player-tile mark-${mark.toLowerCase()}`}>
      <span>{mark}</span>
      <strong>{player?.name ?? 'Open seat'}</strong>
      <small>
        {you ? 'You' : player?.connected ? 'Online' : player ? 'Disconnected' : 'Waiting'}
      </small>
    </div>
  )
}

export default App
