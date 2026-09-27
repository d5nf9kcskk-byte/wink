import { useId } from 'react'
import { ChevronRight } from 'lucide-react'
import { GENRES, genreVars } from '../lib/genres'
import type { StreakInfo, WeekSpine } from '../lib/progress'
import './WeekSpines.css'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const spokenDay = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

function describe(s: WeekSpine): string {
  switch (s.state) {
    case 'read':
      return `read${s.minutes > 0 ? ` ${plural(s.minutes, 'minute')}` : ''}${s.genre ? `, ${GENRES[s.genre].label}` : ''}`
    case 'repaired':
      return 'kept by a free repair'
    case 'grace':
      return 'forgiven, streak kept'
    case 'missed':
      return 'no reading'
    case 'pending':
      return 'today, not read yet'
    case 'future':
      return 'still to come'
    case 'before':
      return 'before you started'
  }
}

function tokenLine({ count, tokens, nextTokenIn }: StreakInfo): string {
  if (tokens > 0) return `${plural(tokens, 'free repair')} saved. Each one covers a day you miss.`
  if (count > 0) return `You earn a free repair after ${plural(nextTokenIn, 'more reading day')}.`
  return 'Read any amount today to start one.'
}

type WeekSpinesProps = {
  spines: WeekSpine[]
  streak: StreakInfo
  /** Day (YYYY-MM-DD) whose spine waits below the shelf until the stop chain reaches it. */
  held: string | null
  /** Opens the streak page; without it the heading is plain text. */
  onOpen?: () => void
}

export function WeekSpines({ spines, streak, held, onOpen }: WeekSpinesProps) {
  const id = useId()
  const heading = streak.count > 0 ? `${streak.count}-day streak` : 'No streak yet'
  return (
    <section className="week-spines" aria-labelledby={id}>
      <h2 id={id} className="week-spines__streak">
        {onOpen ? (
          <button type="button" className="week-spines__open" onClick={onOpen}>
            <span>{heading}</span>
            <span className="week-spines__more">
              <span className="visually-hidden">, see </span>Your year
              <ChevronRight size={20} aria-hidden="true" />
            </span>
          </button>
        ) : (
          heading
        )}
      </h2>
      {streak.status === 'ember' && (
        <p className="week-spines__ember">
          You missed a day. Read today to keep your {streak.count}-day streak going.
        </p>
      )}
      <p className="week-spines__note">{tokenLine(streak)}</p>
      <ol className="week-spines__shelf" aria-label="This week">
        {spines.map((s) => (
          <li key={s.day}>
            <span className="visually-hidden">
              {spokenDay(s.day)}: {describe(s)}
            </span>
            <span
              aria-hidden="true"
              className={`week-spines__spine week-spines__spine--${s.state}${s.day === held ? ' week-spines__spine--held' : ''}`}
              style={
                s.state === 'read'
                  ? genreVars(s.genre ?? 'unclassified')
                  : s.state === 'repaired'
                    ? genreVars('unclassified')
                    : undefined
              }
            >
              {s.state === 'repaired' && <span className="week-spines__word">Reprint</span>}
              {/* The date is the catalogue number of a day that counted. */}
              {(s.state === 'read' || s.state === 'repaired' || s.state === 'grace') && (
                <span className="week-spines__no">{Number(s.day.slice(8))}</span>
              )}
              {s.state === 'pending' ? (
                <span className="week-spines__word">Today</span>
              ) : (
                <span className="week-spines__letter">{s.label}</span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
