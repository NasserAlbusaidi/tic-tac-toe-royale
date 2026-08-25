import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart3,
  Copy,
  Crown,
  Fingerprint,
  Gavel,
  Grid3X3,
  ListOrdered,
  MessageCircle,
  Play,
  RotateCcw,
  Send,
  Share2,
  Sparkles,
  Trophy,
  Users,
  Wifi,
  WifiOff,
  X as XIcon,
} from 'lucide-react'
import './App.css'
import { AllegationsLobbyOptions } from './games/allegations/AllegationsLobbyOptions'
import { AllegationsScorePanel } from './games/allegations/AllegationsScorePanel'
import { AllegationsStage } from './games/allegations/AllegationsStage'
import { RoomSocket, type ConnectionState } from './room-socket'
import type {
  AllegationsPack,
  AllegationsTone,
  GameMode,
  Mark,
  RoomState,
  Winner,
} from './types'

type LobbyMode = 'host' | 'join'
type MobilePanel = 'scores' | 'chat' | null
type CommunicationTab = 'chat' | 'log'
type DesktopRailTab = 'scores' | CommunicationTab

const roundOptions = [1, 3, 5, 7, 9]
const connectFourRows = 6
const connectFourColumns = 7
const chatMessageLimit = 280
const savedNameKey = 'xo-royale-name'
const clientIdKey = 'xo-royale-client-id'
const activeRoomKey = 'xo-royale-active-room'
const roomTokenKey = (roomCode: string) =>
  `xo-royale-room-token:${roomCode.trim().toUpperCase()}`

function getInitialRoomCode() {
  return new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? ''
}

function getClientId() {
  const savedClientId = window.sessionStorage.getItem(clientIdKey)

  if (savedClientId) {
    return savedClientId
  }

  const clientId = crypto.randomUUID()
  window.sessionStorage.setItem(clientIdKey, clientId)
  return clientId
}

function markLabel(mark: Mark | null, mode?: GameMode) {
  if (!mark) {
    return 'Watching'
  }

  if (mode === 'connect4') {
    return mark === 'X' ? 'Brass discs' : 'Aqua discs'
  }

  if (mode === 'allegations') {
    return `Suspect ${mark}`
  }

  return mark === 'X' ? 'Crosses' : 'Noughts'
}

function modeLabel(mode: GameMode) {
  if (mode === 'misere') {
    return 'Misère'
  }

  if (mode === 'ultimate') {
    return 'Ultimate'
  }

  if (mode === 'connect4') {
    return 'Connect Four'
  }

  if (mode === 'allegations') {
    return 'The Allegations'
  }

  return 'Normal'
}

function modeSummary(mode: GameMode) {
  if (mode === 'misere') {
    return 'Misère · three loses'
  }

  if (mode === 'ultimate') {
    return 'Ultimate · claim three boards'
  }

  if (mode === 'connect4') {
    return 'Connect Four · link four discs'
  }

  if (mode === 'allegations') {
    return 'The Allegations · sealed verdicts'
  }

  return 'Normal · three wins'
}

function ultimateBoardIsPlayable(room: RoomState, boardIndex: number) {
  const ultimate = room.ultimate

  return Boolean(
    ultimate &&
      ultimate.claims[boardIndex] === null &&
      ultimate.boards[boardIndex]?.some((cell) => cell === null),
  )
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

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function useMobileLayout() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 760px)').matches,
  )

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return undefined
    }

    const query = window.matchMedia('(max-width: 760px)')
    const update = () => setIsMobile(query.matches)

    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return isMobile
}

