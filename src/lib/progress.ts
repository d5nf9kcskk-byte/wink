import type { GenreId, Profile, ReadingSession, ShelfItem } from './types'

export type DayState = 'read' | 'repaired' | 'grace' | 'missed' | 'pending' | 'future' | 'before'

export interface StreakInfo {
  /** Reading days in the current run. */
  count: number
  /** Free repairs banked (never sold). Earned 1 per 5 reading days, max 3. */
  tokens: number
  /** Reading days until the next token is earned. */
  nextTokenIn: number
  /** 'ember': a day was missed and reading today keeps the streak. */
  status: 'none' | 'alive' | 'ember'
  /** Local day (YYYY-MM-DD) → how that day counted toward the streak. */
  days: Record<string, 'read' | 'repaired' | 'grace'>
  /** Reading days in the longest run ever, the current one included. */
  longest: number
}

/** One day's reading, for the streak page. Books are ordered by minutes, longest first. */
export interface DayTotal {
  day: string // YYYY-MM-DD, local
  state: DayState
  minutes: number
  /** Page gain across print/ebook sessions that day (audiobook minutes never count as pages). */
  pages: number
  genre: GenreId | null // the day's longest-read book
  books: { shelfItemId: string; minutes: number; pages: number; sessions: number }[]
}

export interface WeekSpine {
  day: string // YYYY-MM-DD, local
  label: string // 'M', 'T', ...
  state: DayState
  genre: GenreId | null // genre of the book read longest that day
  minutes: number
}

export interface Level {
  level: number
  xp: number
  xpIntoLevel: number
  xpForNext: number // xp span of the current level
}

const TOKEN_EVERY = 5
const TOKEN_CAP = 3
const WEEK_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

const pad = (n: number) => String(n).padStart(2, '0')

/** Local calendar day for an ISO timestamp, in the device time zone. */
export function localDay(iso: string | Date): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Steps on local calendar fields, so 23- and 25-hour DST days never skip or repeat a day.
function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return localDay(new Date(y, m - 1, d + n))
}

/** Whole minutes read in a session; open sessions count up to `now`. */
export function sessionMinutes(s: ReadingSession, now: Date): number {
  const end = s.endedAt ? Date.parse(s.endedAt) : now.getTime()
  return Math.max(0, Math.floor((end - Date.parse(s.startedAt)) / 60_000))
}

const gain = (s: ReadingSession) => (s.endPosition ?? s.startPosition) - s.startPosition

const isReading = (s: ReadingSession, now: Date) =>
  s.endedAt !== null && (sessionMinutes(s, now) >= 1 || gain(s) > 0)

/** Today's progress toward the profile goal (minutes or pages), including an open session. Pass `books` so audiobooks stay out of a pages goal. */
export function todayProgress(
  sessions: ReadingSession[],
  goal: Profile['goal'],
  now: Date,
  books?: ShelfItem[],
): { done: number; goal: number; unit: Profile['goal']['unit']; met: boolean } {
  const today = localDay(now)
  const todays = sessions.filter((s) => localDay(s.startedAt) === today)
  // Audiobook positions are minutes, not pages.
  const audio = new Set(books?.filter((b) => b.format === 'audiobook').map((b) => b.id))
  const done =
    goal.unit === 'minutes'
      ? todays.reduce((t, s) => t + sessionMinutes(s, now), 0)
      : todays.reduce(
          (t, s) => t + (s.endedAt === null || audio.has(s.shelfItemId) ? 0 : Math.max(0, gain(s))),
          0,
        )
  return { done, goal: goal.amount, unit: goal.unit, met: done >= goal.amount }
}

export function streakInfo(sessions: ReadingSession[], now: Date): StreakInfo {
  const today = localDay(now)
  const read = new Set(sessions.filter((s) => isReading(s, now)).map((s) => localDay(s.startedAt)))
  const first = [...read].filter((d) => d <= today).sort()[0]
  const days: StreakInfo['days'] = {}
  let count = 0
  let longest = 0
  let tokens = 0
  let total = 0
  let gap: string[] = []

  // A run survives k missed days by spending k-1 tokens; the last missed day is always free.
  const bridge = () => {
    const cost = gap.length - 1
    const survives = count > 0 && tokens >= cost
    if (survives) {
      tokens -= Math.max(0, cost)
      gap.forEach((d, i) => (days[d] = i < cost ? 'repaired' : 'grace'))
    } else count = 0
    gap = []
    return survives
  }

  if (first) {
    for (let d = first; d <= today; d = addDays(d, 1)) {
      if (!read.has(d)) {
        if (d !== today) gap.push(d)
        continue
      }
      bridge()
      count++
      longest = Math.max(longest, count)
      total++
      days[d] = 'read'
      if (total % TOKEN_EVERY === 0 && tokens < TOKEN_CAP) tokens++
    }
  }

  let status: StreakInfo['status'] = 'alive'
  if (!read.has(today)) {
    const missed = gap.length > 0
    status = bridge() ? (missed ? 'ember' : 'alive') : 'none'
  }

  return { count, tokens, nextTokenIn: TOKEN_EVERY - (total % TOKEN_EVERY), status, days, longest }
}

/** The seven days of the current week (Monday first) as spines. */
export function weekSpines(sessions: ReadingSession[], books: ShelfItem[], streak: StreakInfo, now: Date): WeekSpine[] {
  const monday = addDays(localDay(now), -((now.getDay() + 6) % 7))
  return dayTotals(sessions, books, streak, monday, addDays(monday, 6), now).map(({ day, state, genre, minutes }, i) => ({
    day,
    label: WEEK_LABELS[i],
    state,
    genre,
    minutes,
  }))
}

