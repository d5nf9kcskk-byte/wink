import { useRef, useState } from 'react'
import { motion } from 'motion/react'
import { CircleAlert } from 'lucide-react'
import { useWink } from '../data/store'
import { coverUrl } from '../data/openlibrary'
import { GENRES, genreVars } from '../lib/genres'
import { dur, EASE_OUT, useMotionPref } from '../lib/motion'
import { sessionMinutes, sessionsLeft } from '../lib/progress'
import { useRoute } from '../lib/route'
import type { ShelfItem } from '../lib/types'
import { FinishFlow } from '../screens/Finish'
import { Band } from './Band'
import { BookOpening } from './BookOpening'
import { RollingNumber } from './RollingNumber'
import { WinkMark } from './WinkMark'
import './Cover.css'

const FORMAT = { physical: 'Print', ebook: 'Ebook', audiobook: 'Audiobook' } as const

function hm(minutes: number) {
  const m = Math.round(minutes)
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} m` : `${m} m`
}

const clock = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`

function place(book: ShelfItem, kid: boolean) {
  if (book.format === 'audiobook') return book.position > 0 ? `${hm(book.position)} of ${hm(book.length)}` : hm(book.length)
  if (book.position <= 0) return `${book.length} pages`
  return `${kid ? 'page' : 'p.'} ${book.position} of ${book.length}`
}

function Thumb({ coverId, title }: { coverId: number | null; title: string }) {
  const [broken, setBroken] = useState(false)
  if (coverId === null || broken) return <span className="cover__thumb cover__thumb--blank" aria-hidden="true" />
  return (
    <img
      className="cover__thumb"
      // default=false makes Open Library 404 instead of sending a blank image, so the fallback shows.
      src={`${coverUrl(coverId, 'M')}?default=false`}
      width={56}
      height={84}
      loading="lazy"
      decoding="async"
      alt={`Cover of ${title}`}
      onError={() => setBroken(true)}
    />
  )
}

type CoverProps = {
  book: ShelfItem | null
  level: number
  /** Overrides the band fill while Home replays a just-saved session. */
  progress?: number
  now: Date
  kid: boolean
  onAddBook: () => void
}

export function Cover({ book, level, progress, now, kid, onAddBook }: CoverProps) {
  const { activeSession, sessions, books, startSession } = useWink()
  const pref = useMotionPref()
  const [, go] = useRoute()
  const scope = useRef<HTMLElement>(null)
  const [opening, setOpening] = useState(false)
  // The cover the opening overlay copies; set once the session has started and the book is playing open.
  const [openFrom, setOpenFrom] = useState<HTMLElement | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const id = book?.id ?? null
  const [shownId, setShownId] = useState(id)
  const [swapped, setSwapped] = useState(false)
  if (id !== shownId) {
    setShownId(id)
    setSwapped(true)
    setError(null)
    setFinishing(false)
  }

  const genre = book?.genre ?? 'unclassified'
  const complete = !!book && book.length > 0 && book.position >= book.length

  async function openBook() {
    if (!book || opening) return
    setError(null)
    setOpening(true)
    try {
      await startSession(book.id)
    } catch {
      setOpening(false)
      setError("Wink couldn't start your session. Try again in a moment.")
      return
    }
    if (pref === 'off' || !scope.current) go('session')
    else setOpenFrom(scope.current)
  }

  const [label, onPress] = !book
    ? ['Add a book', onAddBook]
    : activeSession && !opening
      ? [
          activeSession.shelfItemId === book.id
            ? `Resume · ${clock(sessionMinutes(activeSession, now))} reading`
            : `Resume ${books.find((b) => b.id === activeSession.shelfItemId)?.title ?? 'reading'}`,
          () => go('session'),
        ]
      : complete
        ? ['Finish this book', () => setFinishing(true)]
        : ['Start reading', openBook]

  const left = book && !complete ? sessionsLeft(book, sessions, books) : null
  const facts = book
    ? [
        FORMAT[book.format],
        place(book, kid),
        left
          ? kid
            ? `about ${left} more ${left === 1 ? 'read' : 'reads'}`
            : `about ${left} ${left === 1 ? 'session' : 'sessions'} left`
          : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null

  return (
    <>
      <motion.div
        key={id ?? 'empty'}
        className={`cover${openFrom && pref === 'full' ? ' cover--opening' : ''}`}
        inert={!!openFrom}
        initial={swapped ? { opacity: 0, x: pref === 'full' ? 24 : 0 } : false}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: dur(pref, 0.32), ease: EASE_OUT }}
      >
        <article ref={scope} className="cover__book on-paper" style={genreVars(genre)}>
          <div className="cover__top">
            <span className="caps">{book ? GENRES[genre].label : 'No book yet'}</span>
            <span className="caps">
              Level <RollingNumber className="cover__level" text={String(level)} />
            </span>
          </div>

          <div className="cover__body">
            {book && <Thumb coverId={book.coverId} title={book.title} />}
            <h1 className="cover__title">{book ? book.title : "Add the book you're reading"}</h1>
            {book ? (
              book.authors.length > 0 && (
                <>
                  <span className="cover__rule" aria-hidden="true" />
                  <p className="cover__author">{book.authors.join(', ')}</p>
                </>
              )
            ) : (
              <p className="cover__guide">
                {kid
                  ? 'Find your book and Wink will help you keep your place.'
                  : 'Search by title or author. Wink keeps your place and counts your reading time.'}
              </p>
            )}
            {facts && <p className="cover__facts">{facts}</p>}
            {error && (
              <p className="cover__error" role="alert">
                <CircleAlert size={20} aria-hidden="true" />
                {error}
              </p>
            )}
          </div>

          <Band
            genre={genre}
            size="hero"
            progress={book ? (progress ?? (book.length > 0 ? book.position / book.length : 0)) : undefined}
            onClick={onPress}
            className="cover__start"
          >
            <span className="cover__band">
              <WinkMark size={44} title={null} />
              <span className="cover__label">{label}</span>
            </span>
          </Band>
        </article>
      </motion.div>
      {book && <FinishFlow book={book} open={finishing} onClose={() => setFinishing(false)} />}
      {book && openFrom && (
        <BookOpening book={book} cover={openFrom} full={pref === 'full'} />
      )}
    </>
  )
}
