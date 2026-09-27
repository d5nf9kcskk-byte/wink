import { useEffect, useId, useRef, useState, type FocusEvent, type ReactNode, type Ref } from 'react'
import { Minus, Plus } from 'lucide-react'
import { Band } from './Band'
import { Sheet } from './Sheet'
import type { ShelfItem } from '../lib/types'
import './PageEntry.css'

export type Hm = { h: string; m: string }

const toInt = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s) : null)
const toMinutes = ({ h, m }: Hm) =>
  (h.trim() || m.trim()) && /^\d*$/.test(h.trim()) && /^\d*$/.test(m.trim()) ? Number(h || 0) * 60 + Number(m || 0) : null
const toHm = (min: number): Hm => ({ h: String(Math.floor(min / 60)), m: String(min % 60) })
const hmText = (min: number) => `${Math.floor(min / 60)} h ${min % 60} min`
const selectAll = (e: FocusEvent<HTMLInputElement>) => e.currentTarget.select()

/** Hours + minutes fields under one legend. Values stay raw strings so partly typed input survives. */
export function DurationInput({
  legend,
  value,
  onChange,
  ref,
  describedBy,
  invalid,
  big,
}: {
  legend: ReactNode
  value: Hm
  onChange: (v: Hm) => void
  ref?: Ref<HTMLInputElement>
  describedBy?: string
  invalid?: boolean
  big?: boolean
}) {
  const field = {
    type: 'text',
    inputMode: 'numeric',
    autoComplete: 'off',
    className: 'durationinput__input',
    onFocus: selectAll,
    'aria-describedby': describedBy,
    'aria-invalid': invalid || undefined,
  } as const
  return (
    <fieldset className={`durationinput ${big ? 'durationinput--big' : ''}`}>
      <legend className="durationinput__legend">{legend}</legend>
      <div className="durationinput__row">
        <label className="durationinput__part">
          <input ref={ref} {...field} value={value.h} onChange={(e) => onChange({ ...value, h: e.target.value })} />
          hours
        </label>
        <label className="durationinput__part">
          <input {...field} value={value.m} onChange={(e) => onChange({ ...value, m: e.target.value })} />
          minutes
        </label>
      </div>
    </fieldset>
  )
}

type PageEntryProps = {
  open: boolean
  onClose: () => void
  book: ShelfItem
  start: number
  /** Saves the session at this position. A rejection is shown as an inline error. */
  onSave: (endPosition: number) => Promise<void>
  onFinished: () => void
}

/** Asks where the reader stopped. Pure UI: the caller does the saving. */
export function PageEntry({ open, onClose, book, start, onSave, onFinished }: PageEntryProps) {
  const audio = book.format === 'audiobook'
  const [page, setPage] = useState(String(start))
  const [time, setTime] = useState(() => toHm(start))
  const [error, setError] = useState<string | null>(null)
  const [stepped, setStepped] = useState('')
  const [wasOpen, setWasOpen] = useState(open)
  const busy = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const id = useId()

  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setPage(String(start))
      setTime(toHm(start))
      setError(null)
      setStepped('')
    }
  }

  // Runs after <Sheet> has called showModal, so the field is focusable.
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  function step(delta: number) {
    const next = Math.min(book.length, Math.max(0, (toInt(page) ?? start) + delta))
    setPage(String(next))
    setStepped(`Page ${next}`)
    setError(null)
  }

  async function save() {
    if (busy.current) return
    const v = audio ? toMinutes(time) : toInt(page)
    const problem =
      v === null
        ? audio
          ? 'Enter the hours and minutes using numbers only.'
          : 'Enter the page you’re on using numbers only.'
        : v > book.length
          ? audio
            ? `This audiobook is ${hmText(book.length)} long. Enter a time up to that.`
            : `This book has ${book.length} pages. Enter a page from 0 to ${book.length}.`
          : null
    if (problem || v === null) {
      setError(problem)
      inputRef.current?.focus()
      return
    }
    busy.current = true
    try {
      await onSave(v)
    } catch {
      busy.current = false
      setError('We couldn’t save this session. Please try again.')
    }
  }

  const describedBy = `${id}-hint${error ? ` ${id}-error` : ''}`

  return (
    <Sheet open={open} onClose={onClose} title="Save this session" genre={book.genre}>
      <form
        className="pageentry"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        {audio ? (
          <div>
            <DurationInput
              big
              ref={inputRef}
              legend="Where are you in the audiobook?"
              value={time}
              onChange={(v) => {
                setTime(v)
                setError(null)
              }}
              describedBy={describedBy}
              invalid={!!error}
            />
            <p id={`${id}-hint`} className="pageentry__hint">
              of {hmText(book.length)}
            </p>
          </div>
        ) : (
          <div>
            <label htmlFor={id} className="pageentry__label">
              What page are you on?
            </label>
            <div className="pageentry__row">
              <input
                ref={inputRef}
                id={id}
                className="pageentry__input"
                type="number"
                inputMode="numeric"
                min={0}
                max={book.length}
                value={page}
                onChange={(e) => {
                  setPage(e.target.value)
                  setError(null)
                }}
                onFocus={selectAll}
                aria-describedby={describedBy}
                aria-invalid={!!error || undefined}
              />
              <span id={`${id}-hint`} className="pageentry__hint">
                of {book.length}
              </span>
              <span className="pageentry__steps">
                <button type="button" className="pageentry__step" aria-label="One page back" onClick={() => step(-1)}>
                  <Minus size={22} strokeWidth={2.25} aria-hidden="true" />
                </button>
                <button type="button" className="pageentry__step" aria-label="One page forward" onClick={() => step(1)}>
                  <Plus size={22} strokeWidth={2.25} aria-hidden="true" />
                </button>
              </span>
            </div>
            {/* Focus stays on the stepper, so the new page is spoken from here. */}
            <p className="visually-hidden" aria-live="polite">
              {stepped}
            </p>
          </div>
        )}
        {error && (
          <p id={`${id}-error`} className="pageentry__error" role="alert">
            {error}
          </p>
        )}
        <div className="pageentry__actions">
          <Band type="submit" genre={book.genre}>
            Save session
          </Band>
          <button type="button" className="pageentry__alt" onClick={onFinished}>
            I finished the book
          </button>
        </div>
      </form>
    </Sheet>
  )
}
