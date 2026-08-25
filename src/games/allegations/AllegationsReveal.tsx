import { ArrowRight, Gavel } from 'lucide-react'
import type { Mark, RoomState } from '../../types'

function suspectName(room: RoomState, mark: Mark) {
  return room.players[mark]?.name ?? `Suspect ${mark}`
}

export function AllegationsReveal({
  room,
  onNext,
}: {
  room: RoomState
  onNext: () => void
}) {
  const court = room.allegations
  const resolvedCase = court?.cases.at(-1)

  if (!court || !resolvedCase || !court.revealedVotes) {
    return <p className="system-message">The evidence file is unavailable.</p>
  }

  const chargedName = resolvedCase.charged
    ? suspectName(room, resolvedCase.charged)
    : null
  const ruling =
    resolvedCase.outcome === 'unanimous'
      ? 'Unanimous verdict'
      : resolvedCase.outcome === 'mutualSlander'
        ? 'Mutual slander'
        : 'Unexpected self-awareness'

  return (
    <section className="allegations-reveal" aria-labelledby="allegations-ruling">
      <div className="evidence-opening" aria-hidden="true">
        <span />
        Opening evidence…
        <span />
      </div>

      <div className="reveal-prompt">
        <span>Case {resolvedCase.caseNumber}</span>
        <p>{resolvedCase.prompt.text}</p>
      </div>

      <div className="revealed-votes" aria-label="Revealed verdicts">
        {(['X', 'O'] as const).map((mark, index) => {
          const target = court.revealedVotes?.[mark] as Mark
          return (
            <article className={`revealed-vote reveal-${index + 1}`} key={mark}>
              <span>{suspectName(room, mark)} accused</span>
              <strong>{suspectName(room, target)}</strong>
              <small>Verdict of Suspect {mark}</small>
            </article>
          )
        })}
      </div>

      <div className={`ruling-stamp outcome-${resolvedCase.outcome}`}>
        <Gavel size={25} aria-hidden="true" />
        <h2 id="allegations-ruling">{ruling}</h2>
        {resolvedCase.outcome === 'unanimous' ? (
          <p>
            {chargedName} has been charged with
            <strong>{resolvedCase.prompt.charge}</strong>
          </p>
        ) : resolvedCase.outcome === 'mutualSlander' ? (
          <p>
            Both witnesses accuse each other.
            <strong>Case dismissed; dignity not restored.</strong>
          </p>
        ) : (
          <p>
            Both defendants confessed.
            <strong>The court was not emotionally prepared.</strong>
          </p>
        )}
      </div>

      <p className="sr-only" aria-live="assertive">
        {ruling}. {chargedName ? `${chargedName} received one charge.` : 'No charge awarded.'}
      </p>

      {room.you.isHost ? (
        <button className="allegations-next-case" type="button" onClick={onNext}>
          Next case
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      ) : (
        <p className="court-waiting-note">The clerk is waiting for the host to open the next file.</p>
      )}
    </section>
  )
}
