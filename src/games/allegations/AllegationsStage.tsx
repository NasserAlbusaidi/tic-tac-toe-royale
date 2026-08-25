import { Eye, Fingerprint, LockKeyhole } from 'lucide-react'
import type { Mark, RoomState } from '../../types'
import { AllegationsCourtRecord } from './AllegationsCourtRecord'
import { AllegationsReveal } from './AllegationsReveal'
import { AllegationsScorePanel } from './AllegationsScorePanel'
import './allegations.css'

function suspectName(room: RoomState, mark: Mark) {
  return room.players[mark]?.name ?? `Suspect ${mark}`
}

export function AllegationsStage({
  room,
  canVote,
  onVote,
  onNext,
  onReset,
  onLeave,
}: {
  room: RoomState
  canVote: boolean
  onVote: (target: Mark) => void
  onNext: () => void
  onReset: () => void
  onLeave: () => void
}) {
  const court = room.allegations

  if (!court) {
    return <p className="system-message">The court file could not be opened.</p>
  }

  if (room.status === 'lobby') {
    return (
      <section className="allegations-waiting-stage" aria-labelledby="court-waiting-title">
        <Fingerprint size={38} aria-hidden="true" />
        <span>Case file {room.code}</span>
        <h1 id="court-waiting-title">Court is waiting for the second suspect.</h1>
        <p>Share the room code. Evidence is optional.</p>
        <dl>
          <div>
            <dt>Evidence</dt>
            <dd>{court.pack === 'sensei' ? 'Sensei on Trial' : court.pack === 'mixed' ? 'Mixed Evidence' : 'General Chaos'}</dd>
          </div>
          <div>
            <dt>Temperament</dt>
            <dd>{court.tone === 'feral' ? 'Feral' : 'Friendly'}</dd>
          </div>
          <div>
            <dt>Docket</dt>
            <dd>{room.config.totalRounds} cases</dd>
          </div>
        </dl>
      </section>
    )
  }

  if (room.status === 'matchOver') {
    return <AllegationsCourtRecord room={room} onReset={onReset} onLeave={onLeave} />
  }

  if (room.status === 'roundOver') {
    return <AllegationsReveal room={room} onNext={onNext} />
  }

  const opponent = room.you.mark === 'X' ? 'O' : 'X'
  const waitingName = room.you.mark ? suspectName(room, opponent) : 'the suspects'
  const hasVoted = Boolean(court.yourVote)

  return (
    <section className="allegations-voting-stage" aria-labelledby="allegation-prompt">
      <header className="case-docket">
        <span>Case {room.currentRound} of {room.config.totalRounds}</span>
        <b>{court.pack === 'sensei' ? 'Sensei on Trial' : court.pack === 'mixed' ? 'Mixed Evidence' : 'General Chaos'}</b>
        <small>{court.tone === 'feral' ? 'Feral court' : 'Friendly court'}</small>
      </header>

      <div className="allegation-prompt-card">
        <Fingerprint size={30} aria-hidden="true" />
        <span>Exhibit {String(room.currentRound).padStart(2, '0')}</span>
        <h1 id="allegation-prompt">
          {court.currentPrompt?.text ?? 'The court misplaced this allegation.'}
        </h1>
        <p>Point at the guilty party.</p>
      </div>

      <div className="suspect-vote-grid" role="group" aria-label="Choose the guilty suspect">
        {(['X', 'O'] as const).map((mark) => {
          const selected = court.yourVote === mark
          return (
            <button
              aria-label={`Vote for ${suspectName(room, mark)}, Suspect ${mark}`}
              aria-pressed={selected}
              className={selected ? 'selected' : ''}
              disabled={!canVote || hasVoted}
              key={mark}
              type="button"
              onClick={() => onVote(mark)}
            >
              <span>Suspect {mark}</span>
              <strong>{suspectName(room, mark)}</strong>
              <small>{selected ? 'Selected as guilty' : 'Submit sealed verdict'}</small>
              {selected ? (
                <b className="verdict-locked">
                  <LockKeyhole size={15} aria-hidden="true" />
                  Verdict locked
                </b>
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="submission-ledger" aria-live="polite">
        {(['X', 'O'] as const).map((mark) => (
          <span className={court.submitted[mark] ? 'submitted' : ''} key={mark}>
            {court.submitted[mark] ? <LockKeyhole size={14} /> : <Eye size={14} />}
            <strong>{suspectName(room, mark)}</strong>
            <small>{court.submitted[mark] ? 'Verdict locked' : 'Reviewing evidence'}</small>
          </span>
        ))}
      </div>

      <p className="court-status-copy" aria-live="polite">
        {room.you.isSpectator
          ? 'Watching the proceedings. Both verdicts remain sealed.'
          : hasVoted
            ? `Verdict locked. Waiting for ${waitingName} to finish inventing evidence.`
            : 'Your vote is secret and final. Choose irresponsibly.'}
      </p>

      <AllegationsScorePanel room={room} compact />

      <div className="case-progress" aria-label="Case progress">
        {Array.from({ length: room.config.totalRounds }, (_, index) => {
          const resolved = court.cases[index]
          return (
            <span
              className={[
                index + 1 === room.currentRound ? 'active' : '',
                resolved ? `outcome-${resolved.outcome}` : '',
              ].filter(Boolean).join(' ')}
              key={index}
              title={resolved ? `Case ${index + 1}: ${resolved.outcome}` : `Case ${index + 1}`}
            >
              {index + 1}
            </span>
          )
        })}
      </div>
    </section>
  )
}