/** Every day from `from` to `to` inclusive (YYYY-MM-DD, local), each with its reading totals. Open sessions count toward today only. */
export function dayTotals(
  sessions: ReadingSession[],
  books: ShelfItem[],
  streak: StreakInfo,
  from: string,
  to: string,
  now: Date,
): DayTotal[] {
  // Days before the reader's first session are 'before', not misses.
  const firstRead = Object.keys(streak.days).sort()[0]
  const today = localDay(now)
  const bookOf = new Map(books.map((b) => [b.id, b]))
  // One pass to bucket, so a year of days never rescans every session.
  const byDay = new Map<string, ReadingSession[]>()
  for (const s of sessions) {
    const d = localDay(s.startedAt)
    if (d < from || d > to || (s.endedAt === null && d !== today)) continue
    const bucket = byDay.get(d)
    if (bucket) bucket.push(s)
    else byDay.set(d, [s])
  }

  const out: DayTotal[] = []
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const daySessions = byDay.get(day) ?? []
    const perBook = new Map<string, DayTotal['books'][number]>()
    for (const s of daySessions) {
      const b = perBook.get(s.shelfItemId) ?? { shelfItemId: s.shelfItemId, minutes: 0, pages: 0, sessions: 0 }
      perBook.set(s.shelfItemId, b)
      b.minutes += sessionMinutes(s, now)
      // Audiobook positions are minutes, not pages.
      if (bookOf.get(s.shelfItemId)?.format !== 'audiobook') b.pages += Math.max(0, gain(s))
      b.sessions++
    }
    const list = [...perBook.values()].sort((a, b) => b.minutes - a.minutes)

    const state: DayState =
      day > today
        ? 'future'
        : day === today
          ? daySessions.some((s) => isReading(s, now))
            ? 'read'
            : 'pending'
          : (streak.days[day] ?? (firstRead === undefined || day < firstRead ? 'before' : 'missed'))

    out.push({
      day,
      state,
      minutes: list.reduce((t, b) => t + b.minutes, 0),
      pages: list.reduce((t, b) => t + b.pages, 0),
      genre: list[0] ? (bookOf.get(list[0].shelfItemId)?.genre ?? null) : null,
      books: list,
    })
  }
  return out
}

/** Depth-weighted: 1 XP per minute read, plus a finish bonus scaled by length. */
export function levelFor(sessions: ReadingSession[], books: ShelfItem[], now: Date): Level {
  const minutes = sessions.reduce((t, s) => t + (s.endedAt === null ? 0 : sessionMinutes(s, now)), 0)
  const bonus = books.reduce(
    (t, b) => t + (b.status === 'finished' ? Math.ceil(b.length / (b.format === 'audiobook' ? 15 : 10)) : 0),
    0,
  )
  const xp = minutes + bonus
  let level = 1
  while (50 * (level + 1) * level <= xp) level++
  return { level, xp, xpIntoLevel: xp - 50 * level * (level - 1), xpForNext: 100 * level }
}

/** "About N sessions left" from this reader's own average gain per session in the same format. null without history. */
export function sessionsLeft(book: ShelfItem, sessions: ReadingSession[], books: ShelfItem[]): number | null {
  const formatOf = new Map(books.map((b) => [b.id, b.format]))
  const gains = sessions
    .filter((s) => s.endedAt !== null && formatOf.get(s.shelfItemId) === book.format)
    .map(gain)
    .filter((g) => g > 0)
  if (gains.length < 2) return null
  const remaining = book.length - book.position
  if (remaining <= 0) return 0
  return Math.ceil((remaining * gains.length) / gains.reduce((t, g) => t + g, 0))
}

// First match wins, so specific phrases sit above the broader words they contain ("true crime" above "crime").
// Entries are regex fragments matched as whole words, with an optional plural "s".
const SUBJECT_RULES = (
  [
    ['young', ['juvenile', 'children', 'young adult', 'picture book']],
    ['nonfiction', ['true crime']],
    ['mystery', ['mystery', 'mysteries', 'detective', 'crime', 'police procedural']],
    ['thriller', ['thriller', 'suspense', 'horror', 'supernatural']],
    ['romance', ['romance(?! (?:language|philology))', 'love stories']],
    ['fiction', ['magical realism', 'magic realism']],
    ['fantasy', ['fantasy', 'science fiction', 'magic', 'dragon', 'dystopia', 'dystopian']],
    ['biography', ['biography', 'biographies', 'autobiography', 'autobiographies', 'memoir']],
    ['fiction', ['historical fiction']],
    [
      'nonfiction',
      ['history', 'science', 'philosophy', 'psychology', 'economics', 'self-help', 'politics', 'essays', 'nonfiction', 'non-fiction', 'business'],
    ],
    ['fiction', ['fiction', 'novel', 'literature', 'short stories']],
  ] satisfies [GenreId, string[]][]
).map(([genre, words]) => [genre, new RegExp(`\\b(?:${words.join('|')})s?\\b`, 'i')] as const)

/** Maps Open Library subject strings onto a Wink genre. */
export function genreFromSubjects(subjects: string[]): GenreId {
  const text = subjects.join('\n')
  return SUBJECT_RULES.find(([, re]) => re.test(text))?.[0] ?? 'unclassified'
}
