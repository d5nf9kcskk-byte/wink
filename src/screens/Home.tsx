import { useEffect, useRef, useState, type RefObject } from 'react'
import { Cover } from '../components/Cover'
import { GoalBand } from '../components/GoalBand'
import { ReaderNumber } from '../components/ReaderNumber'
import { SpineStrip } from '../components/SpineStrip'
import { WeekSpines } from '../components/WeekSpines'
import { useWink } from '../data/store'
import { useMotionPref } from '../lib/motion'
import { levelFor, localDay, streakInfo, todayProgress, weekSpines } from '../lib/progress'
import { useRoute } from '../lib/route'
import { AddBookSheet } from './AddBook'
import './Home.css'

const JUST_STOPPED = 'wink.justStopped'
const STEP_MS = 350

function readJustStopped(): string | null {
  try {
    return sessionStorage.getItem(JUST_STOPPED)
  } catch {
    return null
  }
}

function clearJustStopped() {
  try {
    sessionStorage.removeItem(JUST_STOPPED)
  } catch {
    /* storage blocked: nothing to clear */
  }
}

function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(t)
  }, [])
  return now
}

/** Scrolls el fully into view; resolves once a smooth scroll has settled. */
function reveal(el: HTMLElement | null, smooth: boolean): Promise<void> {
  if (!el) return Promise.resolve()
  const { top, bottom } = el.getBoundingClientRect()
  if (top >= 0 && bottom + parseFloat(getComputedStyle(el).scrollMarginBottom) <= innerHeight) return Promise.resolve()
  el.scrollIntoView({ block: 'nearest', behavior: smooth ? 'smooth' : 'instant' })
  if (!smooth) return Promise.resolve()
  return new Promise((done) => {
    // Safari before 26 has no scrollend; the timeout stands in.
    const t = setTimeout(done, 700)
    addEventListener(
      'scrollend',
      () => {
        clearTimeout(t)
        done()
      },
      { once: true },
    )
  })
}

/**
 * Stop chain: stage 0 shows the values from before the saved session; 1 cover, 2 goal, 3 week, 4 reading level (settled).
 * After step 1 the reading level line (and the goal and week spines above it) scrolls into view, so steps 2 to 4 are seen.
 */
function useStopChain(active: boolean, target: RefObject<HTMLElement | null>): number {
  const pref = useMotionPref()
  const [stage, setStage] = useState(0)
  useEffect(() => {
    if (!active || stage >= 4) return
    let live = true
    const full = pref === 'full'
    // Timeouts, not the effect body: the shell scrolls to the top after Home mounts.
    const t = setTimeout(
      async () => {
        if (!full || stage === 1) await reveal(target.current, full)
        if (live) setStage(full ? stage + 1 : 4)
      },
      full ? STEP_MS : 60,
    )
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [active, stage, pref, target])
  return active && pref !== 'off' ? stage : 4
}

export function Home() {
  const { ready, activeProfile, books, sessions, heroBook, setHeroBook } = useWink()
  const now = useNow()
  const [stoppedId] = useState(readJustStopped)
  useEffect(clearJustStopped, [])
  const stopped = stoppedId ? sessions.find((s) => s.id === stoppedId && s.endedAt !== null) : undefined
  const readerRef = useRef<HTMLDivElement>(null)
  const stage = useStopChain(stopped !== undefined, readerRef)
  const [adding, setAdding] = useState(false)
  const [, go] = useRoute()

  if (!ready || !activeProfile) {
    return (
      <div className="home" aria-busy="true">
        <p className="visually-hidden" role="status">
          Loading your books
        </p>
        <div className="home__skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    )
  }

  const { goal } = activeProfile
  const kid = activeProfile.ageBand === 'child'
  const reading = books.filter((b) => b.status === 'reading')
  const shelf = reading.length >= 2
  const streak = streakInfo(sessions, now)
  const level = levelFor(sessions, books, now)
  const today = todayProgress(sessions, goal, now, books)

  const without = stopped ? sessions.filter((s) => s !== stopped) : null
  const before = stage < 4 ? without : null
  const done = before && stage < 2 ? todayProgress(before, goal, now, books).done : today.done
  const shownLevel = before ? levelFor(before, books, now) : level
  const priorLevel = without ? levelFor(without, books, now).level : level.level
  const genre = heroBook?.genre ?? 'unclassified'
  const coverProgress =
    stopped && stage < 1 && heroBook?.id === stopped.shelfItemId && heroBook.length > 0
      ? stopped.startPosition / heroBook.length
      : undefined
  const openAdd = () => setAdding(true)

  return (
    <div className={`home${shelf ? ' home--shelf' : ''}`}>
      {shelf && <SpineStrip books={reading} heroId={heroBook?.id ?? null} onPick={setHeroBook} onAdd={openAdd} />}
      <Cover
        book={heroBook}
        level={shownLevel.level}
        progress={coverProgress}
        now={now}
        kid={kid}
        onAddBook={openAdd}
      />
      <GoalBand done={done} goal={goal} genre={genre} kid={kid} />
      <WeekSpines
        spines={weekSpines(sessions, books, streak, now)}
        streak={streak}
        held={stopped && stage < 3 ? localDay(stopped.startedAt) : null}
        onOpen={() => go('streak')}
      />
      <ReaderNumber
        ref={readerRef}
        level={shownLevel}
        genre={genre}
        from={stage === 4 && priorLevel < level.level ? priorLevel : null}
      />
      <AddBookSheet
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={(book) => {
          setHeroBook(book.id)
          setAdding(false)
        }}
      />
    </div>
  )
}
