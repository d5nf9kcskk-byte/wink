import type { NewBook, Profile, ReadingSession, ShelfItem } from '../lib/types'
import { emptyCopy, newId, type DeviceCopy } from './local'

export function sampleRequested(): boolean {
  return /[?&]sample=1(?![^&#])/.test(location.search + location.hash)
}

/** Days with no reading: a two-day gap the streak repairs with tokens, and a single grace day. */
export const SAMPLE_MISSED = [24, 23, 9]

interface Plan {
  book: NewBook
  days: number[] // days ago, oldest first
  time: [hour: number, minute: number]
  minutes: number
  pace?: number // pages per sitting; audiobooks advance by minutes listened, finished books land on their last page
  rating?: number // finished books only
}

const span = (from: number, to: number) =>
  Array.from({ length: from - to + 1 }, (_, i) => from - i).filter((d) => !SAMPLE_MISSED.includes(d))

const PLANS: Plan[] = [
  {
    book: { olWorkKey: '/works/OL20734329W', title: 'Beach Read', authors: ['Emily Henry'], coverId: 9426296, genre: 'romance', format: 'ebook', length: 376 },
    days: span(40, 31),
    time: [21, 10],
    minutes: 36,
    rating: 4,
  },
  {
    book: { olWorkKey: '/works/OL25344431W', title: 'Lessons in Chemistry', authors: ['Bonnie Garmus'], coverId: 12725772, genre: 'fiction', format: 'physical', length: 464 },
    days: span(30, 13),
    time: [21, 30],
    minutes: 32,
    rating: 4.5,
  },
  {
    book: { olWorkKey: '/works/OL20878311W', title: 'The Thursday Murder Club', authors: ['Richard Osman'], coverId: 10201431, genre: 'mystery', format: 'ebook', length: 382 },
    days: [20, 18, 16, 13, 11, 8, 6, 3, 1],
    time: [12, 35],
    minutes: 18,
    pace: 14,
  },
  {
    book: { olWorkKey: '/works/OL22448002W', title: 'Crying in H Mart', authors: ['Michelle Zauner'], coverId: 10462708, genre: 'biography', format: 'audiobook', length: 573 },
    days: [8, 7, 5, 4, 2, 1],
    time: [8, 10],
    minutes: 33,
  },
  {
    book: { olWorkKey: '/works/OL8479867W', title: 'The Name of the Wind', authors: ['Patrick Rothfuss'], coverId: 11480483, genre: 'fantasy', format: 'physical', length: 736 },
    days: span(12, 0),
    time: [21, 15],
    minutes: 30,
    pace: 26,
  },
]

function dayAt(now: Date, daysAgo: number, hour: number, minute: number): Date {
  const d = new Date(now)
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hour, minute, 0, 0)
  return d
}

/** Demo reader "Jess": three books on the go, two finished, and ~40 days of sessions ending with one earlier today. */
export function sampleCopy(now: Date): DeviceCopy {
  const stamp = now.toISOString()
  const profile: Profile = {
    id: newId(),
    ownerUserId: null,
    displayName: 'Jess',
    ageBand: 'adult',
    parentProfileId: null,
    goal: { unit: 'minutes', amount: 20 },
    parentPinHash: null,
    createdAt: dayAt(now, 41, 20, 0).toISOString(),
    updatedAt: stamp,
  }
  const books: ShelfItem[] = []
  const sessions: ReadingSession[] = []

  for (const { book, days, time, minutes, pace, rating } of PLANS) {
    const id = newId()
    let position = 0
    let first = ''
    let last = ''
    days.forEach((daysAgo, i) => {
      let start = dayAt(now, daysAgo, time[0], time[1] + (daysAgo % 3) * 4)
      let end = new Date(start.getTime() + (minutes + ((daysAgo * 7) % 9)) * 60_000)
      if (daysAgo === 0) {
        start = new Date(Math.max(dayAt(now, 0, 0, 0).getTime(), now.getTime() - 40 * 60_000))
        end = new Date(Math.min(now.getTime(), start.getTime() + 14 * 60_000))
      }
      const listened = Math.round((end.getTime() - start.getTime()) / 60_000)
      const next =
        rating !== undefined
          ? Math.round((book.length * (i + 1)) / days.length)
          : Math.min(book.length, position + (book.format === 'audiobook' ? listened : (pace ?? 0)))
      sessions.push({
        id: newId(),
        profileId: profile.id,
        shelfItemId: id,
        startedAt: start.toISOString(),
        endedAt: end.toISOString(),
        startPosition: position,
        endPosition: next,
        checkInsEnabled: true,
        updatedAt: stamp,
      })
      position = next
      first ||= start.toISOString()
      last = end.toISOString()
    })
    books.push({
      ...book,
      id,
      profileId: profile.id,
      position,
      status: rating === undefined ? 'reading' : 'finished',
      rating: rating ?? null,
      startedAt: first,
      finishedAt: rating === undefined ? null : last,
      lastReadAt: last,
      updatedAt: stamp,
    })
  }

  return { ...emptyCopy(), profiles: [profile], books, sessions, activeProfileId: profile.id }
}
