import { Check, Clipboard, DoorOpen, RotateCcw, Scale } from 'lucide-react'
import { useState } from 'react'
import type { AllegationCaseSummary, Mark, RoomState } from '../../types'

function suspectName(room: RoomState, mark: Mark) {
  return room.players[mark]?.name ?? `Suspect ${mark}`
}

function statusFor(mark: Mark, convicted: Mark | 'both' | 'none') {
  if (convicted === mark) return 'Certified Menace'
  if (convicted === 'both') return 'Co-conspirator'
  if (convicted === 'none') return 'Released on Technicality'
  return 'Barely Acquitted'
}

function chargesFor(cases: AllegationCaseSummary[], mark: Mark) {
  return cases.filter((item) => item.charged === mark).map((item) => item.prompt.charge)
}

function verdictText(room: RoomState) {
  const court = room.allegations
  const verdict = court?.verdict

  if (!court || !verdict) return ''

  const selfReports = court.cases.filter((item) => item.outcome === 'selfReport').length
  const blocks = (['X', 'O'] as const).map((mark) => {
    const charges = chargesFor(court.cases, mark)
    const accusations = court.cases.filter(
      (item) => item.votes[mark] === (mark === 'X' ? 'O' : 'X'),
    ).length

    return [
      suspectName(room, mark).toUpperCase(),
      statusFor(mark, verdict.convicted).toUpperCase(),
      `${court.charges[mark]} ${court.charges[mark] === 1 ? 'charge' : 'charges'}`,
      ...(charges.length ? charges.map((charge) => `• ${charge}`) : ['• No unanimous charges']),
      `${accusations} accusations made against the other suspect`,
    ].join('\n')
  })

  return [
    'OFFICIAL COURT RECORD',
    `Room ${room.code} · ${court.cases.length} cases`,
    '',
    ...blocks.flatMap((block) => [block, '']),
    `Self-reports: ${selfReports}`,
    `Ruling: ${verdict.title}`,
    `Sentence: ${verdict.sentence}`,
    `Appeal status: ${verdict.appealStatus}`,
  ].join('\n')
}

export function AllegationsCourtRecord({
  room,
  onReset,
  onLeave,
}: {
  room: RoomState
  onReset: () => void
  onLeave: () => void
}) {
  const [copied, setCopied] = useState(false)
  const court = room.allegations
  const verdict = court?.verdict

  if (!court || !verdict) {
    return <p className="system-message">The official court record is unavailable.</p>
  }

  const selfReports = court.cases.filter((item) => item.outcome === 'selfReport').length

  async function copyVerdict() {
    await navigator.clipboard.writeText(verdictText(room))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <section className="court-record" aria-labelledby="court-record-title">
      <header className="court-record-heading">
        <Scale size={26} aria-hidden="true" />
        <span>Filed under room {room.code}</span>
        <h1 id="court-record-title">Official Court Record</h1>
        <p>{court.cases.length} cases heard. Several reputations inconvenienced.</p>
      </header>

      <div className="court-record-suspects">
        {(['X', 'O'] as const).map((mark) => {
          const charges = chargesFor(court.cases, mark)
          const accusations = court.cases.filter(
            (item) => item.votes[mark] === (mark === 'X' ? 'O' : 'X'),
          ).length
          const convicted = verdict.convicted === mark || verdict.convicted === 'both'

          return (
            <article className={convicted ? 'convicted' : 'acquitted'} key={mark}>
              <span>Suspect {mark}</span>
              <h2>{suspectName(room, mark)}</h2>
              <strong className="record-status">{statusFor(mark, verdict.convicted)}</strong>
              <p>
                {convicted ? 'Convicted' : 'Recorded'} on {court.charges[mark]}{' '}
                {court.charges[mark] === 1 ? 'count' : 'counts'}
              </p>
              <ul>
                {charges.length ? (
                  charges.map((charge, index) => <li key={`${charge}-${index}`}>{charge}</li>)
                ) : (
                  <li>No unanimous charges. The court remains suspicious.</li>
                )}
              </ul>
              <small>{accusations} accusations made against the other suspect</small>
            </article>
          )
        })}
      </div>

      <dl className="court-record-ruling">
        <div>
          <dt>Final title</dt>
          <dd>{verdict.title}</dd>
        </div>
        <div>
          <dt>Self-reports</dt>
          <dd>{selfReports}</dd>
        </div>
        <div>
          <dt>Sentence</dt>
          <dd>{verdict.sentence}</dd>
        </div>
        <div>
          <dt>Appeal status</dt>
          <dd>{verdict.appealStatus}</dd>
        </div>
      </dl>

      <div className="court-record-actions">
        <button className="copy-verdict" type="button" onClick={copyVerdict}>
          {copied ? <Check size={18} /> : <Clipboard size={18} />}
          {copied ? 'Verdict copied' : 'Copy verdict'}
        </button>
        <button
          className="return-to-court"
          disabled={!room.you.isHost}
          type="button"
          onClick={onReset}
        >
          <RotateCcw size={18} />
          <span>
            {room.you.isHost ? 'Return to court' : 'Waiting for host'}
            <small>Previous verdict will be used as evidence</small>
          </span>
        </button>
        <button className="leave-court" type="button" onClick={onLeave}>
          <DoorOpen size={18} />
          Leave room
        </button>
      </div>
    </section>
  )
}
