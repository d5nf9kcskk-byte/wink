import { describe, expect, it } from 'vitest'
import {
  dayTotals,
  genreFromSubjects,
  levelFor,
  localDay,
  sessionMinutes,
  sessionsLeft,
  streakInfo,
  todayProgress,
  weekSpines,
} from './progress'
import type { GenreId, ReadingSession, ShelfItem } from './types'

// Saturday 26 Sep 2026, 3pm in America/Chicago (vite.config.ts pins TZ for tests).
const NOW = new Date(2026, 8, 26, 15)

let seq = 0
function session(start: Date, minutes: number | null, pages = 0, shelfItemId = 'b1'): ReadingSession {
  return {
    id: `s${++seq}`,
    profileId: 'p1',
    shelfItemId,
    startedAt: start.toISOString(),
    endedAt: minutes === null ? null : new Date(start.getTime() + minutes * 60_000).toISOString(),
    startPosition: 100,
    endPosition: minutes === null ? null : 100 + pages,
    checkInsEnabled: true,
    updatedAt: start.toISOString(),
  }
}

function book(id: string, over: Partial<ShelfItem> = {}): ShelfItem {
  return {
    id,
    profileId: 'p1',
    olWorkKey: null,
    title: id,
    authors: [],
    coverId: null,
    genre: 'fiction',
    format: 'physical',
    length: 300,
    position: 0,
    status: 'reading',
    rating: null,
    startedAt: '2026-01-01T12:00:00Z',
    finishedAt: null,
    lastReadAt: null,
    updatedAt: '2026-01-01T12:00:00Z',
    ...over,
  }
}

/** A local time `offset` days from NOW's day. */
const day = (offset: number, hour = 20) => new Date(2026, 8, 26 + offset, hour)
const key = (offset: number) => localDay(day(offset))
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)
const readOn = (offsets: number[]) => offsets.map((o) => session(day(o), 30))
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000)