function App() {
  const socketRef = useRef<RoomSocket | null>(null)
  const clientIdRef = useRef(getClientId())
  const [connection, setConnection] = useState<ConnectionState>('connecting')
  const [room, setRoom] = useState<RoomState | null>(null)
  const [mode, setMode] = useState<LobbyMode>(getInitialRoomCode() ? 'join' : 'host')
  const [playerName, setPlayerName] = useState(
    () => window.localStorage.getItem(savedNameKey) ?? '',
  )
  const [roomCode, setRoomCode] = useState(getInitialRoomCode())
  const [rounds, setRounds] = useState(5)
  const [gameMode, setGameMode] = useState<GameMode>('normal')
  const [allegationsPack, setAllegationsPack] =
    useState<AllegationsPack>('sensei')
  const [allegationsTone, setAllegationsTone] =
    useState<AllegationsTone>('feral')
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null)
  const [communicationTab, setCommunicationTab] =
    useState<CommunicationTab>('chat')
  const [desktopRailTab, setDesktopRailTab] =
    useState<DesktopRailTab>('scores')
  const [chatDraft, setChatDraft] = useState('')
  const [sendingChat, setSendingChat] = useState(false)
  const [unreadChat, setUnreadChat] = useState(0)
  const isMobile = useMobileLayout()
  const lastChatRoomRef = useRef<string | null>(null)
  const lastChatMessageIdRef = useRef<string | null>(null)

  useEffect(() => {
    const nextSocket = new RoomSocket({
      clientId: clientIdRef.current,
      onConnection: setConnection,
      onError: setMessage,
      onResumeFailure: () => {
        const failedRoom =
          window.sessionStorage.getItem(activeRoomKey) ?? getInitialRoomCode()
        window.sessionStorage.removeItem(activeRoomKey)

        if (failedRoom) {
          window.sessionStorage.removeItem(roomTokenKey(failedRoom))
        }

        setRoom(null)
      },
      onRoomState: (nextRoom) => {
        setRoom(nextRoom)
        setMessage('')
        window.sessionStorage.setItem(activeRoomKey, nextRoom.code)
        const nextUrl = new URL(window.location.href)
        nextUrl.searchParams.set('room', nextRoom.code)
        window.history.replaceState(null, '', nextUrl)
      },
    })

    const activeRoom = window.sessionStorage.getItem(activeRoomKey)
    const initialRoom = getInitialRoomCode()
    const savedName = window.localStorage.getItem(savedNameKey) ?? ''
    const activeResumeToken = activeRoom
      ? window.sessionStorage.getItem(roomTokenKey(activeRoom))
      : null

    if (activeRoom && activeRoom === initialRoom && activeResumeToken) {
      nextSocket.setActiveRoom({
        roomCode: activeRoom,
        name: savedName,
        resumeToken: activeResumeToken,
      })
    } else if (activeRoom && activeRoom === initialRoom) {
      window.sessionStorage.removeItem(activeRoomKey)
    }

    socketRef.current = nextSocket
    nextSocket.connect()

    return () => {
      nextSocket.disconnect()
      socketRef.current = null
    }
  }, [])

  useEffect(() => {
    if (playerName.trim()) {
      window.localStorage.setItem(savedNameKey, playerName.trim())
    }
  }, [playerName])

  const chatIsVisible = room
    ? isMobile
      ? mobilePanel === 'chat' && communicationTab === 'chat'
      : desktopRailTab === 'chat'
    : false

  useEffect(() => {
    if (!room) {
      lastChatRoomRef.current = null
      lastChatMessageIdRef.current = null
      setUnreadChat(0)
      return
    }

    const messages = room.chatMessages ?? []

    if (lastChatRoomRef.current !== room.code) {
      lastChatRoomRef.current = room.code
      lastChatMessageIdRef.current = messages.at(-1)?.id ?? null
      setUnreadChat(0)
      return
    }

    const previousMessageIndex = lastChatMessageIdRef.current
      ? messages.findIndex((chatMessage) => chatMessage.id === lastChatMessageIdRef.current)
      : -1
    const additions = (
      previousMessageIndex >= 0
        ? messages.slice(previousMessageIndex + 1)
        : lastChatMessageIdRef.current
          ? messages.slice(-1)
          : messages
    )
      .filter((chatMessage) => chatMessage.senderId !== clientIdRef.current)

    lastChatMessageIdRef.current = messages.at(-1)?.id ?? null

    if (chatIsVisible) {
      setUnreadChat(0)
    } else if (additions.length > 0) {
      setUnreadChat((count) => count + additions.length)
    }
  }, [chatIsVisible, room])

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
      connection === 'online' &&
      room.status === 'playing' &&
      room.you.mark &&
      room.turn === room.you.mark &&
      room.players[room.you.mark]?.connected,
  )

  const opponentMark = room?.you.mark === 'X' ? 'O' : room?.you.mark === 'O' ? 'X' : null
  const isWaitingForGuest = room?.status === 'lobby' && !room.players.O?.connected

  function rememberActiveRoom(nextRoomCode: string, resumeToken: string) {
    window.sessionStorage.setItem(activeRoomKey, nextRoomCode)
    window.sessionStorage.setItem(roomTokenKey(nextRoomCode), resumeToken)
    socketRef.current?.setActiveRoom({
      roomCode: nextRoomCode,
      name: playerName,
      resumeToken,
    })
  }

  async function handleCreateRoom() {
    if (!socketRef.current) {
      return
    }

    try {
      const response = await socketRef.current.request('room:create', {
        name: playerName,
        totalRounds: rounds,
        gameMode,
        allegationsPack,
        allegationsTone,
      })

      if (!response.ok || !response.room || !response.resumeToken) {
        setMessage(response.error ?? 'Could not create room.')
        return
      }

      rememberActiveRoom(response.room.code, response.resumeToken)
      setRoom(response.room)
      setMessage('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create room.')
    }
  }

  async function handleJoinRoom() {
    if (!socketRef.current) {
      return
    }

    try {
      const response = await socketRef.current.request('room:join', {
        roomCode,
        name: playerName,
        resumeToken:
          window.sessionStorage.getItem(roomTokenKey(roomCode)) ?? undefined,
      })

      if (!response.ok || !response.room || !response.resumeToken) {
        setMessage(response.error ?? 'Could not join room.')
        return
      }

      rememberActiveRoom(response.room.code, response.resumeToken)
      setRoom(response.room)
      setMessage(
        response.role === 'spectator'
          ? 'Room is full. You joined the rail.'
          : `Joined as ${markLabel(response.mark ?? null)}.`,
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not join room.')
    }
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
    if (!socketRef.current || !room) {
      return
    }

    socketRef.current.send(event, { roomCode: room.code, ...payload })
  }

  function openMobileChat() {
    setMobilePanel('chat')
    setCommunicationTab('chat')
    setUnreadChat(0)
  }

  function openDesktopTab(tab: DesktopRailTab) {
    setDesktopRailTab(tab)

    if (tab === 'chat') {
      setUnreadChat(0)
    }
  }

  async function sendChatMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!socketRef.current || !room || !chatDraft.trim() || sendingChat) {
      return
    }

    setSendingChat(true)

    try {
      const response = await socketRef.current.request('chat:send', {
        roomCode: room.code,
        text: chatDraft,
      })

      if (!response.ok) {
        setMessage(response.error ?? 'Could not send that message.')
        return
      }

      setChatDraft('')
      setMessage('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not send that message.')
    } finally {
      setSendingChat(false)
    }
  }

  function resetToLobby() {
    if (room) {
      socketRef.current?.send('room:leave', { roomCode: room.code })
      window.sessionStorage.removeItem(roomTokenKey(room.code))
    }

    socketRef.current?.setActiveRoom(null)
    window.sessionStorage.removeItem(activeRoomKey)
    setRoom(null)
    setMessage('')
    setMobilePanel(null)
    setDesktopRailTab('scores')
    setChatDraft('')
    setUnreadChat(0)
    const nextUrl = new URL(window.location.href)
    nextUrl.searchParams.delete('room')
    window.history.replaceState(null, '', nextUrl)
  }

  return (
    <main className={`app-shell ${room ? 'room-active' : ''}`}>
      <header className={`topbar ${room ? 'match-topbar' : ''}`} aria-label="Game header">
        <a className="brand" href="/" onClick={(event) => event.preventDefault()}>
          <span className="brand-mark">XO</span>
          <span>
            <strong>XO Royale</strong>
            <small>private game room</small>
          </span>
        </a>

        {room ? (
          <>
            <div className="mobile-room-tools">
              <button className="mobile-room-code" type="button" onClick={copyInvite}>
                {room.code}
              </button>
              <button
                className="mobile-chat-trigger"
                type="button"
                onClick={openMobileChat}
                aria-label={`Open chat${unreadChat ? `, ${unreadChat} unread` : ''}`}
              >
                <MessageCircle size={18} />
                {unreadChat > 0 ? <span>{Math.min(unreadChat, 9)}</span> : null}
              </button>
            </div>
            <ConnectionBadge connection={connection} className="desktop-room-connection" />
          </>
        ) : (
          <ConnectionBadge connection={connection} />
        )}
      </header>

      {!room ? (
        <section className="welcome-grid" aria-label="Create or join a match">
          <div className="welcome-copy">
            <span className="eyebrow">Browser table</span>
            <h1>Play a sharper table game.</h1>
            <p>Private table. Four tactical boards—or one highly questionable courtroom.</p>
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
                <fieldset className="rule-select">
                  <legend>Rules</legend>
                  <div>
                    <button
                      className={gameMode === 'normal' ? 'active' : ''}
                      type="button"
                      onClick={() => setGameMode('normal')}
                    >
                      <span>Normal</span>
                      <small>Make three, win</small>
                    </button>
                    <button
                      className={gameMode === 'misere' ? 'active' : ''}
                      type="button"
                      onClick={() => setGameMode('misere')}
                    >
                      <span>Misère</span>
                      <small>Make three, lose</small>
                    </button>
                    <button
                      className={gameMode === 'ultimate' ? 'active' : ''}
                      type="button"
                      onClick={() => setGameMode('ultimate')}
                    >
                      <span>Ultimate</span>
                      <small>Claim three boards</small>
                    </button>
                    <button
                      className={gameMode === 'connect4' ? 'active' : ''}
                      type="button"
                      onClick={() => setGameMode('connect4')}
                    >
                      <span>Connect Four</span>
                      <small>Link four discs</small>
                    </button>
                    <button
                      className={gameMode === 'allegations' ? 'active allegations-rule-card' : 'allegations-rule-card'}
                      type="button"
                      onClick={() => {
                        setGameMode('allegations')
                        setRounds(7)
                      }}
                    >
                      <Gavel size={17} aria-hidden="true" />
                      <span>The Allegations</span>
                      <small>Secretly decide who is guilty. Evidence is optional.</small>
                    </button>
                  </div>
                </fieldset>
                {gameMode === 'allegations' ? (
                  <AllegationsLobbyOptions
                    pack={allegationsPack}
                    tone={allegationsTone}
                    cases={rounds}
                    onPack={setAllegationsPack}
                    onTone={setAllegationsTone}
                    onCases={setRounds}
                  />
                ) : (
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
                )}
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
        <section
          className={`match-grid status-${room.status} mode-${room.config.mode}`}
          aria-label={`Room ${room.code}`}
        >
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
              <PlayerTile
                mark="X"
                mode={room.config.mode}
                player={room.players.X}
                you={room.you.mark === 'X'}
              />
              <PlayerTile
                mark="O"
                mode={room.config.mode}
                player={room.players.O}
                you={room.you.mark === 'O'}
              />
            </div>

            <div className="meta-strip">
              <span>{modeLabel(room.config.mode)} rules</span>
              <span>
                {room.config.totalRounds}{' '}
                {room.config.mode === 'allegations'
                  ? room.config.totalRounds === 1 ? 'case' : 'cases'
                  : room.config.totalRounds === 1 ? 'round' : 'rounds'}
              </span>
              <span>
                {room.config.mode === 'allegations' ? 'Case' : 'Round'}{' '}
                {Math.min(room.currentRound, room.config.totalRounds)}
              </span>
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
                  {isWaitingForGuest
                    ? 'Waiting for guest'
                    : room.config.mode === 'allegations' ? 'Open court' : 'Start match'}
                </button>
              ) : null}

              {room.you.isHost &&
              room.status === 'roundOver' &&
              room.config.mode !== 'allegations' ? (
                <button
                  className="primary-action"
                  type="button"
                  onClick={() => emitRoomEvent('round:next')}
                >
                  <Play size={19} />
                  Next round
                </button>
              ) : null}

              {room.you.isHost &&
              room.status === 'matchOver' &&
              room.config.mode !== 'allegations' ? (
                <button
                  className="primary-action"
                  type="button"
                  onClick={() =>
                    emitRoomEvent('match:reset', {
                      totalRounds: rounds,
                    })
                  }
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

          {room.status !== 'lobby' ? <MobileMatchSummary room={room} /> : null}

          <section className={`board-stage ${room.status === 'lobby' ? 'lobby-stage' : ''}`}>
            {room.status === 'lobby' ? (
              <MobileLobbyCard
                room={room}
                copied={copied}
                waiting={isWaitingForGuest}
                onCopy={copyInvite}
                onStart={() => emitRoomEvent('match:start')}
                onChat={openMobileChat}
              />
            ) : null}

            {room.config.mode === 'allegations' ? (
              <AllegationsStage
                room={room}
                canVote={Boolean(
                  connection === 'online' &&
                    room.status === 'playing' &&
                    room.you.mark &&
                    room.players[room.you.mark]?.connected,
                )}
                onVote={(target) => emitRoomEvent('allegation:vote', { target })}
                onNext={() => emitRoomEvent('round:next')}
                onReset={() =>
                  emitRoomEvent('match:reset', {
                    totalRounds: room.config.totalRounds,
                  })
                }
                onLeave={resetToLobby}
              />
            ) : (
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
                  onPlay={(column) => emitRoomEvent('cell:play', { index: column })}
                />
              ) : room.config.mode === 'ultimate' ? (
                <UltimateBoard
                  room={room}
                  canPlay={canPlay}
                  onPlay={(boardIndex, index) =>
                    emitRoomEvent('cell:play', { boardIndex, index })
                  }
                />
              ) : (
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
                      onClick={() => emitRoomEvent('cell:play', { index })}
                    >
                      {cell}
                    </button>
                  ))}
                </div>
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
            )}
          </section>

          <DesktopRail
            room={room}
            activeTab={desktopRailTab}
            unreadChat={unreadChat}
            chatDraft={chatDraft}
            sendingChat={sendingChat}
            clientId={clientIdRef.current}
            onTab={openDesktopTab}
            onDraft={setChatDraft}
            onSend={sendChatMessage}
          />

          {room.status === 'roundOver' || room.status === 'matchOver' ? (
            <MobileResultDock
              room={room}
              unreadChat={unreadChat}
              onChat={openMobileChat}
              onAdvance={() =>
                emitRoomEvent(
                  room.status === 'matchOver' ? 'match:reset' : 'round:next',
                  room.status === 'matchOver'
                    ? {
                        totalRounds:
                          room.config.mode === 'allegations'
                            ? room.config.totalRounds
                            : rounds,
                      }
                    : {},
                )
              }
            />
          ) : (
            <MobileDock
              activePanel={mobilePanel}
              unreadChat={unreadChat}
              onBoard={() => setMobilePanel(null)}
              onScores={() => setMobilePanel('scores')}
              onChat={openMobileChat}
            />
          )}

          <MobileSheet
            panel={mobilePanel}
            room={room}
            communicationTab={communicationTab}
            chatDraft={chatDraft}
            sendingChat={sendingChat}
            clientId={clientIdRef.current}
            onClose={() => setMobilePanel(null)}
            onCommunicationTab={(tab) => {
              setCommunicationTab(tab)
              if (tab === 'chat') {
                setUnreadChat(0)
              }
            }}
            onDraft={setChatDraft}
            onSend={sendChatMessage}
          />
        </section>
      )}
    </main>
  )
}

