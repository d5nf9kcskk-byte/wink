import type { SupabaseClient } from '@supabase/supabase-js'
import type { DeviceCopy, OutboxEntry, Row, Table } from './local'

const ORDER: Table[] = ['profiles', 'shelf_items', 'sessions']
const PAGE = 1000

export function toRow(obj: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), v]))
}

/** Server row → app object. Drops the server-only synced_at and normalises timestamps to the app's ISO form. */
export function fromRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (k === 'synced_at') continue
    out[k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] =
      k.endsWith('_at') && typeof v === 'string' ? new Date(v).toISOString() : v
  }
  return out as T
}

/** Last write wins by updatedAt; ties keep the device's copy. */
export function mergeRows<T extends { id: string; updatedAt: string }>(local: T[], remote: T[]): T[] {
  const byId = new Map(local.map((r) => [r.id, r]))
  for (const r of remote) {
    const mine = byId.get(r.id)
    if (!mine || Date.parse(r.updatedAt) > Date.parse(mine.updatedAt)) byId.set(r.id, r)
  }
  return [...byId.values()]
}

/** Removes entries that were flushed, keeping any row that changed again while the flush was in flight. */
export function settle(outbox: OutboxEntry[], flushed: OutboxEntry[]): OutboxEntry[] {
  const sent = new Set(flushed.map((e) => JSON.stringify(e)))
  return outbox.filter((e) => !sent.has(JSON.stringify(e)))
}

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

/**
 * Pushes the outbox, then pulls everything the server changed since the last pull.
 * Resolves to a function that folds the result into whatever the device copy has become meanwhile.
 */
export async function syncOnce(client: SupabaseClient, copy: DeviceCopy): Promise<(current: DeviceCopy) => DeviceCopy> {
  const flushed = copy.outbox
  for (const table of ORDER) {
    const mine = flushed.filter((e) => e.table === table)
    const rows = mine.flatMap((e) => (e.op === 'upsert' ? [toRow(e.row)] : []))
    const ids = mine.flatMap((e) => (e.op === 'delete' ? [e.id] : []))
    if (rows.length) fail((await client.from(table).upsert(rows)).error)
    if (ids.length) fail((await client.from(table).delete().in('id', ids)).error)
  }

  const pulled: Record<Table, Row[]> = { profiles: [], shelf_items: [], sessions: [] }
  const cursors = { ...copy.cursors }
  for (const table of ORDER) {
    for (let from = 0; ; from += PAGE) {
      const base = client.from(table).select('*')
      const since = copy.cursors[table]
      const { data, error } = await (since ? base.gt('synced_at', since) : base)
        .order('synced_at')
        .order('id')
        .range(from, from + PAGE - 1)
      fail(error)
      const rows = (data ?? []) as Record<string, unknown>[]
      pulled[table].push(...rows.map((r) => fromRow<Row>(r)))
      if (rows.length) cursors[table] = rows[rows.length - 1].synced_at as string
      if (rows.length < PAGE) break
    }
  }

  const syncedAt = new Date().toISOString()
  return (current) => {
    const deleting = new Set(current.outbox.flatMap((e) => (e.op === 'delete' ? [e.id] : [])))
    const fresh = <T extends Row>(rows: Row[]) => rows.filter((r) => !deleting.has(r.id)) as T[]
    return {
      ...current,
      profiles: mergeRows(current.profiles, fresh(pulled.profiles)),
      books: mergeRows(current.books, fresh(pulled.shelf_items)),
      sessions: mergeRows(current.sessions, fresh(pulled.sessions)),
      outbox: settle(current.outbox, flushed),
      cursors,
      lastSyncedAt: syncedAt,
    }
  }
}
