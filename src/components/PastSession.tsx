import { useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { Check, Minus, Plus } from 'lucide-react'
import { Band } from './Band'
import { DurationInput, type Hm } from './PageEntry'
import { Sheet } from './Sheet'
import { useWink } from '../data/store'
import { genreVars } from '../lib/genres'
import { localDay } from '../lib/progress'
import { useRoute } from '../lib/route'
import type { GenreId, ShelfItem } from '../lib/types'
import './PastSession.css'

const DATE = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
const DATE_YEAR = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const pad = (n: number) => String(n).padStart(2, '0')
const toHm = (min: number): Hm => ({ h: String(Math.floor(min / 60)), m: String(min % 60) })
const whole = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s) : NaN)
const recent = (b: ShelfItem) => Date.parse(b.lastReadAt ?? b.startedAt)

/** 20:00, or on today a start that ends by now (on a 5-minute mark), so the default is always a time that has happened. */
function startFor(day: string, minutes: number): string {
  const now = new Date()
  if (day !== localDay(now)) return '20:00'
  const t = Math.max(0, Math.min(20 * 60, Math.floor((now.getHours() * 60 + now.getMinutes() - minutes) / 5) * 5))
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`
}

type PastSessionProps = {
  open: boolean
  onClose: () => void
  day: string
  /** The day's ink, for the sheet's head band. */
  genre: GenreId
  /** The book read longest that day, chosen first. */
  dayBookId?: string
  onAdded: () => void
}

/** Logs reading that wasn't timed on a past day or earlier today. Store errors show verbatim; they're written for readers. */
export function PastSession({ open, onClose, day, genre, dayBookId, onAdded }: PastSessionProps) {
  const { books, heroBook, addPastSession } = useWink()
  const [, go] = useRoute()
  const id = useId()
  const shelf = useMemo(
    () =>
      books
        .filter((b) => b.status === 'reading' || b.status === 'finished')
        .sort((a, b) => (a.status === b.status ? recent(b) - recent(a) : a.status === 'reading' ? -1 : 1)),
    [books],
  )
  const [bookId, setBookId] = useState('')
  const [time, setTime] = useState('20:00')
  const [minutes, setMinutes] = useState('30')
  const [page, setPage] = useState('')
  const [where, setWhere] = useState<Hm>({ h: '', m: '' })
  const [error, setError] = useState<string | null>(null)
  const [stepped, setStepped] = useState('')
  const [wasOpen, setWasOpen] = useState(false)
  const busy = useRef(false)

  function choose(b: ShelfItem | undefined) {
    setBookId(b?.id ?? '')
    setPage(b ? String(b.position) : '')
    setWhere(toHm(b?.position ?? 0))
    setError(null)
  }

  // Each opening starts fresh for the day it was opened on.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      choose(shelf.find((b) => b.id === dayBookId) ?? shelf.find((b) => b.id === heroBook?.id) ?? shelf[0])
      setMinutes('30')
      setTime(startFor(day, 30))
      setStepped('')
    }
  }

  const book = shelf.find((b) => b.id === bookId)
  const audio = book?.format === 'audiobook'

  function step(dir: 1 | -1) {
    const n = whole(minutes)
    const base = Number.isFinite(n) ? n : 30
    const next = Math.min(720, Math.max(1, dir > 0 ? Math.floor(base / 5) * 5 + 5 : Math.ceil(base / 5) * 5 - 5))
    setMinutes(String(next))
    setStepped(`${next} minutes`)
    setError(null)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!book || busy.current) return
    const blank = audio ? !where.h.trim() && !where.m.trim() : !page.trim()
    const reached = blank ? undefined : audio ? whole(where.h || '0') * 60 + whole(where.m || '0') : whole(page)
    busy.current = true
    try {
      await addPastSession({ shelfItemId: book.id, day, startTime: time.slice(0, 5), minutes: whole(minutes), reachedPosition: reached })
      onAdded()
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'That session couldn’t be added. Please try again.')
    } finally {
      busy.current = false
    }
  }

  const [y, m, d] = day.split('-').map(Number)

  return (
    <Sheet open={open} onClose={onClose} title="Add a session" genre={genre}>
      {shelf.length === 0 ? (
        <div className="past">
          <p className="past__guide">Add a book to your shelf first. Then you can log the time you spent with it here.</p>
          <Band
            onClick={() => {
              onClose()
              go('home')
            }}
          >
            Add a book on Home
          </Band>
        </div>
      ) : (
        <form className="past" noValidate onSubmit={submit}>
          <p className="past__day">{(y === new Date().getFullYear() ? DATE : DATE_YEAR).format(new Date(y, m - 1, d))}</p>

          <fieldset className="past__set">
            <legend className="past__label">Book</legend>
            <div className="past__books">
              {shelf.map((b) => (
                <label key={b.id} className="past__book" style={genreVars(b.genre)}>
                  <input
                    type="radio"
                    className="visually-hidden"
                    name={`${id}-book`}
                    checked={b.id === bookId}
                    onChange={() => choose(b)}
                  />
                  <span className="past__chip" aria-hidden="true" />
                  <span className="past__text">
                    <span className="past__title">{b.title}</span>
                    <span className="past__meta">
                      {[b.authors.join(', '), b.status === 'finished' && 'Finished'].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <Check className="past__check" size={22} strokeWidth={2.5} aria-hidden="true" />
                </label>
              ))}
            </div>
          </fieldset>

          <div className="past__row">
            <div className="past__field">
              <label htmlFor={`${id}-time`} className="past__label">
                Started at
              </label>
              <input
                id={`${id}-time`}
                className="past__input"
                type="time"
                value={time}
                onChange={(e) => {
                  setTime(e.target.value)
                  setError(null)
                }}
              />
            </div>
            <div className="past__field">
              <label htmlFor={`${id}-min`} className="past__label">
                Minutes read
              </label>
              <div className="past__stepper">
                <button type="button" className="past__step" aria-label="5 minutes fewer" onClick={() => step(-1)}>
                  <Minus size={22} strokeWidth={2.25} aria-hidden="true" />
                </button>
                <input
                  id={`${id}-min`}
                  className="past__input past__minutes"
                  inputMode="numeric"
                  autoComplete="off"
                  value={minutes}
                  onChange={(e) => {
                    setMinutes(e.target.value)
                    setError(null)
                  }}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button type="button" className="past__step" aria-label="5 minutes more" onClick={() => step(1)}>
                  <Plus size={22} strokeWidth={2.25} aria-hidden="true" />
                </button>
              </div>
              {/* Focus stays on the stepper, so the new value is spoken from here. */}
              <p className="visually-hidden" aria-live="polite">
                {stepped}
              </p>
            </div>
          </div>

          {book &&
            (audio ? (
              <DurationInput
                legend="Where you got to (optional)"
                value={where}
                onChange={(v) => {
                  setWhere(v)
                  setError(null)
                }}
              />
            ) : (
              <div className="past__field">
                <label htmlFor={`${id}-page`} className="past__label">
                  Page you reached (optional)
                </label>
                <div className="past__pageline">
                  <input
                    id={`${id}-page`}
                    className="past__input past__page"
                    inputMode="numeric"
                    autoComplete="off"
                    value={page}
                    aria-describedby={`${id}-of`}
                    onChange={(e) => {
                      setPage(e.target.value)
                      setError(null)
                    }}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <span id={`${id}-of`} className="past__hint">
                    of {book.length}
                  </span>
                </div>
              </div>
            ))}

          {error && (
            <p className="past__error" role="alert">
              {error}
            </p>
          )}

          <Band type="submit" genre={book?.genre}>
            Add session
          </Band>
        </form>
      )}
    </Sheet>
  )
}
