import { renderToString } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { localDay } from '../lib/progress'
import type { NewBook } from '../lib/types'
import type { WinkApi } from './api'

const disk = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => disk.get(k) ?? null,
  setItem: (k: string, v: string) => void disk.set(k, v),
  removeItem: (k: string) => void disk.delete(k),
})
vi.stubGlobal('location', { href: 'http://localhost:5173/', search: '', hash: '', origin: 'http://localhost:5173', pathname: '/' })
const cloudMode = async (original: () => Promise<typeof import('./supabase')>) => ({ ...(await original()), mode: 'cloud', supabase: null })

async function load(): Promise<() => WinkApi> {
  const { WinkProvider, useWink } = await import('./store')
  function Probe({ onApi }: { onApi: (api: WinkApi) => void }) {
    onApi(useWink())
    return null
  }
  return () => {
    let api: WinkApi | undefined
    renderToString(
      <WinkProvider>
        <Probe onApi={(a) => (api = a)} />
      </WinkProvider>,
    )
    return api!
  }
}

let wink: () => WinkApi

beforeAll(async () => {
  wink = await load()
})

describe('store in "this device only" mode', () => {
  it('runs onboarding, parent PIN, the session loop and finishing a book', async () => {
    expect(wink().auth.status).toBe('signed-out')
    wink().continueOnThisDevice()
    expect(wink()).toMatchObject({ auth: { status: 'local' }, ready: true, needsOnboarding: true, sync: { status: 'local-only' } })

    const sam = await wink().createOwnProfile({ displayName: '  Sam ', ageBand: 'adult' })
    expect(wink().activeProfile).toMatchObject({ displayName: 'Sam', ownerUserId: null, goal: { unit: 'minutes', amount: 20 } })
    expect(wink().needsOnboarding).toBe(false)

    await expect(wink().createChildProfile({ displayName: 'Kit' })).rejects.toThrow(/PIN/)
    await expect(wink().setParentPin('12')).rejects.toThrow(/digits/)
    await wink().setParentPin('2468')
    expect(await wink().verifyParentPin('2468')).toBe(true)
    expect(await wink().verifyParentPin('0000')).toBe(false)
    const kit = await wink().createChildProfile({ displayName: 'Kit' })
    expect(kit).toMatchObject({ ageBand: 'child', parentProfileId: sam.id })
    expect(wink().activeProfile?.id).toBe(sam.id)

    const matilda: NewBook = { olWorkKey: null, title: 'Matilda', authors: ['Roald Dahl'], coverId: null, genre: 'young', format: 'physical', length: 240 }
    await expect(wink().addBook({ ...matilda, title: 'x'.repeat(501) })).rejects.toThrow(/500/)
    await expect(wink().addBook({ ...matilda, length: 3e9 })).rejects.toThrow(/pages/)
    const book = await wink().addBook({ ...matilda, position: 12 })
    expect(wink().heroBook?.id).toBe(book.id)

    const session = await wink().startSession(book.id)
    expect(session).toMatchObject({ startPosition: 12, checkInsEnabled: true, endedAt: null })
    expect((await wink().startSession(book.id)).id).toBe(session.id)
    await wink().setCheckIns(false)
    expect(wink().activeSession?.checkInsEnabled).toBe(false)
    await expect(wink().stopSession({ endPosition: 30, endedAt: '2000-01-01T00:00:00.000Z' })).rejects.toThrow(/before/)

    const stopped = await wink().stopSession({ endPosition: 9999 })
    expect(stopped.session.endPosition).toBe(240)
    expect(stopped.book).toMatchObject({ position: 240, lastReadAt: stopped.session.endedAt })
    expect(wink().activeSession).toBeNull()
    await expect(wink().stopSession({ endPosition: 1 })).rejects.toThrow(/No reading session/)

    await expect(wink().finishBook(book.id, 4.3)).rejects.toThrow(/half/)
    await wink().finishBook(book.id, 4.5)
    expect(wink().heroBook).toBeNull()

    const next = await wink().addBook({ olWorkKey: null, title: 'Holes', authors: ['Louis Sachar'], coverId: null, genre: 'young', format: 'audiobook', length: 270 })
    await wink().startSession(next.id)
    await wink().discardSession()
    expect(wink().activeSession).toBeNull()
    expect(wink().sessions).toHaveLength(1)

    wink().switchProfile(kit.id)
    expect(wink()).toMatchObject({ activeProfile: { id: kit.id }, books: [], sessions: [] })
    expect(await wink().verifyParentPin('2468')).toBe(true)
    await expect(wink().setParentPin('1357')).rejects.toThrow(/grown-up/)

    const saved = JSON.parse(disk.get('wink.v1.local')!)
    expect(saved).toMatchObject({ activeProfileId: kit.id, outbox: [] })
    expect(saved.books).toHaveLength(2)
    expect(disk.get('wink.localChosen')).toBe('1')
  })
})

