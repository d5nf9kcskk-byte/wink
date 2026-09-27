import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { streakInfo } from '../lib/progress'
import type { Profile, ReadingSession, ShelfItem } from '../lib/types'
import { adoptCopy, applyChange, emptyCopy, pastSession } from './local'
import { SAMPLE_MISSED, sampleCopy } from './sample'
import { EXPIRED_LINK, authMessage, readArrival, returnUrl } from './supabase'
import { fromRow, mergeRows, settle, syncOnce, toRow } from './sync'

const session: ReadingSession = {
  id: 's1',
  profileId: 'p1',
  shelfItemId: 'b1',
  startedAt: '2026-09-20T21:00:00.000Z',
  endedAt: null,
  startPosition: 10,
  endPosition: null,
  checkInsEnabled: true,
  updatedAt: '2026-09-20T21:00:00.000Z',
}

describe('row mapping', () => {
  it('maps camelCase keys to snake_case and back', () => {
    const row = toRow(session)
    expect(row).toMatchObject({ profile_id: 'p1', shelf_item_id: 'b1', start_position: 10, check_ins_enabled: true })
    expect(fromRow(row)).toEqual(session)
  })

  it('leaves nested goal keys alone and maps profile keys', () => {
    const profile: Profile = {
      id: 'p1',
      ownerUserId: 'u1',
      displayName: 'Jess',
      ageBand: 'adult',
      parentProfileId: null,
      goal: { unit: 'pages', amount: 30 },
      parentPinHash: 'abc',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    }
    expect(toRow(profile)).toMatchObject({ owner_user_id: 'u1', parent_pin_hash: 'abc', goal: { unit: 'pages', amount: 30 } })
    expect(fromRow(toRow(profile))).toEqual(profile)
  })

  it('drops synced_at and normalises Postgres timestamps to ISO', () => {
    const out = fromRow<ShelfItem>({
      id: 'b1',
      ol_work_key: '/works/OL1W',
      last_read_at: '2026-09-20T21:00:00.123+00:00',
      finished_at: null,
      synced_at: '2026-09-20T21:00:01.654321+00:00',
    })
    expect(out).toEqual({ id: 'b1', olWorkKey: '/works/OL1W', lastReadAt: '2026-09-20T21:00:00.123Z', finishedAt: null })
  })
})

describe('mergeRows (last write wins)', () => {
  const at = (id: string, updatedAt: string, v: number) => ({ id, updatedAt, v })

  it('takes newer remote rows, keeps newer local rows, and adds unknown rows', () => {
    const local = [at('a', '2026-09-20T10:00:00.000Z', 1), at('b', '2026-09-20T12:00:00.000Z', 1)]
    const remote = [
      at('a', '2026-09-20T11:00:00.000+00:00', 2),
      at('b', '2026-09-20T11:00:00.000Z', 2),
      at('c', '2026-09-20T09:00:00.000Z', 2),
    ]
    expect(mergeRows(local, remote)).toEqual([
      at('a', '2026-09-20T11:00:00.000+00:00', 2),
      at('b', '2026-09-20T12:00:00.000Z', 1),
      at('c', '2026-09-20T09:00:00.000Z', 2),
    ])
  })

  it('keeps the device copy on a tie', () => {
    const t = '2026-09-20T10:00:00.000Z'
    expect(mergeRows([at('a', t, 1)], [at('a', t, 2)])).toEqual([at('a', t, 1)])
  })
})

describe('outbox', () => {
  it('keeps one pending entry per row and records deletes', () => {
    let copy = applyChange(emptyCopy(), { sessions: [session] }, true)
    const later = { ...session, checkInsEnabled: false, updatedAt: '2026-09-20T21:05:00.000Z' }
    copy = applyChange(copy, { sessions: [later] }, true)
    expect(copy.outbox).toEqual([{ op: 'upsert', table: 'sessions', row: later }])
    copy = applyChange(copy, { deletedSessionId: 's1' }, true)
    expect(copy.sessions).toEqual([])
    expect(copy.outbox).toEqual([{ op: 'delete', table: 'sessions', id: 's1' }])
  })

  it('skips the outbox for device-only data', () => {
    expect(applyChange(emptyCopy(), { sessions: [session] }, false).outbox).toEqual([])
  })

  it('settles flushed entries but keeps rows edited during the flush', () => {
    const flushed = applyChange(emptyCopy(), { sessions: [session] }, true).outbox
    const edited = { ...session, endPosition: 20, updatedAt: '2026-09-20T21:30:00.000Z' }
    const current = applyChange({ ...emptyCopy(), outbox: flushed }, { sessions: [edited] }, true).outbox
    expect(settle(flushed, flushed)).toEqual([])
    expect(settle(current, flushed)).toEqual([{ op: 'upsert', table: 'sessions', row: edited }])
  })
})

