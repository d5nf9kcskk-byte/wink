import { useId, type Ref } from 'react'
import { motion } from 'motion/react'
import { Plus } from 'lucide-react'
import { Band } from './Band'
import { genreVars } from '../lib/genres'
import { dur, EASE_OUT, useMotionPref } from '../lib/motion'
import type { DayTotal } from '../lib/progress'
import type { ShelfItem } from '../lib/types'
import './DayCard.css'

const DATE = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
const DATE_YEAR = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function counted(t: DayTotal, provisional: boolean): string {
  switch (t.state) {
    case 'read':
      return 'Read'
    case 'repaired':
      return provisional ? 'Covered by a free repair if you read today' : 'Covered by a free repair'
    case 'grace':
      return provisional ? 'Forgiven if you read today' : 'Forgiven — you read the next day'
    case 'missed':
      return 'No reading'
    case 'pending':
      return 'Today'
    case 'future':
      return 'Still to come'
    case 'before':
      return 'Before your first session'
  }
}

function facts(minutes: number, pages: number, sessions: number, audio: boolean): string {
  return [`${minutes} min`, !audio && pages > 0 && plural(pages, 'page'), sessions > 0 && plural(sessions, 'session')]
    .filter(Boolean)
    .join(' · ')
}

type DayCardProps = {
  total: DayTotal
  books: ShelfItem[]
  /** The streak still hangs on today's reading, so a repair or grace here isn't settled yet. */
  provisional: boolean
  onAdd: () => void
  ref?: Ref<HTMLElement>
}

/** One day as a small tri-band: the date in the day's ink, the books read on white, and Add a session at its foot. */
export function DayCard({ total: t, books, provisional, onAdd, ref }: DayCardProps) {
  const pref = useMotionPref()
  const id = useId()
  const ink = t.state === 'read' ? t.genre ?? 'unclassified' : 'unclassified'
  const byId = new Map(books.map((b) => [b.id, b]))
  const [y, m, d] = t.day.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const sessions = t.books.reduce((n, b) => n + b.sessions, 0)

  return (
    <motion.section
      key={t.day}
      ref={ref}
      className="daycard"
      aria-labelledby={id}
      initial={{ opacity: 0, y: pref === 'full' ? 12 : 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: dur(pref, 0.32), ease: EASE_OUT }}
    >
      <header className="daycard__band" style={genreVars(ink)}>
        <h2 id={id} className="daycard__date caps">
          {(y === new Date().getFullYear() ? DATE : DATE_YEAR).format(date)}
        </h2>
        <p className="daycard__how">{counted(t, provisional)}</p>
      </header>

      <div className="daycard__page on-paper">
        {t.books.length > 0 ? (
          <>
            <ul className="daycard__books">
              {t.books.map((b) => {
                const book = byId.get(b.shelfItemId)
                return (
                  <li key={b.shelfItemId} className="daycard__book" style={genreVars(book?.genre ?? 'unclassified')}>
                    <span className="daycard__chip" aria-hidden="true" />
                    <span className="daycard__text">
                      <span className="daycard__title">{book?.title ?? 'A book'}</span>
                      {book?.authors.length ? <span className="daycard__author">{book.authors.join(', ')}</span> : null}
                      <span className="daycard__facts">
                        {facts(b.minutes, b.pages, b.sessions, book?.format === 'audiobook')}
                      </span>
                    </span>
                  </li>
                )
              })}
            </ul>
            {t.books.length > 1 && (
              <p className="daycard__total">In all · {facts(t.minutes, t.pages, sessions, false)}</p>
            )}
          </>
        ) : (
          <p className="daycard__empty">
            {t.state === 'future'
              ? 'This day is still to come.'
              : t.state === 'pending'
                ? 'Nothing logged yet today.'
                : 'No reading logged this day.'}
          </p>
        )}
      </div>

      {t.state !== 'future' && (
        <Band genre={ink} onClick={onAdd}>
          <Plus size={22} strokeWidth={2.25} aria-hidden="true" />
          Add a session
        </Band>
      )}
    </motion.section>
  )
}