describe('store with accounts', () => {
  it('opens a remembered reader from the device copy without waiting on Supabase', async () => {
    vi.resetModules()
    vi.doMock('./supabase', cloudMode)
    disk.set('wink.lastUser', JSON.stringify({ status: 'signed-in', userId: 'u1', email: 'jess@example.com' }))
    disk.set('wink.v1.u1', JSON.stringify({ profiles: [{ id: 'p1', ownerUserId: 'u1', parentProfileId: null }], lastSyncedAt: '2026-09-25T00:00:00.000Z' }))
    const cloud = await load()
    expect(cloud()).toMatchObject({
      auth: { status: 'signed-in', userId: 'u1' },
      ready: true,
      needsOnboarding: false,
      activeProfile: { id: 'p1' },
      sync: { lastSyncedAt: '2026-09-25T00:00:00.000Z' },
    })
    expect(cloud().auth).toMatchObject({ recovering: false })
  })

  it('logs past reading on the device copy first and queues it for the account', async () => {
    const book = { id: 'b1', profileId: 'p1', format: 'physical', length: 100, position: 10, status: 'reading', lastReadAt: null }
    const { profiles } = JSON.parse(disk.get('wink.v1.u1')!)
    disk.set('wink.v1.u1', JSON.stringify({ profiles, books: [book], lastSyncedAt: '2026-09-25T00:00:00.000Z' }))
    vi.resetModules()
    vi.doMock('./supabase', cloudMode)
    const cloud = await load()
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const day = localDay(yesterday)

    await expect(cloud().addPastSession({ shelfItemId: 'nope', day, startTime: '09:00', minutes: 20 })).rejects.toThrow(/shelf/)
    const session = await cloud().addPastSession({ shelfItemId: 'b1', day, startTime: '09:00', minutes: 20, reachedPosition: 30 })
    expect(session).toMatchObject({ profileId: 'p1', startPosition: 10, endPosition: 30, checkInsEnabled: false })
    expect(cloud().sessions).toEqual([session])
    expect(cloud().books[0]).toMatchObject({ position: 30, lastReadAt: session.endedAt })
    expect(cloud().sync.pending).toBe(2)
    const saved = JSON.parse(disk.get('wink.v1.u1')!)
    expect(saved.outbox.map((e: { table: string }) => e.table)).toEqual(['shelf_items', 'sessions'])
  })

  it('shows a sign-in error from the address, then leaves "this device only" keeping the device copy', async () => {
    vi.resetModules()
    vi.doMock('./supabase', cloudMode)
    const replaceState = vi.fn()
    vi.stubGlobal('history', { state: null, replaceState })
    vi.stubGlobal('location', { ...location, href: 'http://localhost:5173/?error=access_denied&error_description=denied#/' })
    disk.delete('wink.lastUser')
    const cloud = await load()
    expect(cloud().authError).toBe('Google sign-in was cancelled.')
    expect(replaceState).toHaveBeenCalledWith(null, '', 'http://localhost:5173/#/')
    cloud().clearAuthError()
    expect(cloud().authError).toBeNull()

    cloud().continueOnThisDevice()
    const kept = disk.get('wink.v1.local')
    expect(cloud().profiles.length).toBeGreaterThan(0)
    cloud().useAnAccount()
    expect(cloud()).toMatchObject({ auth: { status: 'signed-out' }, profiles: [], needsOnboarding: false })
    expect(disk.get('wink.v1.local')).toBe(kept)
    expect(disk.has('wink.localChosen')).toBe(false)
  })
})