describe('pastSession (reading logged after the fact)', () => {
  const now = new Date(2026, 8, 26, 18, 30) // local time, TZ from vite.config
  const book: ShelfItem = {
    id: 'b1',
    profileId: 'p1',
    olWorkKey: null,
    title: 'Piranesi',
    authors: ['Susanna Clarke'],
    coverId: null,
    genre: 'fantasy',
    format: 'physical',
    length: 272,
    position: 40,
    status: 'reading',
    rating: null,
    startedAt: '2026-09-01T00:00:00.000Z',
    finishedAt: null,
    lastReadAt: new Date(2026, 8, 25, 21, 0).toISOString(),
    updatedAt: '2026-09-25T00:00:00.000Z',
  }
  const input = { day: '2026-09-24', startTime: '20:15', minutes: 30 }
  const log = (patch: Partial<typeof input> & { reachedPosition?: number } = {}, open: ReadingSession | null = null, b = book) =>
    pastSession(b, { ...input, ...patch }, open, now)

  it('refuses bad input with readable errors', () => {
    expect(() => log({ day: '24/09/2026' })).toThrow('Pick the day you read.')
    expect(() => log({ day: '2026-02-31' })).toThrow('Pick the day you read.')
    expect(() => log({ day: '2026-13-01' })).toThrow('Pick the day you read.')
    expect(() => log({ day: '2026-09-27' })).toThrow('Pick today or an earlier day.')
    expect(() => log({ startTime: '8pm' })).toThrow('Pick the time you started reading.')
    expect(() => log({ startTime: '24:00' })).toThrow('Pick the time you started reading.')
    for (const minutes of [0, 721, 12.5, NaN]) expect(() => log({ minutes })).toThrow('from 1 to 720')
    expect(() => log({ reachedPosition: NaN })).toThrow('Enter the page you reached.')
    expect(() => log({ day: '2026-09-26', startTime: '18:10', minutes: 30 })).toThrow("That time hasn't happened yet.")
  })

  it('logs a closed, untimed session in local time, earlier today included', () => {
    const { session } = log({ day: '2026-09-26', startTime: '17:30', minutes: 60 })
    expect(session).toMatchObject({
      profileId: 'p1',
      shelfItemId: 'b1',
      startedAt: new Date(2026, 8, 26, 17, 30).toISOString(),
      endedAt: now.toISOString(),
      checkInsEnabled: false,
    })
  })

  it('only refuses a span that runs into the open session', () => {
    const open = { ...session, startedAt: new Date(2026, 8, 26, 18, 0).toISOString() }
    expect(() => log({ day: '2026-09-26', startTime: '17:45', minutes: 20 }, open)).toThrow(/overlaps/)
    expect(log({ day: '2026-09-26', startTime: '17:30', minutes: 30 }, open).session.endedAt).toBe(open.startedAt)
  })

  it('moves the book forward to the page reached, clamped to its length', () => {
    const forward = log({ reachedPosition: 75 })
    expect(forward.session).toMatchObject({ startPosition: 40, endPosition: 75 })
    // Yesterday evening's lastReadAt is later than this log, so it stays.
    expect(forward.book).toMatchObject({ position: 75, lastReadAt: book.lastReadAt, status: 'reading' })
    expect(log({ reachedPosition: 9999 }).book?.position).toBe(272)
  })

  it('never moves a book backwards and leaves an unchanged shelf row alone', () => {
    const back = log({ reachedPosition: 10 })
    expect(back.session).toMatchObject({ startPosition: 40, endPosition: 40 })
    expect(back.book).toBeNull()
    expect(log().book).toBeNull()
    // A log later than lastReadAt still bumps it, position untouched.
    expect(log({ day: '2026-09-26', startTime: '08:00' }).book).toMatchObject({ position: 40, lastReadAt: new Date(2026, 8, 26, 8, 30).toISOString() })
  })

  it('keeps a finished book finished at its full length', () => {
    const done = { ...book, status: 'finished' as const, position: 272, lastReadAt: null }
    const past = log({ reachedPosition: 300 }, null, done)
    expect(past.session).toMatchObject({ startPosition: 272, endPosition: 272 })
    expect(past.book).toMatchObject({ status: 'finished', position: 272 })
  })
})

