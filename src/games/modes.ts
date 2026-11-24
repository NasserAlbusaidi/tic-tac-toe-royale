import type { GameMode, Mark } from '../types'

export function markLabel(mark: Mark | null, mode?: GameMode) {
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

export function modeLabel(mode: GameMode) {
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

export function modeSummary(mode: GameMode) {
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
