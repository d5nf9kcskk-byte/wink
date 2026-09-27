import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { ChevronLeft, Square } from 'lucide-react'
import { Band } from '../components/Band'
import { PageEntry } from '../components/PageEntry'
import { RollingNumber } from '../components/RollingNumber'
import { Sheet } from '../components/Sheet'
import { WinkMark } from '../components/WinkMark'
import { useWink } from '../data/store'
import { genreVars } from '../lib/genres'
import { useRoute } from '../lib/route'
import type { ReadingSession, ShelfItem } from '../lib/types'
import { FinishFlow } from './Finish'
import './Session.css'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const CHECK_IN_EVERY = 3 * HOUR

const JUST_STOPPED = 'wink.justStopped'

// Outlives the screen, so coming back to a running timer doesn't replay the arrival.
let arrived: string | null = null

const pad = (n: number) => String(n).padStart(2, '0')
const hmText = (min: number) => `${Math.floor(min / 60)} h ${min % 60} min`

/** A datetime-local value (YYYY-MM-DDTHH:mm) in the reader's own time zone. */
function localInput(ms: number) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function startedLabel(ms: number) {
  const sameDay = new Date(ms).toDateString() === new Date().toDateString()
  return new Date(ms).toLocaleString(
    [],
    sameDay
      ? { hour: 'numeric', minute: '2-digit' }
      : { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
  )
}

function spoken(min: number) {
  const h = Math.floor(min / 60)
  const m = min % 60
  const parts = [h && `${h} ${h === 1 ? 'hour' : 'hours'}`, m && `${m} minutes`].filter(Boolean)
  return `Reading for ${parts.join(' ')}`
}

export function Session() {
  const { activeSession, books } = useWink()
  const book = activeSession && books.find((b) => b.id === activeSession.shelfItemId)
  // With no open session the shell sends the reader Home.
  return activeSession && book ? <OpenBook key={activeSession.id} session={activeSession} book={book} /> : null
}

function OpenBook({ session, book }: { session: ReadingSession; book: ShelfItem }) {
  const { setCheckIns, discardSession, stopSession } = useWink()
  const [, go] = useRoute()
  const start = Date.parse(session.startedAt)
  const [now, setNow] = useState(Date.now)
  const [stop, setStop] = useState<{ at: string; finishing: boolean } | null>(null)
  // Highest check-in mark answered; OpenBook is keyed by session id, so this is per session.
  const [answered, setAnswered] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const [discardFailed, setDiscardFailed] = useState(false)
  const discardRef = useRef<HTMLButtonElement>(null)
  const headRef = useRef<HTMLHeadingElement>(null)
  const ids = useId()
  const [entering] = useState(() => arrived !== session.id)
  useEffect(() => {
    arrived = session.id
  }, [session.id])

  // The control that opened this screen has unmounted, so give focus a place to land.
  useEffect(() => headRef.current?.focus(), [])

  useEffect(() => {
    let timer = 0
    const tick = () => {
      const n = Date.now()
      setNow(n)
      timer = window.setTimeout(tick, 1000 - ((((n - start) % 1000) + 1000) % 1000))
    }
    tick()
    return () => clearTimeout(timer)
  }, [start])

  const end = stop ? Date.parse(stop.at) : now
  const secs = Math.max(0, Math.floor((end - start) / 1000))
  const hm = `${Math.floor(secs / 3600)}:${pad(Math.floor(secs / 60) % 60)}`
  const quarter = Math.floor(secs / 900)
  const [firstQuarter] = useState(quarter)

  useEffect(() => {
    const before = document.title
    return () => {
      document.title = before
    }
  }, [])
  // Every tick, not just when the minute changes: the shell titles each route after this screen mounts.
  useEffect(() => {
    document.title = `${hm} · Wink`
  }, [hm, now])

  const mark = Math.floor((now - start) / CHECK_IN_EVERY)
  const checkInDue = session.checkInsEnabled && stop === null && mark > answered

  async function save(endPosition: number, endedAt?: string) {
    // Written before stopping: the shell redirects home the moment no session is open.
    try {
      sessionStorage.setItem(JUST_STOPPED, session.id)
    } catch {
      /* storage blocked: Home simply skips the stop chain */
    }
    try {
      await stopSession({ endPosition, endedAt })
    } catch (err) {
      // Nothing stopped, so Home mustn't play the stop chain for this session.
      try {
        sessionStorage.removeItem(JUST_STOPPED)
      } catch {
        /* storage blocked: nothing was written */
      }
      throw err
    }
    go('home', { replace: true })
  }

  async function discard() {
    try {
      await discardSession()
      go('home', { replace: true })
    } catch {
      setDiscardFailed(true)
    }
  }

  const position =
    book.format === 'audiobook'
      ? `${hmText(session.startPosition)} of ${hmText(book.length)}`
      : `p. ${session.startPosition} of ${book.length}`

  return (
    <div className={`session on-paper${entering ? ' session--enter' : ''}`} style={genreVars(book.genre)}>
      <header className="session__top">
        <button type="button" className="session__back" aria-label="Back to Home" onClick={() => go('home')}>
          <ChevronLeft size={28} strokeWidth={2.25} aria-hidden="true" />
        </button>
        <h1 ref={headRef} tabIndex={-1} className="session__title caps">
          {book.title}
        </h1>
        <WinkMark title={null} size={36} />
      </header>

      <div className="session__page">
        <div className="session__clock">
          <p className="session__timer">
            <span className="visually-hidden">Time reading: </span>
            <RollingNumber text={`${hm}:${pad(secs % 60)}`} />
          </p>
          <p className="session__fact">Started {startedLabel(start)}</p>
          <p className="session__fact">{position}</p>
        </div>

        <div className="session__checkins">
          <div>
            <label id={`${ids}-label`} htmlFor={`${ids}-switch`} className="session__checkins-label">
              Check in every 3 hours
            </label>
            <p id={`${ids}-help`} className="session__checkins-help">
              We’ll ask if you’re still reading, in case you forgot to stop the timer.
            </p>
          </div>
          <button
            id={`${ids}-switch`}
            type="button"
            role="switch"
            aria-checked={session.checkInsEnabled}
            aria-labelledby={`${ids}-label`}
            aria-describedby={`${ids}-help`}
            className="session__switch"
            onClick={() => {
              // The reader is clearly here, so turning check-ins on shouldn't ask about a mark already passed.
              setAnswered(mark)
              void setCheckIns(!session.checkInsEnabled).catch(() => {})
            }}
          >
            <span className="session__switch-track" aria-hidden="true">
              <span className="session__switch-knob" />
            </span>
            <span className="session__switch-state" aria-hidden="true">
              {session.checkInsEnabled ? 'On' : 'Off'}
            </span>
          </button>
        </div>

        <div className="session__discard">
          <button
            ref={discardRef}
            type="button"
            className="session__quiet"
            aria-expanded={confirming}
            aria-controls={`${ids}-discard`}
            onClick={() => {
              setConfirming((c) => !c)
              setDiscardFailed(false)
            }}
          >
            Discard this session
          </button>
          {confirming && (
            <div id={`${ids}-discard`} className="session__confirm">
              <p className="session__confirm-text">This session’s time won’t be saved.</p>
              {discardFailed && (
                <p className="session__error" role="alert">
                  We couldn’t discard this session. Please try again.
                </p>
              )}
              <div className="session__confirm-actions">
                <button type="button" className="session__quiet session__quiet--strong" onClick={() => void discard()}>
                  Yes, discard it
                </button>
                <button
                  type="button"
                  className="session__quiet"
                  onClick={() => {
                    setConfirming(false)
                    discardRef.current?.focus()
                  }}
                >
                  Keep it
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Band size="hero" genre={book.genre} className="session__stop" onClick={() => setStop({ at: new Date().toISOString(), finishing: false })}>
        <Square size={22} strokeWidth={2.5} fill="currentColor" aria-hidden="true" />
        Stop
      </Band>

      <p className="visually-hidden" aria-live="polite">
        {quarter > firstQuarter ? spoken(quarter * 15) : ''}
      </p>

      <PageEntry
        open={!!stop && !stop.finishing}
        onClose={() => setStop(null)}
        book={book}
        start={session.startPosition}
        onSave={(position) => save(position, stop?.at)}
        onFinished={() => setStop((s) => s && { ...s, finishing: true })}
      />
      {/* Rate first, then close the session: the shell leaves this screen once no session is open. */}
      <FinishFlow
        book={book}
        open={!!stop?.finishing}
        onClose={() => void save(book.length, stop?.at).catch(() => go('home'))}
      />

      <CheckIn
        open={checkInDue}
        book={book}
        start={start}
        now={now}
        mark={mark}
        onKeepGoing={() => setAnswered(mark)}
        onStopChecking={() => {
          setAnswered(mark)
          void setCheckIns(false).catch(() => {})
        }}
        onStoppedAt={(at) => {
          setAnswered(mark)
          setStop({ at, finishing: false })
        }}
      />
    </div>
  )
}

function CheckIn({
  open,
  book,
  start,
  now,
  mark,
  onKeepGoing,
  onStopChecking,
  onStoppedAt,
}: {
  open: boolean
  book: ShelfItem
  start: number
  now: number
  mark: number
  onKeepGoing: () => void
  onStopChecking: () => void
  onStoppedAt: (iso: string) => void
}) {
  const [time, setTime] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const id = useId()

  function submit(e: FormEvent) {
    e.preventDefault()
    // No offset in a datetime-local value, so Date.parse reads it as local time.
    const at = Date.parse(time ?? '')
    const problem = Number.isNaN(at)
      ? 'Enter the day and time you stopped reading.'
      : // The field has no seconds, so the minute you started in counts.
        at < start - (start % MINUTE) || at > Date.now()
        ? `Choose a time between ${startedLabel(start)} and now.`
        : null
    if (problem) {
      setError(problem)
      inputRef.current?.focus()
      return
    }
    setTime(null)
    setError(null)
    onStoppedAt(new Date(Math.max(at, start)).toISOString())
  }

  return (
    <Sheet open={open} onClose={() => {}} title="Still reading?" genre={book.genre} locked>
      <div className="session__sheet">
        {time === null ? (
          <>
            <p className="session__sheet-text">
              It’s been more than {mark * 3} hours since you started reading {book.title}.
            </p>
            <Band genre={book.genre} onClick={onKeepGoing}>
              Yes, keep going
            </Band>
            <button type="button" className="session__alt" autoFocus onClick={() => setTime(localInput(start + mark * CHECK_IN_EVERY))}>
              I stopped earlier
            </button>
            <button type="button" className="session__quiet" onClick={onStopChecking}>
              Stop checking in
            </button>
          </>
        ) : (
          <form className="session__sheet" noValidate onSubmit={submit}>
            <label htmlFor={id} className="session__sheet-label">
              When did you stop?
            </label>
            <input
              ref={inputRef}
              id={id}
              className="session__time"
              type="datetime-local"
              autoFocus
              min={localInput(start)}
              max={localInput(now)}
              value={time}
              onChange={(e) => {
                setTime(e.target.value)
                setError(null)
              }}
              aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
              aria-invalid={!!error || undefined}
            />
            <p id={`${id}-hint`} className="session__fact">
              Any time from {startedLabel(start)} until now.
            </p>
            {error && (
              <p id={`${id}-error`} className="session__error" role="alert">
                {error}
              </p>
            )}
            <Band type="submit" genre={book.genre}>
              Continue
            </Band>
            <button
              type="button"
              className="session__quiet"
              onClick={() => {
                setTime(null)
                setError(null)
              }}
            >
              Back
            </button>
          </form>
        )}
      </div>
    </Sheet>
  )
}
