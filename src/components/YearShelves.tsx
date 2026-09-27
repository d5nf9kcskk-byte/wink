import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react'
import { genreVars } from '../lib/genres'
import { dur, useMotionPref } from '../lib/motion'
import { localDay, type DayTotal } from '../lib/progress'
import type { ShelfItem } from '../lib/types'
import './YearShelves.css'

const QUARTERS = ['January to March', 'April to June', 'July to September', 'October to December']
const INITIALS = 'JFMAMJJASOND'
const SPOKEN = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

type Cell = { t: DayTotal; name: string; style?: CSSProperties }
type Week = { monday: string; initial: string; cells: (Cell | null)[] }

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const dateOf = (day: string) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}
// Local calendar arithmetic, so DST days never skip or repeat.
const shift = (day: string, n: number) => {
  const d = dateOf(day)
  d.setDate(d.getDate() + n)
  return localDay(d)
}
const weekday = (day: string) => (dateOf(day).getDay() + 6) % 7

function spoken(t: DayTotal, today: string, titleOf: Map<string, string>): string {
  const date = SPOKEN.format(dateOf(t.day)) + (t.day === today ? ', today' : '')
  switch (t.state) {
    case 'read': {
      const titles = t.books.map((b) => titleOf.get(b.shelfItemId) ?? 'a book').join(', ')
      return `${date}: read${t.minutes > 0 ? ` ${plural(t.minutes, 'minute')}` : ''}, ${titles}`
    }
    case 'repaired':
      return `${date}: covered by a free repair`
    case 'grace':
      return `${date}: forgiven, streak kept`
    case 'missed':
      return `${date}: no reading`
    case 'pending':
      return `${date}: no reading yet`
    case 'future':
      return `${date}: still to come`
    case 'before':
      return `${date}: before you started`
  }
}

type YearShelvesProps = {
  /** Every day of one calendar year, from a single dayTotals call. */
  days: DayTotal[]
  books: ShelfItem[]
  today: string
  selected: string
  /** `pointer` is true for a tap or click, false for Enter or Space. */
  onSelect: (day: string, pointer: boolean) => void
  /** A day that just gained a session: its segment drops in. */
  dropped: { day: string; at: number } | null
}

/** The year as four quarter-shelves of Monday-first week spines, one segment per day, as a keyboard grid. */
export function YearShelves({ days, books, today, selected, onSelect, dropped }: YearShelvesProps) {
  const pref = useMotionPref()
  const gridRef = useRef<HTMLDivElement>(null)
  const [focusDay, setFocusDay] = useState(selected)
  const [said, setSaid] = useState('')
  const first = days[0].day
  const last = days[days.length - 1].day
  const tabDay = focusDay >= first && focusDay <= last ? focusDay : selected

  const { shelves, cols, byDay } = useMemo(() => {
    const titleOf = new Map(books.map((b) => [b.id, b.title]))
    const byDay = new Map<string, Cell>()
    for (const t of days) {
      const ink = t.state === 'read' ? t.genre ?? 'unclassified' : t.state === 'repaired' ? 'unclassified' : null
      byDay.set(t.day, { t, name: spoken(t, today, titleOf), style: ink ? genreVars(ink) : undefined })
    }
    const shelves: Week[][] = [[], [], [], []]
    let month = -1
    // Each week belongs to the quarter and month of its Monday; the week holding 1 January opens the year.
    for (let monday = shift(first, -weekday(first)); monday <= last; monday = shift(monday, 7)) {
      const m = monday < first ? 0 : Number(monday.slice(5, 7)) - 1
      const cells = Array.from({ length: 7 }, (_, i) => byDay.get(shift(monday, i)) ?? null)
      shelves[Math.floor(m / 3)].push({ monday, initial: m === month ? '' : INITIALS[m], cells })
      month = m
    }
    return { shelves, byDay, cols: Math.max(...shelves.map((s) => s.length)) }
  }, [days, books, today, first, last])

  // Below 360px the bookcase scrolls sideways; open each year from January unless that hides the selected week (8px keeps its ring).
  useEffect(() => {
    const g = gridRef.current
    const c = g?.querySelector('[aria-selected="true"]')
    if (g && c) g.scrollLeft += Math.max(0, c.getBoundingClientRect().right + 8 - g.getBoundingClientRect().right)
  }, [first])

  useEffect(() => {
    const ms = dur(pref, 0.56) * 1000
    const el = dropped && gridRef.current?.querySelector<HTMLElement>(`[data-day="${dropped.day}"]`)
    if (!el || !ms) return
    // A lone keyframe defaults to offset 1 (fade out); offset 0 makes it the start, settling into the segment's own lift.
    el.animate(pref === 'full' ? [{ transform: 'translateY(-16px)', opacity: 0, offset: 0 }] : [{ opacity: 0, offset: 0 }], {
      duration: ms,
      delay: ms / 2,
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      fill: 'backwards',
      pseudoElement: '::before',
    })
  }, [dropped, pref])

  function pick(day: string, pointer: boolean) {
    setFocusDay(day)
    setSaid(`Showing ${byDay.get(day)?.name ?? day}`)
    onSelect(day, pointer)
  }

  function onClick(e: MouseEvent<HTMLDivElement>) {
    const day = (e.target as HTMLElement).closest<HTMLElement>('[data-day]')?.dataset.day
    if (day) pick(day, true)
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const day = (e.target as HTMLElement).dataset.day
    if (!day) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      pick(day, false)
      return
    }
    const moves: Record<string, number> = {
      ArrowUp: -1,
      ArrowDown: 1,
      ArrowLeft: -7,
      ArrowRight: 7,
      Home: -weekday(day),
      End: 6 - weekday(day),
    }
    if (!(e.key in moves)) return
    e.preventDefault()
    const to = shift(day, moves[e.key])
    const next = to < first ? first : to > last ? last : to
    setFocusDay(next)
    gridRef.current?.querySelector<HTMLElement>(`[data-day="${next}"]`)?.focus()
  }

  return (
    <div className="ys">
      <div
        ref={gridRef}
        role="grid"
        aria-label={`Your ${first.slice(0, 4)} reading, one spine per week`}
        className="ys__grid"
        style={{ '--cols': cols } as CSSProperties}
        onClick={onClick}
        onKeyDown={onKeyDown}
        // A focused day counts as on screen even behind the tab bar; scroll-margin makes it clear the bar.
        onFocus={(e) => e.target.scrollIntoView({ block: 'nearest', inline: 'nearest' })}
      >
        {shelves.map((weeks, q) => (
          <div key={q} className="ys__shelf">
            <div role="rowgroup" aria-label={QUARTERS[q]} className="ys__spines">
              {weeks.map((w) => (
                <div key={w.monday} role="row" className="ys__spine">
                  {w.cells.map((c, i) =>
                    c ? (
                      <div
                        key={i}
                        role="gridcell"
                        data-day={c.t.day}
                        tabIndex={c.t.day === tabDay ? 0 : -1}
                        aria-selected={c.t.day === selected}
                        aria-label={c.name}
                        className={`ys__day ys__day--${c.t.state}${c.t.day === today ? ' ys__day--today' : ''}`}
                        style={c.style}
                      />
                    ) : (
                      <div key={i} role="gridcell" className="ys__day ys__day--absent" />
                    ),
                  )}
                </div>
              ))}
            </div>
            <div className="ys__months" aria-hidden="true">
              {weeks.map((w) => (
                <span key={w.monday}>{w.initial}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="visually-hidden" aria-live="polite">
        {said}
      </p>
    </div>
  )
}
