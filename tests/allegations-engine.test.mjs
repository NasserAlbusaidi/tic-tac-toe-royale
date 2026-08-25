import { describe, expect, it } from 'vitest'
import {
  ALLEGATION_PROMPTS,
  getAllegationPrompt,
} from '../server/allegations-content.mjs'
import {
  normalizeAllegationsCaseCount,
  normalizeAllegationsPack,
  normalizeAllegationsTone,
  selectPromptOrder,
} from '../server/allegations-engine.mjs'
import {
  applyAllegationVote,
  applyMove,
  assignParticipant,
  createRoom,
  nextRound,
  normalizeGameMode,
  publicRoom,
  resetMatch,
  startMatch,
} from '../server/game-engine.mjs'

function liveAllegationsRoom(totalRounds = 5) {
  const room = createRoom({
    hostId: 'host-socket',
    hostName: 'Nasser',
    totalRounds,
    gameMode: 'allegations',
    allegationsPack: 'sensei',
    allegationsTone: 'feral',
    roomCode: 'COURT',
  })

  assignParticipant(room, { clientId: 'guest-socket', name: 'Sara' })
  startMatch(room, 'host-socket', { random: () => 0.99 })
  return room
}

function resolveCase(room, xTarget, oTarget) {
  expect(applyAllegationVote(room, 'host-socket', xTarget)).toEqual({ ok: true })
  expect(applyAllegationVote(room, 'guest-socket', oTarget)).toEqual({ ok: true })
}

describe('Allegations content and selection', () => {
  it('ships the complete curated launch library', () => {
    expect(ALLEGATION_PROMPTS).toHaveLength(40)
    expect(ALLEGATION_PROMPTS.filter((prompt) => prompt.pack === 'general')).toHaveLength(24)
    expect(ALLEGATION_PROMPTS.filter((prompt) => prompt.pack === 'sensei')).toHaveLength(16)
    expect(new Set(ALLEGATION_PROMPTS.map((prompt) => prompt.id)).size).toBe(40)
    expect(ALLEGATION_PROMPTS.every((prompt) => prompt.charge && prompt.text)).toBe(true)
  })

  it('normalizes mode, pack, tone, and case configuration', () => {
    expect(normalizeGameMode('allegations')).toBe('allegations')
    expect(normalizeAllegationsPack('general')).toBe('general')
    expect(normalizeAllegationsPack('invalid')).toBe('sensei')
    expect(normalizeAllegationsTone('friendly')).toBe('friendly')
    expect(normalizeAllegationsTone('invalid')).toBe('feral')
    expect([5, 7, 9].map(normalizeAllegationsCaseCount)).toEqual([5, 7, 9])
    expect(normalizeAllegationsCaseCount(3)).toBe(7)
  })

  it('selects unique prompts from the requested pack and filters friendly court', () => {
    const friendly = selectPromptOrder({
      pack: 'sensei',
      tone: 'friendly',
      count: 9,
      random: () => 0.99,
    })

    expect(friendly).toHaveLength(9)
    expect(new Set(friendly).size).toBe(9)
    expect(friendly.every((id) => getAllegationPrompt(id).pack === 'sensei')).toBe(true)
    expect(friendly.every((id) => getAllegationPrompt(id).tone === 'friendly')).toBe(true)

    const feral = selectPromptOrder({
      pack: 'sensei',
      tone: 'feral',
      count: 9,
      random: () => 0.99,
    })
    expect(feral.filter((id) => getAllegationPrompt(id).tone === 'feral').length).toBeGreaterThanOrEqual(4)
  })

  it('builds mixed evidence at roughly sixty percent Sensei prompts', () => {
    const order = selectPromptOrder({
      pack: 'mixed',
      tone: 'feral',
      count: 7,
      random: () => 0.5,
    })

    expect(order).toHaveLength(7)
    expect(new Set(order).size).toBe(7)
    expect(order.filter((id) => getAllegationPrompt(id).pack === 'sensei')).toHaveLength(4)
    expect(order.filter((id) => getAllegationPrompt(id).pack === 'general')).toHaveLength(3)
  })
})