function ConnectFourBoard({
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

function UltimateBoard({
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

function PlayerTile({
  mark,
  mode,
  player,
  you,
}: {
  mark: Mark
  mode: GameMode
  player: RoomState['players'][Mark]
  you: boolean
}) {
  return (
    <div
      className={`player-tile mark-${mark.toLowerCase()}${mode === 'connect4' ? ' connect-four-player' : ''}${mode === 'allegations' ? ' allegations-player' : ''}`}
    >
      <span>{mode === 'connect4' ? '●' : mode === 'allegations' ? <Fingerprint size={22} /> : mark}</span>
      <strong>{player?.name ?? 'Open seat'}</strong>
      <small>
        {you
          ? `You · ${mode === 'allegations' ? `Suspect ${mark}` : markLabel(mark, mode)}`
          : player?.connected
            ? mode === 'allegations' ? `Suspect ${mark} · Online` : 'Online'
            : player ? 'Disconnected' : 'Waiting'}
      </small>
    </div>
  )
}

function ConnectionBadge({
  connection,
  className = '',
}: {
  connection: ConnectionState
  className?: string
}) {
  return (
    <div className={`connection ${connection} ${className}`.trim()}>
      {connection === 'online' ? <Wifi size={18} /> : <WifiOff size={18} />}
      <span>{connection}</span>
    </div>
  )
}

function MobileMatchSummary({ room }: { room: RoomState }) {
  return (
    <section className="mobile-match-summary" aria-label="Match summary">
      <div className="mobile-room-summary">
        <div>
          <strong>Room {room.code}</strong>
          <small>
            {room.config.mode === 'allegations' ? 'Case' : 'Round'}{' '}
            {Math.min(room.currentRound, room.config.totalRounds)} of{' '}
            {room.config.totalRounds} · {room.spectators.length} watching
          </small>
        </div>
        <span>{modeLabel(room.config.mode)}</span>
      </div>
      <div
        className={`mobile-player-score${room.config.mode === 'connect4' ? ' connect-four-players' : ''}`}
      >
        <div className="mobile-player">
          <b>{room.config.mode === 'connect4' ? '●' : 'X'}</b>
          <span>
            <strong>{room.players.X?.name ?? 'Open seat'}</strong>
            <small>
              {room.you.mark === 'X' ? 'You' : markLabel('X', room.config.mode)}
            </small>
          </span>
        </div>
        <strong className="mobile-score">
          {room.config.mode === 'allegations'
            ? `${room.allegations?.charges.X ?? 0} – ${room.allegations?.charges.O ?? 0}`
            : `${room.scores.X} – ${room.scores.O}`}
        </strong>
        <div className="mobile-player mobile-player-o">
          <span>
            <strong>{room.players.O?.name ?? 'Open seat'}</strong>
            <small>
              {room.you.mark === 'O' ? 'You' : markLabel('O', room.config.mode)}
            </small>
          </span>
          <b>{room.config.mode === 'connect4' ? '●' : 'O'}</b>
        </div>
      </div>
    </section>
  )
}

function MobileLobbyCard({
  room,
  copied,
  waiting,
  onCopy,
  onStart,
  onChat,
}: {
  room: RoomState
  copied: boolean
  waiting: boolean
  onCopy: () => void
  onStart: () => void
  onChat: () => void
}) {
  return (
    <div className="mobile-lobby-card">
      <span className="eyebrow">Private game room</span>
      <h1>
        {room.config.mode === 'allegations'
          ? 'Court is waiting for the second suspect.'
          : 'Your table is ready.'}
      </h1>
      <p>
        {room.config.mode === 'allegations'
          ? 'Share the room code. Evidence is optional.'
          : 'Share the code. The host starts when both seats are occupied.'}
      </p>

      <div className="mobile-invite-code">
        <div>
          <span>Room code</span>
          <strong>{room.code}</strong>
        </div>
        <button type="button" onClick={onCopy}>
          {copied ? 'Copied' : 'Copy invite'}
        </button>
      </div>

      <div
        className={`mobile-lobby-players${room.config.mode === 'connect4' ? ' connect-four-players' : ''}`}
      >
        <div>
          <b>{room.config.mode === 'connect4' ? '●' : 'X'}</b>
          <strong>{room.players.X?.name ?? 'Open seat'}</strong>
          <small>{room.you.mark === 'X' ? 'You · host' : 'Host'}</small>
        </div>
        <div className="mark-o">
          <b>{room.config.mode === 'connect4' ? '●' : 'O'}</b>
          <strong>{room.players.O?.name ?? 'Open seat'}</strong>
          <small>{room.players.O?.connected ? 'Ready' : 'Waiting'}</small>
        </div>
      </div>

      <div className="mobile-lobby-config">
        <span>
          <small>Rules</small>
          <strong>
            {modeSummary(room.config.mode)}
          </strong>
        </span>
        <span>
          <small>Match</small>
          <strong>
            {room.config.totalRounds}{' '}
            {room.config.mode === 'allegations'
              ? room.config.totalRounds === 1 ? 'case' : 'cases'
              : room.config.totalRounds === 1 ? 'round' : 'rounds'}
          </strong>
        </span>
      </div>

      {room.you.isHost ? (
        <button
          className="primary-action"
          disabled={waiting}
          type="button"
          onClick={onStart}
        >
          <Play size={18} />
          {waiting
            ? 'Waiting for guest'
            : room.config.mode === 'allegations' ? 'Open court' : 'Start match'}
        </button>
      ) : (
        <p className="mobile-waiting-note">The host controls the match.</p>
      )}
      <button className="secondary-action" type="button" onClick={onChat}>
        <MessageCircle size={17} />
        Open room chat
      </button>
    </div>
  )
}

function ScoreContent({ room }: { room: RoomState }) {
  if (room.config.mode === 'allegations') {
    return <AllegationsScorePanel room={room} />
  }

  return (
    <div className="score-content">
      <div className="score-card lead">
        <Trophy size={22} />
        <span>Score</span>
        <strong>
          {room.scores.X} - {room.scores.O}
        </strong>
        <small>{room.scores.draws} draws</small>
      </div>

      <div className="score-breakdown">
        {(['X', 'O', 'draw'] as const).map((winner) => (
          <div className="score-card" key={winner}>
            <span>{winner === 'draw' ? 'Draws' : room.players[winner]?.name ?? winner}</span>
            <strong>{scoreFor(room, winner)}</strong>
          </div>
        ))}
      </div>

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
              <small>
                {round.completedBy && room.config.mode === 'misere'
                  ? `${round.completedBy} made three`
                  : `${round.moves} moves`}
              </small>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function ChatContent({
  room,
  clientId,
  draft,
  sending,
  onDraft,
  onSend,
}: {
  room: RoomState
  clientId: string
  draft: string
  sending: boolean
  onDraft: (value: string) => void
  onSend: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <div className="chat-content">
      <div className="chat-role">
        <span className="chat-role-badge">
          {room.you.isSpectator ? 'Spectator · read only' : 'Player · can chat'}
        </span>
        <small>Messages leave with the room</small>
      </div>

      <div className="chat-messages" aria-live="polite">
        {room.chatMessages.length === 0 ? (
          <p className="empty-chat">No table talk yet. Keep it civil and strategic.</p>
        ) : (
          room.chatMessages.map((chatMessage) => {
            const mine = chatMessage.senderId === clientId

            return (
              <article className={`chat-message ${mine ? 'mine' : ''}`} key={chatMessage.id}>
                <span>
                  {mine ? 'You' : chatMessage.senderName} · {formatTime(chatMessage.createdAt)}
                </span>
                <p>{chatMessage.body}</p>
              </article>
            )
          })
        )}
      </div>

      {room.you.isSpectator ? (
        <p className="spectator-chat-note">
          Spectators can follow the conversation but cannot send messages.
        </p>
      ) : (
        <form className="chat-compose" onSubmit={onSend}>
          <label>
            <span className="sr-only">Message the table</span>
            <textarea
              maxLength={chatMessageLimit}
              onChange={(event) => onDraft(event.target.value)}
              placeholder="Message the table…"
              rows={2}
              value={draft}
            />
            <small>
              {draft.length}/{chatMessageLimit}
            </small>
          </label>
          <button
            disabled={sending || !draft.trim()}
            type="submit"
            aria-label="Send message"
          >
            <Send size={18} />
          </button>
        </form>
      )}
    </div>
  )
}

function GameLogContent({ room }: { room: RoomState }) {
  return (
    <div className="game-log" aria-live="polite">
      {room.gameLog.length === 0 ? (
        <p>No moves recorded yet.</p>
      ) : (
        [...room.gameLog].reverse().map((entry, index) => (
          <div className="game-log-entry" key={entry.id}>
            <span>{String(room.gameLog.length - index).padStart(2, '0')}</span>
            <strong>{entry.text}</strong>
            <time dateTime={entry.createdAt}>{formatTime(entry.createdAt)}</time>
          </div>
        ))
      )}
    </div>
  )
}

function DesktopRail({
  room,
  activeTab,
  unreadChat,
  chatDraft,
  sendingChat,
  clientId,
  onTab,
  onDraft,
  onSend,
}: {
  room: RoomState
  activeTab: DesktopRailTab
  unreadChat: number
  chatDraft: string
  sendingChat: boolean
  clientId: string
  onTab: (tab: DesktopRailTab) => void
  onDraft: (value: string) => void
  onSend: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <aside className="score-panel">
      <div className="rail-tabs" role="tablist" aria-label="Match rail">
        <button
          className={activeTab === 'scores' ? 'active' : ''}
          role="tab"
          aria-selected={activeTab === 'scores'}
          type="button"
          onClick={() => onTab('scores')}
        >
          Score
        </button>
        <button
          className={activeTab === 'chat' ? 'active' : ''}
          role="tab"
          aria-selected={activeTab === 'chat'}
          type="button"
          onClick={() => onTab('chat')}
        >
          Chat {unreadChat > 0 ? <span>{Math.min(unreadChat, 9)}</span> : null}
        </button>
        <button
          className={activeTab === 'log' ? 'active' : ''}
          role="tab"
          aria-selected={activeTab === 'log'}
          type="button"
          onClick={() => onTab('log')}
        >
          Log
        </button>
      </div>

      {activeTab === 'scores' ? <ScoreContent room={room} /> : null}
      {activeTab === 'chat' ? (
        <ChatContent
          room={room}
          clientId={clientId}
          draft={chatDraft}
          sending={sendingChat}
          onDraft={onDraft}
          onSend={onSend}
        />
      ) : null}
      {activeTab === 'log' ? <GameLogContent room={room} /> : null}
    </aside>
  )
}

function MobileDock({
  activePanel,
  unreadChat,
  onBoard,
  onScores,
  onChat,
}: {
  activePanel: MobilePanel
  unreadChat: number
  onBoard: () => void
  onScores: () => void
  onChat: () => void
}) {
  return (
    <nav className="mobile-dock" aria-label="Match tools">
      <button
        className={activePanel === null ? 'active' : ''}
        type="button"
        onClick={onBoard}
      >
        <Grid3X3 size={19} />
        <span>Board</span>
      </button>
      <button
        className={activePanel === 'scores' ? 'active' : ''}
        type="button"
        onClick={onScores}
      >
        <BarChart3 size={19} />
        <span>Score</span>
      </button>
      <button
        className={activePanel === 'chat' ? 'active' : ''}
        type="button"
        onClick={onChat}
      >
        <MessageCircle size={19} />
        <span>Chat</span>
        {unreadChat > 0 ? <b>{Math.min(unreadChat, 9)}</b> : null}
      </button>
    </nav>
  )
}

function MobileResultDock({
  room,
  unreadChat,
  onChat,
  onAdvance,
}: {
  room: RoomState
  unreadChat: number
  onChat: () => void
  onAdvance: () => void
}) {
  const actionLabel =
    room.config.mode === 'allegations'
      ? room.status === 'matchOver' ? 'Return to court' : 'Next case'
      : room.status === 'matchOver' ? 'Reset table' : 'Next round'

  return (
    <div className="mobile-result-dock">
      <button className="secondary-action" type="button" onClick={onChat}>
        <MessageCircle size={17} />
        Chat {unreadChat > 0 ? `· ${Math.min(unreadChat, 9)}` : ''}
      </button>
      <button
        className="primary-action"
        disabled={!room.you.isHost}
        type="button"
        onClick={onAdvance}
      >
        {room.status === 'matchOver' ? <RotateCcw size={17} /> : <Play size={17} />}
        {room.you.isHost ? actionLabel : 'Waiting for host'}
      </button>
    </div>
  )
}

function MobileSheet({
  panel,
  room,
  communicationTab,
  chatDraft,
  sendingChat,
  clientId,
  onClose,
  onCommunicationTab,
  onDraft,
  onSend,
}: {
  panel: MobilePanel
  room: RoomState
  communicationTab: CommunicationTab
  chatDraft: string
  sendingChat: boolean
  clientId: string
  onClose: () => void
  onCommunicationTab: (tab: CommunicationTab) => void
  onDraft: (value: string) => void
  onSend: (event: FormEvent<HTMLFormElement>) => void
}) {
  if (!panel) {
    return null
  }

  return (
    <>
      <button
        className="mobile-sheet-scrim"
        type="button"
        onClick={onClose}
        aria-label="Close panel"
      />
      <section className={`mobile-sheet mobile-sheet-${panel}`}>
        <span className="mobile-sheet-handle" aria-hidden="true" />
        <header className="mobile-sheet-heading">
          <div>
            <h2>{panel === 'scores' ? 'Match ledger' : 'Table talk'}</h2>
            <p>
              {panel === 'scores'
                ? `${modeLabel(room.config.mode)} rules · ${room.config.mode === 'allegations' ? 'case' : 'round'} ${Math.min(room.currentRound, room.config.totalRounds)} of ${room.config.totalRounds}`
                : `Room ${room.code} · messages disappear with the room`}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close panel">
            <XIcon size={19} />
          </button>
        </header>

        {panel === 'scores' ? <ScoreContent room={room} /> : null}

        {panel === 'chat' ? (
          <>
            <div className="communication-tabs" role="tablist">
              <button
                className={communicationTab === 'chat' ? 'active' : ''}
                role="tab"
                aria-selected={communicationTab === 'chat'}
                type="button"
                onClick={() => onCommunicationTab('chat')}
              >
                <MessageCircle size={16} />
                Chat
              </button>
              <button
                className={communicationTab === 'log' ? 'active' : ''}
                role="tab"
                aria-selected={communicationTab === 'log'}
                type="button"
                onClick={() => onCommunicationTab('log')}
              >
                <ListOrdered size={16} />
                Game log
              </button>
            </div>
            {communicationTab === 'chat' ? (
              <ChatContent
                room={room}
                clientId={clientId}
                draft={chatDraft}
                sending={sendingChat}
                onDraft={onDraft}
                onSend={onSend}
              />
            ) : (
              <GameLogContent room={room} />
            )}
          </>
        ) : null}
      </section>
    </>
  )
}

export default App
