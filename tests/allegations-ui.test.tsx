// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import { AllegationsStage } from '../src/games/allegations/AllegationsStage'
import type { AllegationCaseSummary, RoomState } from '../src/types'

class MockWebSocket {
  static OPEN = 1
  readyState = 0

  addEventListener() {}
  close() {}
  send() {}
}

function resolvedCase(
  outcome: AllegationCaseSummary['outcome'] = 'unanimous',
): AllegationCaseSummary {
  return {
    caseNumber: 1,
    prompt: {
      id: 'sensei-ignore-tech-solution',
      text: 'Who would ask the Sensei for help, ignore the solution, then say it still does not work?',
      charge: 'weaponized helplessness',
    },
    votes:
      outcome === 'mutualSlander'
        ? { X: 'O', O: 'X' }
        : outcome === 'selfReport'
          ? { X: 'X', O: 'O' }
          : { X: 'O', O: 'O' },
    outcome,
    charged: outcome === 'unanimous' ? 'O' : null,
    endedAt: '2026-08-25T10:00:00.000Z',
  }
}

function allegationsRoom(overrides: Partial<RoomState> = {}): RoomState {
  return {
    code: 'COURT',
    config: { totalRounds: 5, mode: 'allegations' },
    status: 'playing',
    board: Array(9).fill(null),
    ultimate: null,
    allegations: {
      pack: 'sensei',
      tone: 'feral',
      currentPrompt: {
        id: 'sensei-ignore-tech-solution',
        text: 'Who would ask the Sensei for help, ignore the solution, then say it still does not work?',
      },
      charges: { X: 0, O: 0 },
      submitted: { X: false, O: false },
      yourVote: null,
      revealedVotes: null,
      latestOutcome: null,
      cases: [],
      verdict: null,
    },
    turn: 'X',
    starter: 'X',
    winner: null,
    winningLine: [],
    matchWinner: null,
    currentRound: 1,
    scores: { X: 0, O: 0, draws: 0 },
    rounds: [],
    chatMessages: [],
    gameLog: [],
    players: {
      X: {
        id: 'host-client',
        name: 'Nasser',
        mark: 'X',
        isHost: true,
        connected: true,
      },
      O: {
        id: 'guest-client',
        name: 'Sara',
        mark: 'O',
        isHost: false,
        connected: true,
      },
    },
    spectators: [],
    lastEvent: 'Case 1 opened',
    you: { mark: 'X', isHost: true, isSpectator: false },
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.clear()
  window.sessionStorage.clear()
})

describe('Allegations lobby', () => {
  it('shows Allegations options only when that mode is selected and renames Rounds to Cases', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket)
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('group', { name: 'Rounds' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Evidence pack' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /The Allegations/i }))

    expect(screen.getByRole('group', { name: 'Evidence pack' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Court temperament' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Cases' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Rounds' })).not.toBeInTheDocument()
    expect(screen.getByText('The court accepts no responsibility for damaged friendships.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /NormalMake three/i }))
    expect(screen.getByRole('group', { name: 'Rounds' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Cases' })).not.toBeInTheDocument()
  })
})

describe('Allegations proceedings', () => {
  it('submits one vote, then renders the locked waiting state without an opponent target', async () => {
    const onVote = vi.fn()
    const user = userEvent.setup()
    const props = {
      canVote: true,
      onVote,
      onNext: vi.fn(),
      onReset: vi.fn(),
      onLeave: vi.fn(),
    }
    const { rerender } = render(<AllegationsStage room={allegationsRoom()} {...props} />)

    await user.click(screen.getByRole('button', { name: 'Vote for Sara, Suspect O' }))
    expect(onVote).toHaveBeenCalledOnce()
    expect(onVote).toHaveBeenCalledWith('O')

    const lockedRoom = allegationsRoom()
    lockedRoom.allegations = {
      ...lockedRoom.allegations!,
      submitted: { X: true, O: false },
      yourVote: 'O',
    }
    rerender(<AllegationsStage room={lockedRoom} {...props} />)

    expect(screen.getByRole('button', { name: 'Vote for Sara, Suspect O' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Verdict locked', { selector: '.verdict-locked' })).toBeInTheDocument()
    expect(screen.getByText(/Waiting for Sara to finish inventing evidence/i)).toBeInTheDocument()
    expect(screen.queryByText(/Sara accused/i)).not.toBeInTheDocument()
  })

  it('disables voting controls for spectators', () => {
    const room = allegationsRoom({
      you: { mark: null, isHost: false, isSpectator: true },
    })
    render(
      <AllegationsStage
        room={room}
        canVote={false}
        onVote={vi.fn()}
        onNext={vi.fn()}
        onReset={vi.fn()}
        onLeave={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Vote for Nasser, Suspect X' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Vote for Sara, Suspect O' })).toBeDisabled()
    expect(screen.getByText(/Watching the proceedings/i)).toBeInTheDocument()
  })

  it.each([
    ['unanimous', 'Unanimous verdict'],
    ['mutualSlander', 'Mutual slander'],
    ['selfReport', 'Unexpected self-awareness'],
  ] as const)('renders the %s ruling', (outcome, ruling) => {
    const item = resolvedCase(outcome)
    const room = allegationsRoom({ status: 'roundOver' })
    room.allegations = {
      ...room.allegations!,
      submitted: { X: true, O: true },
      yourVote: item.votes.X,
      revealedVotes: item.votes,
      latestOutcome: outcome,
      cases: [item],
      charges: outcome === 'unanimous' ? { X: 0, O: 1 } : { X: 0, O: 0 },
    }

    render(
      <AllegationsStage
        room={room}
        canVote={false}
        onVote={vi.fn()}
        onNext={vi.fn()}
        onReset={vi.fn()}
        onLeave={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: ruling })).toBeInTheDocument()
  })

  it('renders actual charge phrases in the final record and copies a clean verdict', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const item = resolvedCase('unanimous')
    const room = allegationsRoom({ status: 'matchOver' })
    room.allegations = {
      ...room.allegations!,
      charges: { X: 0, O: 1 },
      submitted: { X: true, O: true },
      yourVote: 'O',
      revealedVotes: item.votes,
      latestOutcome: 'unanimous',
      cases: [item],
      verdict: {
        convicted: 'O',
        title: 'Certified Menace',
        sentence: 'Must admit the other suspect was right once.',
        appealStatus: 'Denied before it was submitted.',
      },
    }

    render(
      <AllegationsStage
        room={room}
        canVote={false}
        onVote={vi.fn()}
        onNext={vi.fn()}
        onReset={vi.fn()}
        onLeave={vi.fn()}
      />,
    )

    expect(screen.getByText('weaponized helplessness')).toBeInTheDocument()
    expect(screen.getByText('Barely Acquitted')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Copy verdict' }))
    expect(writeText).toHaveBeenCalledOnce()
    expect(writeText.mock.calls[0][0]).toContain('OFFICIAL COURT RECORD')
    expect(writeText.mock.calls[0][0]).toContain('• weaponized helplessness')
  })
})