describe('localDay', () => {
  it('uses the device time zone, not UTC', () => {
    expect(localDay('2026-09-27T03:30:00Z')).toBe('2026-09-26')
    expect(localDay('2026-09-27T05:30:00Z')).toBe('2026-09-27')
    expect(localDay(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05')
  })

  it('handles the hours around a DST change', () => {
    expect(localDay(new Date(2026, 2, 8, 1, 59))).toBe('2026-03-08')
    expect(localDay(new Date(2026, 2, 8, 3, 0))).toBe('2026-03-08')
    expect(localDay(new Date(2026, 10, 1, 23, 59))).toBe('2026-11-01')
  })
})

describe('sessionMinutes', () => {
  it('floors closed sessions to whole minutes', () => {
    const s = session(day(-1), 30)
    s.endedAt = new Date(Date.parse(s.endedAt!) + 59_000).toISOString()
    expect(sessionMinutes(s, NOW)).toBe(30)
  })

  it('counts an open session up to now', () => {
    expect(sessionMinutes(session(new Date(NOW.getTime() - 45.5 * 60_000), null), NOW)).toBe(45)
  })

  it('is never negative', () => {
    expect(sessionMinutes(session(day(-1), -10), NOW)).toBe(0)
    expect(sessionMinutes(session(new Date(NOW.getTime() + 60_000), null), NOW)).toBe(0)
  })
})

describe('todayProgress', () => {
  it('minutes: sums today, including the open session', () => {
    const sessions = [session(day(-1), 30), session(day(0, 9), 20), session(minutesAgo(10), null)]
    expect(todayProgress(sessions, { unit: 'minutes', amount: 30 }, NOW)).toEqual({
      done: 30,
      goal: 30,
      unit: 'minutes',
      met: true,
    })
  })

  it("pages: sums position gain of today's closed sessions (every session counts when books are omitted)", () => {
    const sessions = [
      session(day(-1), 30, 40),
      session(day(0, 8), 20, 12),
      session(day(0, 10), 15, 8),
      session(day(0, 11), 5, -5),
      session(minutesAgo(10), null),
    ]
    expect(todayProgress(sessions, { unit: 'pages', amount: 25 }, NOW)).toEqual({
      done: 20,
      goal: 25,
      unit: 'pages',
      met: false,
    })
  })

  it('pages: leaves out audiobook sessions, whose positions are minutes', () => {
    const books = [book('b1'), book('a1', { format: 'audiobook' })]
    const sessions = [session(day(0, 8), 20, 12, 'b1'), session(day(0, 10), 45, 45, 'a1')]
    expect(todayProgress(sessions, { unit: 'pages', amount: 25 }, NOW, books).done).toBe(12)
    expect(todayProgress(sessions, { unit: 'pages', amount: 25 }, NOW).done).toBe(57)
  })

  it('minutes: still counts audiobook listening', () => {
    const books = [book('b1'), book('a1', { format: 'audiobook' })]
    const sessions = [session(day(0, 8), 20, 12, 'b1'), session(day(0, 10), 45, 45, 'a1')]
    expect(todayProgress(sessions, { unit: 'minutes', amount: 60 }, NOW, books)).toMatchObject({ done: 65, met: true })
  })
})

describe('streakInfo', () => {
  it('starts empty', () => {
    expect(streakInfo([], NOW)).toEqual({ count: 0, tokens: 0, nextTokenIn: 5, status: 'none', days: {}, longest: 0 })
  })

  it('remembers the longest run across a broken one and the current one', () => {
    // 10 days earns 2 tokens; a 5-day gap needs 4, so the run breaks.
    expect(streakInfo(readOn([...range(-20, -11), ...range(-5, -1)]), NOW)).toMatchObject({ count: 5, longest: 10 })
    expect(streakInfo(readOn([...range(-20, -18), ...range(-12, -1)]), NOW)).toMatchObject({ count: 12, longest: 12 })
    // A run that has just lapsed still counts toward longest.
    expect(streakInfo(readOn(range(-6, -4)), NOW)).toMatchObject({ count: 0, longest: 3 })
  })

  it('counts a clean 12-day run and earns a token every 5 reading days', () => {
    const s = streakInfo(readOn(range(-12, -1)), NOW)
    expect(s).toMatchObject({ count: 12, tokens: 2, nextTokenIn: 3, status: 'alive' })
    expect(Object.keys(s.days)).toHaveLength(12)
    expect(Object.values(s.days).every((d) => d === 'read')).toBe(true)
  })

  it('counts today once a session is saved', () => {
    const s = streakInfo([...readOn(range(-11, -1)), session(day(0, 9), 30)], NOW)
    expect(s).toMatchObject({ count: 12, status: 'alive' })
    expect(s.days[key(0)]).toBe('read')
  })

  it('forgives a single missed day as grace without spending a token', () => {
    const s = streakInfo(readOn([...range(-8, -3), -1]), NOW)
    expect(s).toMatchObject({ count: 7, tokens: 1, status: 'alive' })
    expect(s.days[key(-2)]).toBe('grace')
  })

  it('repairs a 3-day absence with 2 tokens: two repaired, the last grace', () => {
    const s = streakInfo(readOn([...range(-14, -5), -1]), NOW)
    expect(s).toMatchObject({ count: 11, tokens: 0, nextTokenIn: 4, status: 'alive' })
    expect([key(-4), key(-3), key(-2)].map((d) => s.days[d])).toEqual(['repaired', 'repaired', 'grace'])
  })

  it('starts a new run after a 3-day absence with only 1 token', () => {
    const s = streakInfo(readOn([...range(-9, -5), -1]), NOW)
    expect(s).toMatchObject({ count: 1, tokens: 1, status: 'alive' })
    expect([key(-4), key(-3), key(-2)].map((d) => s.days[d])).toEqual([undefined, undefined, undefined])
    expect(s.days[key(-9)]).toBe('read')
  })

  it('is an ember when yesterday was missed and reading today keeps it', () => {
    const s = streakInfo(readOn(range(-5, -2)), NOW)
    expect(s).toMatchObject({ count: 4, tokens: 0, status: 'ember' })
    expect(s.days[key(-1)]).toBe('grace')
  })

  it('ember reports tokens after the tentative repair; reading today settles it', () => {
    const history = readOn(range(-12, -3))
    const ember = streakInfo(history, NOW)
    expect(ember).toMatchObject({ count: 10, tokens: 1, status: 'ember' })
    expect([ember.days[key(-2)], ember.days[key(-1)]]).toEqual(['repaired', 'grace'])

    const settled = streakInfo([...history, session(day(0, 9), 30)], NOW)
    expect(settled).toMatchObject({ count: 11, tokens: 1, status: 'alive' })
    expect([settled.days[key(-2)], settled.days[key(-1)]]).toEqual(['repaired', 'grace'])
  })

  it('has no streak today when the gap cannot be covered', () => {
    const s = streakInfo(readOn(range(-6, -4)), NOW)
    expect(s).toMatchObject({ count: 0, tokens: 0, status: 'none' })
    expect(s.days[key(-1)]).toBeUndefined()
  })

  it('banks at most 3 tokens', () => {
    expect(streakInfo(readOn(range(-20, -1)), NOW)).toMatchObject({ count: 20, tokens: 3, nextTokenIn: 5 })
  })

  it('only counts closed sessions with a minute read or a page turned', () => {
    expect(streakInfo([session(day(-1), 0), session(day(-1), null)], NOW).status).toBe('none')
    expect(streakInfo([session(day(-1), 0, 3)], NOW).count).toBe(1)
    expect(streakInfo([session(minutesAgo(20), null)], NOW).status).toBe('none')
  })

  it('walks calendar days across DST changes', () => {
    const march = range(1, 11).map((d) => session(new Date(2026, 2, d, 23, 30), 20))
    const spring = streakInfo(march, new Date(2026, 2, 12, 12))
    expect(spring).toMatchObject({ count: 11, status: 'alive' })
    expect(Object.keys(spring.days).sort()).toEqual(range(1, 11).map((d) => `2026-03-${String(d).padStart(2, '0')}`))

    const fall = [28, 29, 30, 31, 32, 33].map((d) => session(new Date(2026, 9, d, 0, 30), 20))
    const autumn = streakInfo(fall, new Date(2026, 10, 3, 12))
    expect(autumn).toMatchObject({ count: 6, status: 'alive' })
    expect(Object.keys(autumn.days).sort()).toEqual([
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ])

    const skippedDstDay = [6, 7, 9].map((d) => session(new Date(2026, 2, d, 21), 20))
    const s = streakInfo(skippedDstDay, new Date(2026, 2, 9, 22))
    expect(s).toMatchObject({ count: 3, status: 'alive' })
    expect(s.days['2026-03-08']).toBe('grace')
  })
})

describe('weekSpines', () => {
  const books = [book('b1', { genre: 'mystery' }), book('b2', { genre: 'fantasy' })]

  it('lays out Monday to Sunday with streak states, top genre and minutes', () => {
    const sessions = [
      session(day(-5, 8), 30, 10, 'b1'),
      session(day(-5, 20), 45, 10, 'b2'),
      session(day(-4), null, 0, 'b1'), // left open on a past day: ignored
      session(day(-2), 20, 10, 'b1'),
      session(minutesAgo(15), null, 0, 'b2'),
    ]
    const spines = weekSpines(sessions, books, streakInfo(sessions, NOW), NOW)
    expect(spines.map((s) => s.label).join('')).toBe('MTWTFSS')
    expect(spines.map((s) => s.day)).toEqual(range(21, 27).map((d) => `2026-09-${d}`))
    expect(spines.map((s) => s.state)).toEqual(['read', 'missed', 'missed', 'read', 'grace', 'pending', 'future'])
    expect(spines.map((s) => s.genre)).toEqual<(GenreId | null)[]>(['fantasy', null, null, 'mystery', null, 'fantasy', null])
    expect(spines.map((s) => s.minutes)).toEqual([75, 0, 0, 20, 0, 15, 0])
  })

  it('marks today read once a session is saved', () => {
    const sessions = [session(day(0, 9), 25, 5, 'b1'), session(minutesAgo(15), null, 0, 'b2')]
    const today = weekSpines(sessions, books, streakInfo(sessions, NOW), NOW)[5]
    expect(today).toMatchObject({ day: '2026-09-26', state: 'read', genre: 'mystery', minutes: 40 })
  })

  it('treats Sunday as the last day of the week', () => {
    const sunday = new Date(2026, 8, 27, 10)
    const spines = weekSpines([], books, streakInfo([], sunday), sunday)
    expect(spines[0].day).toBe('2026-09-21')
    expect(spines[6]).toMatchObject({ day: '2026-09-27', label: 'S', state: 'pending' })
    expect(spines.some((s) => s.state === 'future')).toBe(false)
  })
})

describe('dayTotals', () => {
  const books = [
    book('b1', { genre: 'mystery' }),
    book('e1', { genre: 'romance', format: 'ebook' }),
    book('a1', { genre: 'fantasy', format: 'audiobook' }),
  ]
  const totals = (sessions: ReadingSession[], from: string, to: string, now = NOW) =>
    dayTotals(sessions, books, streakInfo(sessions, now), from, to, now)

  it('orders books by minutes and counts pages only from print and ebook', () => {
    const sessions = [
      session(day(-1, 8), 30, 10, 'b1'),
      session(day(-1, 12), 45, 45, 'a1'),
      session(day(-1, 18), 10, 5, 'b1'),
      session(day(-1, 21), 5, 8, 'e1'),
    ]
    const [t] = totals(sessions, key(-1), key(-1))
    expect(t).toEqual({
      day: key(-1),
      state: 'read',
      minutes: 90,
      pages: 23,
      genre: 'fantasy',
      books: [
        { shelfItemId: 'a1', minutes: 45, pages: 0, sessions: 1 },
        { shelfItemId: 'b1', minutes: 40, pages: 15, sessions: 2 },
        { shelfItemId: 'e1', minutes: 5, pages: 8, sessions: 1 },
      ],
    })
  })

  it('counts an open session toward today only, and leaves future days empty', () => {
    const sessions = [session(day(-1), null, 0, 'b1'), session(minutesAgo(15), null, 0, 'e1')]
    const [yesterday, today, tomorrow] = totals(sessions, key(-1), key(1))
    expect(yesterday).toMatchObject({ state: 'before', minutes: 0, genre: null, books: [] })
    expect(today).toEqual({
      day: key(0),
      state: 'pending',
      minutes: 15,
      pages: 0,
      genre: 'romance',
      books: [{ shelfItemId: 'e1', minutes: 15, pages: 0, sessions: 1 }],
    })
    expect(tomorrow).toEqual({ day: key(1), state: 'future', minutes: 0, pages: 0, genre: null, books: [] })
  })

  it('carries repaired, grace and missed days from the streak, and marks days before the first session', () => {
    const t = totals(readOn([...range(-14, -5), -1]), key(-15), key(1))
    expect(t.map((d) => d.state)).toEqual([
      'before',
      ...range(-14, -5).map(() => 'read'),
      'repaired',
      'repaired',
      'grace',
      'read',
      'pending',
      'future',
    ])
    expect(t.map((d) => d.day)).toEqual(range(-15, 1).map(key))
  })

  it('calls a gap after the first session missed, not before', () => {
    const t = totals(readOn([-6, -3]), key(-7), key(-2))
    expect(t.map((d) => d.state)).toEqual(['before', 'read', 'missed', 'missed', 'read', 'missed'])
  })

  it('steps one calendar day at a time across DST changes', () => {
    const fallNow = new Date(2026, 10, 3, 12)
    const fall = [session(new Date(2026, 10, 1, 0, 30), 20), session(new Date(2026, 10, 1, 23, 30), 20)]
    const autumn = totals(fall, '2026-10-30', '2026-11-03', fallNow)
    expect(autumn.map((d) => d.day)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03'])
    expect(autumn.map((d) => d.minutes)).toEqual([0, 0, 40, 0, 0])

    const spring = totals([session(new Date(2026, 2, 8, 23, 30), 20)], '2026-03-07', '2026-03-09', new Date(2026, 2, 9, 12))
    expect(spring.map((d) => [d.day, d.minutes])).toEqual([
      ['2026-03-07', 0],
      ['2026-03-08', 20],
      ['2026-03-09', 0],
    ])
  })

  it('covers all 366 days of a leap year with thousands of sessions', () => {
    const yearEnd = new Date(2028, 11, 31, 23)
    const sessions = range(0, 365).flatMap((d) => range(0, 9).map((h) => session(new Date(2028, 0, 1 + d, 8 + h), 3, 2)))
    const t = totals(sessions, '2028-01-01', '2028-12-31', yearEnd)
    expect(t).toHaveLength(366)
    expect(t[59].day).toBe('2028-02-29')
    expect(t.at(-1)!.day).toBe('2028-12-31')
    expect(new Set(t.map((d) => d.day)).size).toBe(366)
    expect(t.every((d) => d.state === 'read' && d.minutes === 30 && d.pages === 20)).toBe(true)
  })
})

describe('levelFor', () => {
  const at = (minutes: number) => levelFor([session(day(-1), minutes)], [], NOW)

  it('starts at level 1', () => {
    expect(levelFor([], [], NOW)).toEqual({ level: 1, xp: 0, xpIntoLevel: 0, xpForNext: 100 })
  })

  it('levels at 50·n·(n−1) xp', () => {
    expect(at(99)).toEqual({ level: 1, xp: 99, xpIntoLevel: 99, xpForNext: 100 })
    expect(at(100)).toEqual({ level: 2, xp: 100, xpIntoLevel: 0, xpForNext: 200 })
    expect(at(299)).toEqual({ level: 2, xp: 299, xpIntoLevel: 199, xpForNext: 200 })
    expect(at(300)).toEqual({ level: 3, xp: 300, xpIntoLevel: 0, xpForNext: 300 })
    expect(at(4500).level).toBe(10)
  })

  it('adds a finish bonus by length and ignores open sessions', () => {
    const books = [
      book('p', { status: 'finished', format: 'physical', length: 384 }), // 39
      book('a', { status: 'finished', format: 'audiobook', length: 600 }), // 40
      book('e', { status: 'finished', format: 'ebook', length: 95 }), // 10
      book('r', { status: 'reading', length: 500 }),
    ]
    const sessions = [session(day(-1), 11), session(minutesAgo(90), null)]
    expect(levelFor(sessions, books, NOW)).toEqual({ level: 2, xp: 100, xpIntoLevel: 0, xpForNext: 200 })
  })
})

describe('sessionsLeft', () => {
  const books = [book('b1'), book('b2'), book('a1', { format: 'audiobook', length: 600 })]
  const history = [
    session(day(-3), 30, 20, 'b1'),
    session(day(-2), 30, 30, 'b2'),
    session(day(-2), 60, 120, 'a1'),
    session(day(-1), 5, 0, 'b1'),
    session(minutesAgo(10), null, 0, 'b1'),
  ]

  it("uses this reader's mean gain in the same format", () => {
    expect(sessionsLeft(book('x', { position: 100 }), history, books)).toBe(8)
    expect(sessionsLeft(book('x', { position: 290 }), history, books)).toBe(1)
  })

  it('needs at least two sessions of history in that format', () => {
    expect(sessionsLeft(book('x'), history.slice(0, 1), books)).toBeNull()
    expect(sessionsLeft(book('y', { format: 'audiobook', length: 600 }), history, books)).toBeNull()
  })

  it('is 0 when nothing is left', () => {
    expect(sessionsLeft(book('x', { position: 300 }), history, books)).toBe(0)
  })
})

describe('genreFromSubjects', () => {
  it.each<[string[], GenreId]>([
    [['Juvenile fiction', 'Mystery and detective stories'], 'young'],
    [['Young adult fiction'], 'young'],
    [['Fiction', 'Detective and mystery stories'], 'mystery'],
    [['Horror tales'], 'thriller'],
    [['Love stories', 'Fiction'], 'romance'],
    [['Fiction', 'Science fiction'], 'fantasy'],
    [['Dragons'], 'fantasy'],
    [['Autobiography'], 'biography'],
    [['Biographies'], 'biography'],
    [['World history'], 'nonfiction'],
    [['Non-fiction'], 'nonfiction'],
    [['Historical fiction'], 'fiction'],
    [['American literature'], 'fiction'],
    [['FANTASY'], 'fantasy'],
    [['Thrillers'], 'thriller'],
    [['Dystopian fiction'], 'fantasy'],
    // Whole words only: "crime" is not in "Crimean", "romance" here means the languages.
    [['Crimean War, 1853-1856', 'History'], 'nonfiction'],
    [['Crimean War, 1853-1856'], 'unclassified'],
    [['Romance languages', 'Grammar'], 'unclassified'],
    [['Romance philology'], 'unclassified'],
    [['Romances', 'Fiction'], 'romance'],
    [['Fiction, romance, general'], 'romance'],
    [['Nonfiction'], 'nonfiction'],
    [['True crime', 'Murder'], 'nonfiction'],
    [['True Crime', 'Crime', 'Detective and mystery stories'], 'nonfiction'],
    [['Crime fiction'], 'mystery'],
    [['Magical realism', 'Fantasy fiction'], 'fiction'],
    [['Magic realism (Literature)', 'Magic'], 'fiction'],
    [['Magic', 'Wizards'], 'fantasy'],
    [['Historical fiction', 'World War, 1939-1945 -- History'], 'fiction'],
    [['History', 'Historical fiction'], 'fiction'],
    [['Cooking'], 'unclassified'],
    [[], 'unclassified'],
  ])('%j → %s', (subjects, genre) => {
    expect(genreFromSubjects(subjects)).toBe(genre)
  })
})