describe('sign-in redirects', () => {
  it('turns an expired link in the query into plain copy and strips it, keeping other params and the route', () => {
    const a = readArrival(
      'https://wink.app/app/?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sample=1#/you',
    )
    expect(a.authError).toBe(EXPIRED_LINK)
    expect(a.cleaned).toBe('https://wink.app/app/?sample=1#/you')
  })

  it('reads the legacy #error= hash', () => {
    const a = readArrival('https://wink.app/#error=access_denied&error_description=The+user+denied+the+request')
    expect(a.authError).toBe('Google sign-in was cancelled.')
    expect(a.cleaned).toBe('https://wink.app/')
  })

  it('never repeats the raw description, which anyone can write into a link', () => {
    expect(authMessage('server_error', null, 'Call 555 0100 to unlock')).toBe("Sign-in didn't finish (server error). Try again.")
  })

  it("leaves a plain address and Supabase's own ?code alone", () => {
    expect(readArrival('https://wink.app/#/library')).toMatchObject({ authError: null, cleaned: null, code: false })
    expect(readArrival('https://wink.app/?code=abc&sb_flow_id=f1')).toMatchObject({ code: true, cleaned: null })
  })

  it('carries the pending onboarding answers through the link and back', () => {
    const link = returnUrl('https://wink.app/app/', { childSetup: true, ageBand: 'adult' })
    // Supabase adds its own params on the way back.
    expect(readArrival(`${link}&code=abc#/`)).toMatchObject({
      childSetup: true,
      ageBand: 'adult',
      code: true,
      cleaned: 'https://wink.app/app/?code=abc#/',
    })
    expect(returnUrl('https://wink.app/', { childSetup: false, ageBand: null })).toBe('https://wink.app/')
    expect(readArrival('https://wink.app/?age=toddler')).toMatchObject({ ageBand: null, cleaned: 'https://wink.app/' })
  })
})

describe('sample data', () => {
  const now = new Date(2026, 8, 26, 18, 30)
  const copy = sampleCopy(now)
  const day = (iso: string) => new Date(iso).toLocaleDateString('en-CA')
  const daysAgo = (n: number) => day(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n).toISOString())
  const readDays = new Set(copy.sessions.map((s) => day(s.startedAt)))

  it('reads every day for 40 days except the missed ones, including earlier today', () => {
    for (let n = 0; n <= 40; n++) expect(readDays.has(daysAgo(n)), `day -${n}`).toBe(!SAMPLE_MISSED.includes(n))
    expect(copy.sessions.every((s) => Date.parse(s.endedAt!) <= now.getTime())).toBe(true)
  })

  it('forms a live streak through a repaired gap and a grace day', () => {
    const streak = streakInfo(copy.sessions, now)
    expect(streak.status).toBe('alive')
    expect(Object.values(streak.days)).toEqual(expect.arrayContaining(['repaired', 'grace']))
  })

  it('has three books reading, two finished, with positions that add up', () => {
    expect(copy.books.filter((b) => b.status === 'reading')).toHaveLength(3)
    expect(copy.books.filter((b) => b.status === 'finished').every((b) => b.position === b.length)).toBe(true)
    for (const b of copy.books) {
      const mine = copy.sessions.filter((s) => s.shelfItemId === b.id)
      expect(mine.at(-1)!.endPosition).toBe(b.position)
      expect(mine.every((s, i) => i === 0 || s.startPosition === mine[i - 1].endPosition)).toBe(true)
    }
  })
})

type Rec = Record<string, unknown> & { id: string; updated_at: string; synced_at?: string }

/** In-memory stand-in for the three tables, with the migration's last-write-wins trigger. */
function fakeServer() {
  const db: Record<string, Map<string, Rec>> = { profiles: new Map(), shelf_items: new Map(), sessions: new Map() }
  let tick = 0
  const client = {
    from: (table: string) => ({
      upsert: async (rows: Rec[]) => {
        for (const r of rows) {
          const old = db[table].get(r.id)
          if (!old || Date.parse(r.updated_at) >= Date.parse(old.updated_at))
            db[table].set(r.id, { ...r, synced_at: `2026-09-26T00:00:${String(tick++).padStart(2, '0')}.000001+00:00` })
        }
        return { error: null }
      },
      delete: () => ({
        in: async (_col: string, ids: string[]) => {
          ids.forEach((id) => db[table].delete(id))
          return { error: null }
        },
      }),
      select: () => {
        let since = ''
        let range = [0, Infinity]
        const q = {
          gt: (_col: string, v: string) => ((since = v), q),
          order: () => q,
          range: (from: number, to: number) => ((range = [from, to]), q),
          then: (done: (r: { data: Rec[]; error: null }) => void) =>
            done({
              data: [...db[table].values()]
                .filter((r) => r.synced_at! > since)
                .sort((a, b) => a.synced_at!.localeCompare(b.synced_at!))
                .slice(range[0], range[1] + 1),
              error: null,
            }),
        }
        return q
      },
    }),
  }
  return { db, client: client as unknown as SupabaseClient }
}

