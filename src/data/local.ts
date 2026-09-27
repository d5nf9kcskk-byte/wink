import { localDay } from '../lib/progress'
import type { Profile, ReadingSession, ShelfItem } from '../lib/types'
import type { WinkActions } from './api'

export type Table = 'profiles' | 'shelf_items' | 'sessions'
export type Row = Profile | ShelfItem | ReadingSession

export type OutboxEntry = { op: 'upsert'; table: Table; row: Row } | { op: 'delete'; table: Table; id: string }

export interface DeviceCopy {
  profiles: Profile[]
  books: ShelfItem[]
  sessions: ReadingSession[]
  outbox: OutboxEntry[]
  activeProfileId: string | null
  heroByProfile: Record<string, string>
  lastSyncedAt: string | null
  /** Per-table pull cursors on the server's clock, so late-arriving offline writes from other devices are never skipped. */
  cursors: Partial<Record<Table, string>>
}

export interface Change {
  profiles?: Profile[]
  books?: ShelfItem[]
  sessions?: ReadingSession[]
  deletedSessionId?: string
}

// ponytail: localStorage caps near 5MB (tens of thousands of sessions); move to IndexedDB when libraries get large.
export const keyFor = (scope: string) => `wink.v1.${scope}`

export function emptyCopy(): DeviceCopy {
  return {
    profiles: [],
    books: [],
    sessions: [],
    outbox: [],
    activeProfileId: null,
    heroByProfile: {},
    lastSyncedAt: null,
    cursors: {},
  }
}

export function loadCopy(scope: string): DeviceCopy {
  try {
    const raw = localStorage.getItem(keyFor(scope))
    return raw ? { ...emptyCopy(), ...(JSON.parse(raw) as Partial<DeviceCopy>) } : emptyCopy()
  } catch {
    return emptyCopy()
  }
}

export function saveCopy(scope: string, copy: DeviceCopy): boolean {
  try {
    localStorage.setItem(keyFor(scope), JSON.stringify(copy))
    return true
  } catch {
    return false
  }
}

const entryKey = (e: OutboxEntry) => `${e.table}:${e.op === 'upsert' ? e.row.id : e.id}`

/** Appends entries, dropping any older pending entry for the same row: only its latest state needs to reach the server. */
function enqueue(outbox: OutboxEntry[], entries: OutboxEntry[]): OutboxEntry[] {
  const keys = new Set(entries.map(entryKey))
  return [...outbox.filter((e) => !keys.has(entryKey(e))), ...entries]
}

function upsertById<T extends { id: string }>(list: T[], rows: T[] | undefined): T[] {
  if (!rows?.length) return list
  const byId = new Map(list.map((r) => [r.id, r]))
  for (const r of rows) byId.set(r.id, r)
  return [...byId.values()]
}

export function applyChange(copy: DeviceCopy, change: Change, queue: boolean): DeviceCopy {
  const gone = change.deletedSessionId
  const next: DeviceCopy = {
    ...copy,
    profiles: upsertById(copy.profiles, change.profiles),
    books: upsertById(copy.books, change.books),
    sessions: upsertById(copy.sessions, change.sessions).filter((s) => s.id !== gone),
  }
  if (!queue) return next
  const entries: OutboxEntry[] = [
    ...(change.profiles ?? []).map((row) => ({ op: 'upsert' as const, table: 'profiles' as const, row })),
    ...(change.books ?? []).map((row) => ({ op: 'upsert' as const, table: 'shelf_items' as const, row })),
    ...(change.sessions ?? []).map((row) => ({ op: 'upsert' as const, table: 'sessions' as const, row })),
    ...(gone ? [{ op: 'delete' as const, table: 'sessions' as const, id: gone }] : []),
  ]
  return { ...next, outbox: enqueue(copy.outbox, entries) }
}

/**
 * Moves a "this device only" copy into an empty account: profiles re-owned, every row restamped so it wins
 * last-write-wins, and all of it queued for upload.
 */
export function adoptCopy(local: DeviceCopy, account: DeviceCopy, userId: string, stamp: string): DeviceCopy {
  const restamp = <T extends Row>(rows: T[]) => rows.map((r) => ({ ...r, updatedAt: stamp }))
  const adopted = applyChange(
    account,
    {
      profiles: restamp(local.profiles).map((p) => ({ ...p, ownerUserId: userId })),
      books: restamp(local.books),
      sessions: restamp(local.sessions),
    },
    true,
  )
  return { ...adopted, activeProfileId: local.activeProfileId, heroByProfile: { ...local.heroByProfile } }
}

export type PastInput = Omit<Parameters<WinkActions['addPastSession']>[0], 'shelfItemId'>

/**
 * Reading logged after the fact: a closed session on `book`, plus the book moved forward when it got further
 * (`book` is null when the shelf row doesn't change). Throws readable errors. `open` is the reader's running session.
 */
export function pastSession(
  book: ShelfItem,
  input: PastInput,
  open: ReadingSession | null,
  now: Date,
): { session: ReadingSession; book: ShelfItem | null } {
  const { day, startTime, minutes, reachedPosition } = input
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Pick the day you read.')
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) throw new Error('Pick the time you started reading.')
  if (!(Number.isInteger(minutes) && minutes >= 1 && minutes <= 720)) throw new Error('Add how many minutes you read, from 1 to 720.')
  if (reachedPosition !== undefined && !Number.isFinite(reachedPosition))
    throw new Error(book.format === 'audiobook' ? 'Enter the minute you reached.' : 'Enter the page you reached.')

  const [y, m, d] = day.split('-').map(Number)
  const [hh, mm] = startTime.split(':').map(Number)
  const start = new Date(y, m - 1, d, hh, mm)
  // Rolls over on dates like 02-31; a time inside a DST jump just shifts forward, which is fine.
  if (localDay(start) !== day) throw new Error('Pick the day you read.')
  if (day > localDay(now)) throw new Error('Pick today or an earlier day.')
  const end = new Date(start.getTime() + minutes * 60_000)
  if (end > now) throw new Error("That time hasn't happened yet.")
  if (open && end.getTime() > Date.parse(open.startedAt))
    throw new Error('That overlaps the session you have running. Pick an earlier time, or stop that session first.')

  const stamp = now.toISOString()
  const endedAt = end.toISOString()
  const reached = Math.min(book.length, Math.max(0, Math.round(reachedPosition ?? 0)))
  const position = Math.max(book.position, reached)
  const lastReadAt = book.lastReadAt && Date.parse(book.lastReadAt) >= end.getTime() ? book.lastReadAt : endedAt
  const session: ReadingSession = {
    id: newId(),
    profileId: book.profileId,
    shelfItemId: book.id,
    startedAt: start.toISOString(),
    endedAt,
    startPosition: book.position,
    endPosition: position,
    checkInsEnabled: false,
    updatedAt: stamp,
  }
  // Only a real change touches the shelf row, so a stale copy never wins last-write-wins over another device's edit.
  const changed = position !== book.position || lastReadAt !== book.lastReadAt
  return { session, book: changed ? { ...book, position, lastReadAt, updatedAt: stamp } : null }
}

// randomUUID needs a secure context; phones testing the dev server over plain http on the LAN don't have one.
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
