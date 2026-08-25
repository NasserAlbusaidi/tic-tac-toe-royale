import type { AllegationsPack, AllegationsTone } from '../../types'

const packs: Array<{
  value: AllegationsPack
  label: string
  description: string
}> = [
  {
    value: 'general',
    label: 'General Chaos',
    description: 'Absurd accusations. Universal jurisdiction.',
  },
  {
    value: 'sensei',
    label: 'Sensei on Trial',
    description: 'Tech support, X/O crimes, and chaotic messaging.',
  },
  {
    value: 'mixed',
    label: 'Mixed Evidence',
    description: 'Sensei evidence with general disorder.',
  },
]

const tones: Array<{
  value: AllegationsTone
  label: string
  description: string
}> = [
  {
    value: 'friendly',
    label: 'Friendly',
    description: 'Silly charges. Minimal emotional damages.',
  },
  {
    value: 'feral',
    label: 'Feral',
    description: 'Sharper evidence about chaotic habits.',
  },
]

type AllegationsLobbyOptionsProps = {
  pack: AllegationsPack
  tone: AllegationsTone
  cases: number
  onPack: (pack: AllegationsPack) => void
  onTone: (tone: AllegationsTone) => void
  onCases: (cases: number) => void
}

export function AllegationsLobbyOptions({
  pack,
  tone,
  cases,
  onPack,
  onTone,
  onCases,
}: AllegationsLobbyOptionsProps) {
  return (
    <div className="allegations-lobby-options">
      <fieldset className="allegations-option-group allegations-pack-select">
        <legend>Evidence pack</legend>
        <div>
          {packs.map((option) => (
            <button
              aria-pressed={pack === option.value}
              className={pack === option.value ? 'active' : ''}
              key={option.value}
              type="button"
              onClick={() => onPack(option.value)}
            >
              <span>{option.label}</span>
              <small>{option.description}</small>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="allegations-option-group allegations-tone-select">
        <legend>Court temperament</legend>
        <div>
          {tones.map((option) => (
            <button
              aria-pressed={tone === option.value}
              className={tone === option.value ? 'active' : ''}
              key={option.value}
              type="button"
              onClick={() => onTone(option.value)}
            >
              <span>{option.label}</span>
              <small>{option.description}</small>
            </button>
          ))}
        </div>
        {tone === 'feral' ? (
          <p className="feral-warning" role="note">
            The court accepts no responsibility for damaged friendships.
          </p>
        ) : null}
      </fieldset>

      <fieldset className="allegations-option-group allegations-case-select">
        <legend>Cases</legend>
        <div>
          {[5, 7, 9].map((option) => (
            <button
              aria-pressed={cases === option}
              className={cases === option ? 'active' : ''}
              key={option}
              type="button"
              onClick={() => onCases(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  )
}