describe('syncOnce against a fake server', () => {
  const profile: Profile = {
    id: 'p1',
    ownerUserId: 'u1',
    displayName: 'Jess',
    ageBand: 'adult',
    parentProfileId: null,
    goal: { unit: 'minutes', amount: 20 },
    parentPinHash: null,
    createdAt: '2026-09-20T20:00:00.000Z',
    updatedAt: '2026-09-20T20:00:00.000Z',
  }
  const book: ShelfItem = {
    id: 'b1',
    profileId: 'p1',
    olWorkKey: null,
    title: 'Piranesi',
    authors: ['Susanna Clarke'],
    coverId: null,
    genre: 'fantasy',
    format: 'physical',
    length: 272,
    position: 10,
    status: 'reading',
    rating: null,
    startedAt: '2026-09-20T20:00:00.000Z',
    finishedAt: null,
    lastReadAt: '2026-09-20T21:00:00.000Z',
    updatedAt: '2026-09-20T21:00:00.000Z',
  }

  it('pushes one device and pulls onto another, then converges on the newest edit', async () => {
    const { db, client } = fakeServer()
    let phone = applyChange(emptyCopy(), { profiles: [profile], books: [book], sessions: [session] }, true)
    phone = (await syncOnce(client, phone))(phone)
    expect(phone.outbox).toEqual([])
    expect(phone.lastSyncedAt).not.toBeNull()
    expect(db.sessions.get('s1')).toMatchObject({ shelf_item_id: 'b1', check_ins_enabled: true })

    let laptop = emptyCopy()
    laptop = (await syncOnce(client, laptop))(laptop)
    expect(laptop).toMatchObject({ profiles: [profile], books: [book], sessions: [session] })

    const newer = { ...session, endedAt: '2026-09-20T21:40:00.000Z', endPosition: 40, updatedAt: '2026-09-20T21:40:00.000Z' }
    const stale = { ...session, checkInsEnabled: false, updatedAt: '2026-09-20T21:10:00.000Z' }
    laptop = applyChange(laptop, { sessions: [newer] }, true)
    laptop = (await syncOnce(client, laptop))(laptop)
    phone = applyChange(phone, { sessions: [stale] }, true)
    phone = (await syncOnce(client, phone))(phone)
    expect(phone.sessions).toEqual([newer])
    expect(phone.outbox).toEqual([])

    phone = applyChange(phone, { deletedSessionId: 's1' }, true)
    phone = (await syncOnce(client, phone))(phone)
    expect(db.sessions.size).toBe(0)
  })

  it('moves a device-only copy into an empty account, re-owned and queued', async () => {
    const { db, client } = fakeServer()
    const local = {
      ...applyChange(emptyCopy(), { profiles: [{ ...profile, ownerUserId: null }], books: [book], sessions: [session] }, false),
      activeProfileId: 'p1',
      heroByProfile: { p1: 'b1' },
    }
    const account = (await syncOnce(client, emptyCopy()))(emptyCopy())
    const stamp = '2026-09-26T12:00:00.000Z'
    const adopted = adoptCopy(local, account, 'u9', stamp)
    expect(adopted.profiles).toEqual([{ ...profile, ownerUserId: 'u9', updatedAt: stamp }])
    expect([...adopted.books, ...adopted.sessions].every((r) => r.updatedAt === stamp)).toBe(true)
    expect(adopted).toMatchObject({ activeProfileId: 'p1', heroByProfile: { p1: 'b1' }, lastSyncedAt: account.lastSyncedAt })
    expect(adopted.outbox.map((e) => (e.op === 'upsert' ? `${e.table}:${e.row.id}` : e.id))).toEqual([
      'profiles:p1',
      'shelf_items:b1',
      'sessions:s1',
    ])
    const synced = (await syncOnce(client, adopted))(adopted)
    expect(synced.outbox).toEqual([])
    expect(db.profiles.get('p1')).toMatchObject({ owner_user_id: 'u9' })
    expect(db.sessions.has('s1')).toBe(true)
  })
})
