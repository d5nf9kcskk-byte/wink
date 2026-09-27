import { useEffect, useId, useState, type Ref } from 'react'
import { ChevronRight } from 'lucide-react'
import { useWink } from '../data/store'
import { genreVars } from '../lib/genres'
import { dur, getMotionPref } from '../lib/motion'
import { sessionMinutes, type Level } from '../lib/progress'
import type { GenreId } from '../lib/types'
import { RollingNumber } from './RollingNumber'
import { Sheet } from './Sheet'
import './ReaderNumber.css'

const HOLD_MS = 1200

type Phase = 'idle' | 'in' | 'rolled' | 'out' | 'done'

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`

type ReaderNumberProps = {
  level: Level
  genre: GenreId
  /** The level before a stop chain that just raised it; plays the level-up band once. */
  from: number | null
  ref?: Ref<HTMLDivElement>
}

/** The reader's personal reading level. It must never read as a rank: no numbering, no comparison with anyone. */
export function ReaderNumber({ level, genre, from, ref }: ReaderNumberProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [explaining, setExplaining] = useState(false)
  const factId = useId()
  const left = Math.max(0, Math.ceil(level.xpForNext - level.xpIntoLevel))
  const fill = level.xpForNext > 0 ? Math.min(1, level.xpIntoLevel / level.xpForNext) : 0

  useEffect(() => {
    if (from === null) return
    // Matches --dur-3 at each Motion setting, so the CSS band and these steps stay in step.
    const wipe = dur(getMotionPref(), 0.56) * 1000
    const steps: [Phase, number][] = [['in', 0], ['rolled', wipe], ['out', 2 * wipe + HOLD_MS], ['done', 3 * wipe + HOLD_MS]]
    const timers = steps.map(([p, ms]) => setTimeout(() => setPhase(p), ms))
    return () => timers.forEach(clearTimeout)
  }, [from])

  const banded = phase === 'in' || phase === 'rolled' || phase === 'out'

  return (
    <div ref={ref} className="reader-number" style={genreVars(genre)}>
      <h2 className="reader-number__name">
        {/* Its ::after covers the whole line, so the rule and fact are part of the tap target. */}
        <button
          type="button"
          className="reader-number__open"
          aria-haspopup="dialog"
          aria-describedby={factId}
          onClick={() => setExplaining(true)}
        >
          <span>
            Reading level <RollingNumber text={String(level.level)} />
          </span>
          <span className="reader-number__more">
            <span className="visually-hidden">, </span>How it works
            <ChevronRight size={20} aria-hidden="true" />
          </span>
        </button>
      </h2>
      <span className="reader-number__rule" aria-hidden="true">
        {/* Keyed by level so a level-up starts the new rule fresh instead of draining the old one. */}
        <span key={level.level} className="reader-number__fill" style={{ transform: `scaleX(${fill})` }} />
      </span>
      <p id={factId} className="reader-number__fact">
        <RollingNumber text={String(left)} /> more {left === 1 ? 'minute' : 'minutes'} to level {level.level + 1}
      </p>
      {banded && (
        <span className={`reader-number__band${phase === 'out' ? ' reader-number__band--out' : ''}`} aria-hidden="true">
          <span>
            Reading level <RollingNumber text={String(phase === 'in' ? from : level.level)} />
          </span>
        </span>
      )}
      <p className="visually-hidden" role="status">
        {phase === 'idle' ? '' : `You reached level ${level.level}.`}
      </p>
      <LevelSheet open={explaining} onClose={() => setExplaining(false)} level={level} left={left} />
    </div>
  )
}

function LevelSheet({ open, onClose, level, left }: { open: boolean; onClose: () => void; level: Level; left: number }) {
  const { sessions, books } = useWink()
  // Same inputs levelFor counts: closed sessions only, so the numbers add up to the points shown.
  const minutes = sessions.reduce((t, s) => t + (s.endedAt ? sessionMinutes(s, new Date()) : 0), 0)
  const finished = books.filter((b) => b.status === 'finished').length

  return (
    <Sheet open={open} onClose={onClose} title="Your reading level">
      <div className="reader-number__sheet">
        <p className="reader-number__lead">Your level grows as you read.</p>
        <p>
          You earn 1 point for every minute you read. When you finish a book you get a bonus too: 1 point for every 10
          pages, or for every 15 minutes of an audiobook.
        </p>
        <p>Each level takes a little longer to reach than the one before.</p>
        <p>Your level is just for you. Nobody else sees it.</p>
        <div className="reader-number__facts">
          <p>
            {plural(minutes, 'minute')} read · {plural(finished, 'book')} finished
          </p>
          <p>
            {plural(level.xp, 'point')} so far · {left.toLocaleString()} more to level {level.level + 1}
          </p>
        </div>
      </div>
    </Sheet>
  )
}
