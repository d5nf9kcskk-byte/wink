import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { DayCard } from '../components/DayCard'
import { PastSession } from '../components/PastSession'
import { RollingNumber } from '../components/RollingNumber'
import { YearShelves } from '../components/YearShelves'
import { useWink } from '../data/store'
import { useMotionPref } from '../lib/motion'
import { dayTotals, localDay, streakInfo } from '../lib/progress'
import { useRoute } from '../lib/route'
import './Streak.css'

// Below this much card showing above the tab bar, a tap on the shelves brings the card up.
const PEEK = 160

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  return now
}

export function Streak() {
  const { books, sessions } = useWink()
  const [, go] = useRoute()
  const pref = useMotionPref()
  const now = useNow()
  const today = localDay(now)
  const thisYear = now.getFullYear()
  const [year, setYear] = useState(thisYear)
  const [picked, setPicked] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [dropped, setDropped] = useState<{ day: string; at: number } | null>(null)
  const headRef = useRef<HTMLHeadingElement>(null)
  const cardRef = useRef<HTMLElement>(null)
  const ids = useId()

  // The control that opened this page has unmounted, so give focus a place to land.
  useEffect(() => headRef.current?.focus(), [])

  const streak = useMemo(() => streakInfo(sessions, now), [sessions, now])
  const days = useMemo(
    () => dayTotals(sessions, books, streak, `${year}-01-01`, `${year}-12-31`, now),
    [sessions, books, streak, year, now],
  )
  const years = useMemo(
    () =>
      [...new Set([thisYear, ...sessions.map((s) => Number(localDay(s.startedAt).slice(0, 4)))])]
        .filter((y) => y <= thisYear)
        .sort((a, b) => a - b),
    [sessions, thisYear],
  )

  const readDays = days.filter((d) => d.state === 'read')
  const lastRead = readDays.at(-1)?.day
  const selected = picked?.startsWith(`${year}-`) ? picked : (lastRead ?? (year === thisYear ? today : `${year}-12-31`))
  const total = days.find((d) => d.day === selected) ?? days[0]
  const ink = total.state === 'read' ? (total.genre ?? 'unclassified') : 'unclassified'
  const provisional =
    year === thisYear &&
    streak.status === 'ember' &&
    (total.state === 'repaired' || total.state === 'grace') &&
    total.day > (lastRead ?? '')
  const at = years.indexOf(year)
  const prev = years[at - 1]
  const next = years[at + 1]

  const facts = streak.longest > 0 && [
    `Longest streak ${plural(streak.longest, 'day')}`,
    `${plural(readDays.length, 'day')} read ${year === thisYear ? 'this year' : `in ${year}`}`,
    `${plural(streak.tokens, 'free repair')} saved`,
    streak.tokens < 3 && `next free repair in ${plural(streak.nextTokenIn, 'reading day')}`,
  ]

  function select(day: string, pointer: boolean) {
    setPicked(day)
    const card = cardRef.current
    if (pointer && card && card.getBoundingClientRect().top > innerHeight - PEEK)
      card.scrollIntoView({ block: 'nearest', behavior: pref === 'full' ? 'smooth' : 'instant' })
  }

  return (
    <div className="streak">
      <header className="streak__head">
        <button type="button" className="streak__back" aria-label="Back to Home" onClick={() => go('home')}>
          <ChevronLeft size={28} strokeWidth={2.25} aria-hidden="true" />
        </button>
        <h1 ref={headRef} tabIndex={-1} className="streak__title">
          Your reading year
        </h1>
        <div className="streak__years">
          {years.length > 1 && (
            <button
              type="button"
              className="streak__step"
              aria-label={prev ? `Show ${prev}` : 'No earlier year'}
              aria-disabled={!prev}
              onClick={() => prev && setYear(prev)}
            >
              <ChevronLeft size={22} strokeWidth={2.25} aria-hidden="true" />
            </button>
          )}
          <span className="streak__year" aria-live="polite">
            {year}
          </span>
          {years.length > 1 && (
            <button
              type="button"
              className="streak__step"
              aria-label={next ? `Show ${next}` : 'No later year'}
              aria-disabled={!next}
              onClick={() => next && setYear(next)}
            >
              <ChevronRight size={22} strokeWidth={2.25} aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      <section className="streak__band on-paper" aria-labelledby={`${ids}-streak`}>
        {streak.count > 0 ? (
          // The rolling digits sit in an inline-block, which would otherwise be read as "38 -day streak".
          <h2 id={`${ids}-streak`} className="streak__count" aria-label={`${streak.count}-day streak`}>
            <RollingNumber text={String(streak.count)} />
            -day streak
          </h2>
        ) : (
          <h2 id={`${ids}-streak`} className="streak__first">
            {streak.longest > 0 ? 'Read today to start a new streak.' : 'Your year starts with your first reading session.'}
          </h2>
        )}
        {streak.status === 'ember' && (
          <p className="streak__ember">You missed a day. Read today to keep your {streak.count}-day streak going.</p>
        )}
        {facts && (
          <p className="streak__facts">
            {facts.filter(Boolean).map((f, i) => (
              <span key={i}>
                {i > 0 && '\u00a0· '}
                <span className="streak__fact">{f}</span>
              </span>
            ))}
          </p>
        )}
      </section>

      <YearShelves days={days} books={books} today={today} selected={selected} onSelect={select} dropped={dropped} />

      <DayCard ref={cardRef} total={total} books={books} provisional={provisional} onAdd={() => setAdding(true)} />

      <PastSession
        open={adding}
        onClose={() => setAdding(false)}
        day={total.day}
        genre={ink}
        dayBookId={total.books[0]?.shelfItemId}
        onAdded={() => {
          setAdding(false)
          setDropped({ day: total.day, at: Date.now() })
        }}
      />
    </div>
  )
}
