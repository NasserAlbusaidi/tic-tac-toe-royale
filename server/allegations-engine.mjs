import {
  ALLEGATION_PROMPTS,
  allegationCaseCounts,
  allegationPacks,
  allegationTones,
  getAllegationPrompt,
  verdictCopy,
} from './allegations-content.mjs'

export function normalizeAllegationsPack(value) {
  return allegationPacks.includes(value) ? value : 'sensei'
}

export function normalizeAllegationsTone(value) {
  return allegationTones.includes(value) ? value : 'feral'
}

export function normalizeAllegationsCaseCount(value) {
  const parsed = Number.parseInt(String(value), 10)
  return allegationCaseCounts.includes(parsed) ? parsed : 7
}

function shuffle(items, random) {
  const shuffled = [...items]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }

  return shuffled
}

function selectFromPack(pack, tone, count, random) {
  const friendly = ALLEGATION_PROMPTS.filter(
    (prompt) => prompt.pack === pack && prompt.tone === 'friendly',
  )

  if (tone === 'friendly') {
    return shuffle(friendly, random).slice(0, count)
  }

  const feral = ALLEGATION_PROMPTS.filter(
    (prompt) => prompt.pack === pack && prompt.tone === 'feral',
  )
  const feralCount = Math.min(
    feral.length,
    Math.max(1, Math.round(count * 0.4)),
  )
  const selected = [
    ...shuffle(feral, random).slice(0, feralCount),
    ...shuffle(friendly, random).slice(0, count - feralCount),
  ]

  return shuffle(selected, random)
}

export function selectPromptOrder({
  pack,
  tone,
  count,
  random = Math.random,
}) {
  const normalizedPack = normalizeAllegationsPack(pack)
  const normalizedTone = normalizeAllegationsTone(tone)
  const normalizedCount = normalizeAllegationsCaseCount(count)

  if (normalizedPack === 'mixed') {
    const senseiCount = Math.round(normalizedCount * 0.6)
    const generalCount = normalizedCount - senseiCount
    const selected = [
      ...selectFromPack('sensei', normalizedTone, senseiCount, random),
      ...selectFromPack('general', normalizedTone, generalCount, random),
    ]
    return shuffle(selected, random).map((prompt) => prompt.id)
  }

  return selectFromPack(normalizedPack, normalizedTone, normalizedCount, random)
    .map((prompt) => prompt.id)
}

export function createAllegationsState({ pack, tone } = {}) {
  return {
    pack: normalizeAllegationsPack(pack),
    tone: normalizeAllegationsTone(tone),
    currentPromptId: null,
    promptOrder: [],
    charges: { X: 0, O: 0 },
    submitted: { X: false, O: false },
    votes: { X: null, O: null },
    latestOutcome: null,
    cases: [],
    verdict: null,
  }
}

export function startAllegationsMatch(state, { count, random = Math.random } = {}) {
  const nextState = createAllegationsState(state)
  nextState.promptOrder = selectPromptOrder({
    pack: nextState.pack,
    tone: nextState.tone,
    count,
    random,
  })
  nextState.currentPromptId = nextState.promptOrder[0] ?? null
  return nextState
}

export function createFinalVerdict(state) {
  const { X, O } = state.charges

  if (X === 0 && O === 0) {
    return { convicted: 'none', ...verdictCopy.none }
  }

  if (X === O) {
    return { convicted: 'both', ...verdictCopy.joint }
  }

  return {
    convicted: X > O ? 'X' : 'O',
    ...verdictCopy.single,
  }
}

export function applyAllegationVote(
  state,
  { voter, target, caseNumber, totalCases, endedAt = new Date().toISOString() },
) {
  state.votes[voter] = target
  state.submitted[voter] = true

  if (!state.submitted.X || !state.submitted.O) {
    return { resolved: false }
  }

  let outcome = 'selfReport'
  let charged = null

  if (state.votes.X === state.votes.O) {
    outcome = 'unanimous'
    charged = state.votes.X
    state.charges[charged] += 1
  } else if (state.votes.X === 'O' && state.votes.O === 'X') {
    outcome = 'mutualSlander'
  }

  const prompt = getAllegationPrompt(state.currentPromptId)

  if (!prompt) {
    throw new Error('The current allegation could not be found.')
  }

  const summary = {
    caseNumber,
    prompt: {
      id: prompt.id,
      text: prompt.text,
      charge: prompt.charge,
    },
    votes: { ...state.votes },
    outcome,
    charged,
    endedAt,
  }

  state.cases.push(summary)
  state.latestOutcome = outcome

  if (state.cases.length >= totalCases) {
    state.verdict = createFinalVerdict(state)
  }

  return {
    resolved: true,
    outcome,
    charged,
    summary,
    matchOver: Boolean(state.verdict),
  }
}

export function nextAllegationCase(state) {
  state.currentPromptId = state.promptOrder[state.cases.length] ?? null
  state.votes = { X: null, O: null }
  state.submitted = { X: false, O: false }
  state.latestOutcome = null
  return state
}

export function resetAllegationsMatch(state) {
  return createAllegationsState(state)
}

export function publicAllegationsState(state, { viewerMark, revealed = false } = {}) {
  if (!state) {
    return null
  }

  const prompt = getAllegationPrompt(state.currentPromptId)

  return {
    pack: state.pack,
    tone: state.tone,
    currentPrompt: prompt ? { id: prompt.id, text: prompt.text } : null,
    charges: { ...state.charges },
    submitted: { ...state.submitted },
    yourVote: viewerMark ? state.votes[viewerMark] : null,
    revealedVotes: revealed ? { ...state.votes } : null,
    latestOutcome: state.latestOutcome,
    cases: state.cases.map((item) => ({
      ...item,
      prompt: { ...item.prompt },
      votes: { ...item.votes },
    })),
    verdict: state.verdict ? { ...state.verdict } : null,
  }
}