describe('Allegations room engine', () => {
  it('defaults to seven Feral Sensei cases and validates host start requirements', () => {
    const room = createRoom({
      hostId: 'host-socket',
      gameMode: 'allegations',
      roomCode: 'RULES',
      totalRounds: 3,
      allegationsPack: 'unknown',
      allegationsTone: 'unknown',
    })

    expect(room.config.totalRounds).toBe(7)
    expect(room.allegations).toMatchObject({ pack: 'sensei', tone: 'feral' })
    expect(startMatch(room, 'guest-socket')).toEqual({
      ok: false,
      error: 'Only the host can start the match.',
    })
    expect(startMatch(room, 'host-socket')).toEqual({
      ok: false,
      error: 'Two connected players are needed.',
    })
  })

  it('locks the first vote without resolving and rejects duplicates and spectators', () => {
    const room = liveAllegationsRoom()

    expect(applyAllegationVote(room, 'host-socket', 'O')).toEqual({ ok: true })
    expect(room.status).toBe('playing')
    expect(room.allegations.cases).toEqual([])
    expect(applyAllegationVote(room, 'host-socket', 'X')).toEqual({
      ok: false,
      error: 'Your verdict is already locked.',
    })
    expect(applyAllegationVote(room, 'spectator-socket', 'X')).toEqual({
      ok: false,
      error: 'Spectators cannot submit verdicts.',
    })
    expect(applyAllegationVote(room, 'guest-socket', 'invalid')).toEqual({
      ok: false,
      error: 'Choose one of the two suspects.',
    })
  })

  it('resolves unanimous X and O charges, mutual slander, and self-report', () => {
    const unanimousX = liveAllegationsRoom()
    resolveCase(unanimousX, 'X', 'X')
    expect(unanimousX.allegations.charges).toEqual({ X: 1, O: 0 })
    expect(unanimousX.allegations.cases[0]).toMatchObject({
      outcome: 'unanimous',
      charged: 'X',
    })

    const unanimousO = liveAllegationsRoom()
    resolveCase(unanimousO, 'O', 'O')
    expect(unanimousO.allegations.charges).toEqual({ X: 0, O: 1 })

    const mutual = liveAllegationsRoom()
    resolveCase(mutual, 'O', 'X')
    expect(mutual.allegations.charges).toEqual({ X: 0, O: 0 })
    expect(mutual.allegations.latestOutcome).toBe('mutualSlander')

    const selfReport = liveAllegationsRoom()
    resolveCase(selfReport, 'X', 'O')
    expect(selfReport.allegations.charges).toEqual({ X: 0, O: 0 })
    expect(selfReport.allegations.latestOutcome).toBe('selfReport')
  })

  it('rejects board moves and requires the host to open the next case', () => {
    const room = liveAllegationsRoom()

    expect(applyMove(room, 'host-socket', 0)).toEqual({
      ok: false,
      error: 'The Allegations uses sealed verdicts, not board moves.',
    })
    resolveCase(room, 'O', 'X')
    expect(nextRound(room, 'guest-socket')).toEqual({
      ok: false,
      error: 'Only the host can advance rounds.',
    })
    expect(nextRound(room, 'host-socket')).toEqual({ ok: true })
    expect(room.currentRound).toBe(2)
    expect(room.allegations.votes).toEqual({ X: null, O: null })
    expect(room.status).toBe('playing')
  })

  it('rejects repeated starts and votes outside the active court lifecycle', () => {
    const room = liveAllegationsRoom()

    expect(startMatch(room, 'host-socket')).toEqual({
      ok: false,
      error: 'This court session has already started.',
    })
    resolveCase(room, 'X', 'X')
    expect(startMatch(room, 'host-socket')).toEqual({
      ok: false,
      error: 'This court session has already started.',
    })
    expect(applyAllegationVote(room, 'host-socket', 'X')).toEqual({
      ok: false,
      error: 'Voting is not open for this case.',
    })

    const boardRoom = createRoom({ hostId: 'host-socket', roomCode: 'BOARD' })
    expect(applyAllegationVote(boardRoom, 'host-socket', 'X')).toEqual({
      ok: false,
      error: 'This room is not hearing allegations.',
    })
  })

  it.each([5, 7, 9])('ends after exactly %i cases', (caseCount) => {
    const room = liveAllegationsRoom(caseCount)

    for (let index = 0; index < caseCount; index += 1) {
      resolveCase(room, 'X', 'X')
      if (index < caseCount - 1) {
        expect(room.status).toBe('roundOver')
        nextRound(room, 'host-socket')
      }
    }

    expect(room.status).toBe('matchOver')
    expect(room.allegations.cases).toHaveLength(caseCount)
    expect(room.allegations.verdict.convicted).toBe('X')
  })

  it('creates single, joint, and zero-charge final verdicts', () => {
    const single = liveAllegationsRoom()
    const joint = liveAllegationsRoom()
    const none = liveAllegationsRoom()

    const patterns = {
      single: [['O', 'O'], ['O', 'O'], ['O', 'X'], ['X', 'O'], ['O', 'X']],
      joint: [['X', 'X'], ['O', 'O'], ['O', 'X'], ['X', 'O'], ['O', 'X']],
      none: [['O', 'X'], ['X', 'O'], ['O', 'X'], ['X', 'O'], ['O', 'X']],
    }

    for (const [key, room] of Object.entries({ single, joint, none })) {
      patterns[key].forEach(([xTarget, oTarget], index) => {
        resolveCase(room, xTarget, oTarget)
        if (index < 4) nextRound(room, 'host-socket')
      })
    }

    expect(single.allegations.verdict.convicted).toBe('O')
    expect(joint.allegations.verdict.convicted).toBe('both')
    expect(none.allegations.verdict.convicted).toBe('none')
  })

  it('redacts pending votes and all future prompt order per viewer', () => {
    const room = liveAllegationsRoom()
    const futurePromptIds = room.allegations.promptOrder.slice(1)

    applyAllegationVote(room, 'host-socket', 'O')

    const hostView = publicRoom(room, 'host-socket')
    const guestView = publicRoom(room, 'guest-socket')
    const spectatorView = publicRoom(room, 'spectator-socket')

    expect(hostView.allegations.yourVote).toBe('O')
    expect(guestView.allegations.yourVote).toBeNull()
    expect(spectatorView.allegations.yourVote).toBeNull()
    expect(hostView.allegations.revealedVotes).toBeNull()
    expect(guestView.allegations.revealedVotes).toBeNull()
    expect(spectatorView.allegations.revealedVotes).toBeNull()
    expect(hostView.allegations.submitted).toEqual({ X: true, O: false })

    for (const view of [hostView, guestView, spectatorView]) {
      const serialized = JSON.stringify(view)
      expect(serialized).not.toContain('promptOrder')
      expect(serialized).not.toContain('currentPromptId')
      futurePromptIds.forEach((id) => expect(serialized).not.toContain(id))
    }

    applyAllegationVote(room, 'guest-socket', 'X')
    expect(publicRoom(room, 'host-socket').allegations.revealedVotes).toEqual({
      X: 'O',
      O: 'X',
    })
    expect(publicRoom(room, 'spectator-socket').allegations.revealedVotes).toEqual({
      X: 'O',
      O: 'X',
    })
  })

  it('reset clears all sealed and resolved match evidence', () => {
    const room = liveAllegationsRoom()
    resolveCase(room, 'X', 'X')

    expect(resetMatch(room, 'host-socket', 9)).toEqual({ ok: true })
    expect(room.status).toBe('lobby')
    expect(room.config.totalRounds).toBe(9)
    expect(room.allegations).toMatchObject({
      currentPromptId: null,
      promptOrder: [],
      charges: { X: 0, O: 0 },
      submitted: { X: false, O: false },
      votes: { X: null, O: null },
      cases: [],
      verdict: null,
    })
  })
})
