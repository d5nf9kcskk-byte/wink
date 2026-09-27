import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import type { Profile, ReadingSession, ShelfItem, SyncStatus } from '../lib/types'
import type { AuthState, WinkActions, WinkApi } from './api'
import { adoptCopy, applyChange, emptyCopy, keyFor, loadCopy, newId, pastSession, saveCopy, type Change, type DeviceCopy } from './local'
import { sampleCopy, sampleRequested } from './sample'
import { EXPIRED_LINK, authMessage, mode, readArrival, returnUrl, supabase, type Pending } from './supabase'
import { syncOnce } from './sync'

type SignedIn = Extract<AuthState, { status: 'signed-in' }>

const LOCAL = 'local'
const LOCAL_CHOSEN = 'wink.localChosen'
// Opening offline must not wait on Supabase's token refresh, which retries for ~25s before giving up.
const LAST_USER = 'wink.lastUser'
const STORAGE_FULL = "This device's storage is full, so your latest changes may not be kept after Wink closes. Free up some space."
// Welcome's sessionStorage keys for answers given before signing in.
const CHILD_SETUP = 'wink.pendingChildSetup'
const AGE_BAND = 'wink.pendingAgeBand'
const OTHER_BROWSER =
  'That sign-in link opened in a different browser from the one that asked for it. Ask for a new link and open it here.'

interface Core {
  auth: AuthState
  scope: string | null // 'local' or the signed-in user id
  copy: DeviceCopy
  online: boolean
  syncing: boolean
  syncError: string | null
  storageError: string | null
  authError: string | null
  /** Signed in on a device that has never pulled: hold `ready` so an existing reader isn't sent to onboarding. */
  firstPull: boolean
}

// Read before boot so the address is tidied before anything renders.
const arrival = arrive()
// One store per page: module state behind useSyncExternalStore keeps actions stable and free of stale closures.
let core: Core = boot()
const listeners = new Set<() => void>()

function set(patch: Partial<Core>) {
  core = { ...core, ...patch }
  listeners.forEach((l) => l())
}

function recall(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function remember(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* private mode: the choice lasts this visit only */
  }
}

function localChosen(): boolean {
  return recall(LOCAL_CHOSEN) === '1'
}

function lastUser(): SignedIn | null {
  try {
    const auth = JSON.parse(recall(LAST_USER) ?? 'null') as AuthState | null
    // A reset left half-way ends with the tab: the reader is still signed in.
    return auth?.status === 'signed-in' ? { ...auth, recovering: false } : null
  } catch {
    return null
  }
}

function pending(): Pending {
  try {
    const age = sessionStorage.getItem(AGE_BAND)
    return { childSetup: sessionStorage.getItem(CHILD_SETUP) === '1', ageBand: age === 'teen' || age === 'adult' ? age : null }
  } catch {
    return { childSetup: false, ageBand: null }
  }
}

function arrive() {
  const a = readArrival(location.href)
  try {
    if (a.childSetup) sessionStorage.setItem(CHILD_SETUP, '1')
    if (a.ageBand) sessionStorage.setItem(AGE_BAND, a.ageBand)
  } catch {
    /* storage blocked: Welcome asks again */
  }
  if (a.cleaned) history.replaceState(history.state, '', a.cleaned)
  return a
}

function signedOut(): Partial<Core> {
  return { auth: { status: 'signed-out' }, scope: null, copy: emptyCopy(), firstPull: false, syncError: null }
}

function openScope(scope: string, auth: AuthState): Partial<Core> {
  let copy = loadCopy(scope)
  if (scope === LOCAL && sampleRequested() && !copy.profiles.length && !copy.books.length && !copy.sessions.length) {
    copy = sampleCopy(new Date())
    saveCopy(scope, copy)
    remember(LOCAL_CHOSEN, '1')
  }
  const firstPull = auth.status === 'signed-in' && !copy.lastSyncedAt && navigator.onLine
  // A slow first pull shouldn't hold the app on a loading screen.
  if (firstPull)
    setTimeout(() => {
      if (core.firstPull) set({ firstPull: false })
    }, 8000)
  return { auth, scope, copy, syncError: null, firstPull }
}

function boot(): Core {
  const base: Core = {
    auth: { status: 'loading' },
    scope: null,
    copy: emptyCopy(),
    online: navigator.onLine,
    syncing: false,
    syncError: null,
    storageError: null,
    authError: arrival.authError,
    firstPull: false,
  }
  if (mode === 'cloud') {
    const user = lastUser()
    return user ? { ...base, ...openScope(user.userId, user) } : base
  }
  if (localChosen() || sampleRequested()) return { ...base, ...openScope(LOCAL, { status: 'local' }) }
  return { ...base, ...signedOut() }
}

function commit(copy: DeviceCopy) {
  const failed = core.scope !== null && !saveCopy(core.scope, copy)
  set({ copy, storageError: failed ? STORAGE_FULL : null })
}

/** Device copy first, then React state, then the outbox (only when an account will receive it). */
function write(change: Change, patch?: Partial<DeviceCopy>) {
  const { scope } = core
  if (!scope) throw new Error('Sign in, or choose to keep your reading on this device, first.')
  commit({ ...applyChange(core.copy, change, scope !== LOCAL), ...patch })
  if (scope !== LOCAL) scheduleSync()
}

let debounce: ReturnType<typeof setTimeout> | undefined
let inflight: Promise<void> | null = null
let rerun = false

function scheduleSync() {
  clearTimeout(debounce)
  debounce = setTimeout(() => void syncNow(), 1000)
}

function syncMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/fetch|network|load failed/i.test(msg)) return "Wink couldn't reach the server. Check your connection, then try again."
  // supabase-js renews the sign-in on its own, or signs out when it can't.
  if (/jwt|token/i.test(msg)) return "Wink couldn't confirm your sign-in. Try again in a minute."
  return `The server didn't accept a change (${msg}).`
}

function syncNow(): Promise<void> {
  if (inflight) {
    rerun = true
    return inflight
  }
  const { auth, scope, copy } = core
  if (!supabase || auth.status !== 'signed-in' || !scope || !navigator.onLine) {
    if (core.firstPull) set({ firstPull: false })
    return Promise.resolve()
  }
  const client = supabase
  set({ syncing: true })
  inflight = (async () => {
    try {
      const fold = await syncOnce(client, copy)
      if (core.scope === scope) {
        commit(fold(core.copy))
        adoptLocal(scope)
      } else saveCopy(scope, fold(loadCopy(scope)))
      set({ syncing: false, syncError: null, firstPull: false })
    } catch (e) {
      set({ syncing: false, syncError: syncMessage(e), firstPull: false })
    }
    inflight = null
    if (rerun) {
      rerun = false
      await syncNow()
    }
  })()
  return inflight
}

/** Once a pull shows the account is empty, the reading kept on this device only moves into it. */
function adoptLocal(userId: string) {
  const local = loadCopy(LOCAL)
  if (core.copy.profiles.length || !local.profiles.length) return
  commit(adoptCopy(local, core.copy, userId, now()))
  // ponytail: an account that already has profiles keeps the device copy apart; merging them needs a chooser.
  if (!core.storageError) remember(keyFor(LOCAL), null)
  rerun = true
}

function start(): () => void {
  const onNetwork = () => {
    set({ online: navigator.onLine })
    if (navigator.onLine) void syncNow()
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') void syncNow()
  }
  // Another tab saved: adopt its copy so this tab's next save doesn't overwrite it.
  const onStorage = (e: StorageEvent) => {
    if (core.scope && e.key === keyFor(core.scope)) set({ copy: loadCopy(core.scope) })
  }
  addEventListener('online', onNetwork)
  addEventListener('offline', onNetwork)
  addEventListener('storage', onStorage)
  document.addEventListener('visibilitychange', onVisible)
  const timer = setInterval(() => {
    if (core.copy.outbox.length) void syncNow()
  }, 60_000)

  const sub = supabase?.auth.onAuthStateChange((event, session) => {
    const user = session?.user
    const recovering = event === 'PASSWORD_RECOVERY'
    if (user) {
      if (core.auth.status === 'signed-in' && core.auth.userId === user.id) {
        if (recovering) set({ auth: { ...core.auth, recovering } })
        return
      }
      if (core.auth.status === 'local' && event !== 'SIGNED_IN' && !recovering) return
      const auth: SignedIn = { status: 'signed-in', userId: user.id, email: user.email ?? null, recovering }
      remember(LOCAL_CHOSEN, null)
      remember(LAST_USER, JSON.stringify(auth))
      const opened = openScope(user.id, auth)
      // A fresh sign-in is the grown-up at the keyboard, so never land in a child profile.
      const own = opened.copy?.profiles.find((p) => p.parentProfileId === null)
      const active = opened.copy?.profiles.find((p) => p.id === opened.copy?.activeProfileId)
      if (opened.copy && own && active?.ageBand === 'child') {
        opened.copy = { ...opened.copy, activeProfileId: own.id }
        saveCopy(user.id, opened.copy)
      }
      set({ ...opened, authError: null })
      // Supabase asks that callbacks not call back into the client synchronously.
      setTimeout(() => void syncNow(), 0)
    } else if (core.auth.status !== 'local') {
      remember(LAST_USER, null)
      set(localChosen() || sampleRequested() ? openScope(LOCAL, { status: 'local' }) : signedOut())
    }
  }).data.subscription
  // A ?code that outlives Supabase's start-up failed to exchange, or belongs to another browser's PKCE verifier.
  if (supabase && arrival.code)
    void supabase.auth.initialize().then(({ error }) => {
      const here = new URL(location.href)
      if (!here.searchParams.has('code')) return
      here.searchParams.delete('code')
      here.searchParams.delete('sb_flow_id')
      history.replaceState(history.state, '', here.href)
      if (core.auth.status !== 'signed-in')
        set({ authError: error ? authMessage(null, error.code ?? null, error.message) : OTHER_BROWSER })
    })
  void syncNow()

  return () => {
    removeEventListener('online', onNetwork)
    removeEventListener('offline', onNetwork)
    removeEventListener('storage', onStorage)
    document.removeEventListener('visibilitychange', onVisible)
    clearInterval(timer)
    sub?.unsubscribe()
  }
}

const now = () => new Date().toISOString()
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)))
const byNewest = (a: string, b: string) => Date.parse(b) - Date.parse(a)

function activeOf(copy: DeviceCopy): Profile | null {
  return (
    copy.profiles.find((p) => p.id === copy.activeProfileId) ??
    copy.profiles.find((p) => p.parentProfileId === null) ??
    copy.profiles[0] ??
    null
  )
}

function requireActive(): Profile {
  const p = activeOf(core.copy)
  if (!p) throw new Error('Create a reader profile first.')
  return p
}

function openSessionOf(sessions: ReadingSession[], profileId: string): ReadingSession | null {
  return (
    sessions
      .filter((s) => s.profileId === profileId && s.endedAt === null)
      .sort((a, b) => byNewest(a.startedAt, b.startedAt))[0] ?? null
  )
}

function requireOpenSession(): ReadingSession {
  const s = openSessionOf(core.copy.sessions, requireActive().id)
  if (!s) throw new Error('No reading session is running.')
  return s
}

function requireBook(id: string): ShelfItem {
  const book = core.copy.books.find((b) => b.id === id && b.profileId === requireActive().id)
  if (!book) throw new Error("That book isn't on this reader's shelf.")
  return book
}

function requireGrownUp(): Profile {
  const p = requireActive()
  if (p.ageBand !== 'adult' || p.parentProfileId !== null)
    throw new Error("Only a grown-up's own profile can do this. Switch to it first.")
  return p
}

async function hashPin(pin: string, adultProfileId: string): Promise<string> {
  if (!crypto.subtle) throw new Error('Parent PINs need a secure (https) connection.')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${pin}:${adultProfileId}`))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function cleanName(name: string): string {
  const n = name.trim()
  if (!n) throw new Error('Add a name first.')
  if (n.length > 60) throw new Error('Keep the name to 60 characters or fewer.')
  return n
}

const AUTH_MESSAGES: [RegExp, string][] = [
  [/invalid login credentials/i, "That email and password don't match. Check them, or get a sign-in link by email instead."],
  [/email not confirmed/i, 'Open the confirmation link we emailed you, then sign in.'],
  [/already registered|already been registered/i, 'That email already has an account. Sign in instead.'],
  [/rate limit|security purposes|too many/i, 'Too many tries in a row. Wait a minute, then try again.'],
  [/fetch|network|load failed/i, "Couldn't reach Wink. Check your connection and try again."],
  [/different from the old/i, "That's the password you have now. Choose a new one."],
  [/password should|weak/i, 'Choose a longer password that would be hard to guess, at least 8 characters.'],
  [/session missing|session.*expired/i, EXPIRED_LINK],
]

function authCheck(error: { message: string } | null) {
  if (!error) return
  throw new Error(AUTH_MESSAGES.find(([re]) => re.test(error.message))?.[1] ?? error.message)
}

function cloud() {
  if (!supabase) throw new Error("Accounts aren't switched on for this copy of Wink. You can keep reading on this device.")
  return supabase
}

const redirectTo = () => location.origin + location.pathname
const linkBack = () => returnUrl(redirectTo(), pending())

const actions: WinkActions = {
  async createOwnProfile({ displayName, ageBand }) {
    const stamp = now()
    const profile: Profile = {
      id: newId(),
      ownerUserId: core.auth.status === 'signed-in' ? core.auth.userId : null,
      displayName: cleanName(displayName),
      ageBand,
      parentProfileId: null,
      goal: { unit: 'minutes', amount: 20 },
      parentPinHash: null,
      createdAt: stamp,
      updatedAt: stamp,
    }
    write({ profiles: [profile] }, { activeProfileId: profile.id })
    return profile
  },

  async createChildProfile({ displayName }) {
    const parent = requireGrownUp()
    if (!parent.parentPinHash) throw new Error("Set a parent PIN first, so only you can leave a child's profile.")
    const stamp = now()
    const child: Profile = {
      id: newId(),
      ownerUserId: parent.ownerUserId,
      displayName: cleanName(displayName),
      ageBand: 'child',
      parentProfileId: parent.id,
      goal: { unit: 'minutes', amount: 20 },
      parentPinHash: null,
      createdAt: stamp,
      updatedAt: stamp,
    }
    write({ profiles: [child] })
    return child
  },

  async setParentPin(pin) {
    const parent = requireGrownUp()
    if (!/^\d{4,8}$/.test(pin)) throw new Error('Use 4 to 8 digits for the PIN.')
    const parentPinHash = await hashPin(pin, parent.id)
    write({ profiles: [{ ...parent, parentPinHash, updatedAt: now() }] })
  },

  async verifyParentPin(pin) {
    const active = activeOf(core.copy)
    const adult = active?.parentProfileId ? core.copy.profiles.find((p) => p.id === active.parentProfileId) : active
    if (!adult?.parentPinHash) return false
    return (await hashPin(pin, adult.id)) === adult.parentPinHash
  },

  switchProfile(profileId) {
    if (core.copy.profiles.some((p) => p.id === profileId)) commit({ ...core.copy, activeProfileId: profileId })
  },

  async updateGoal(goal) {
    const p = requireActive()
    if (goal.unit !== 'minutes' && goal.unit !== 'pages') throw new Error('Choose minutes or pages for the goal.')
    const amount = Math.round(goal.amount)
    if (!(amount >= 1 && amount <= 1440)) throw new Error('Pick a daily goal between 1 and 1440.')
    write({ profiles: [{ ...p, goal: { unit: goal.unit, amount }, updatedAt: now() }] })
  },

  async addBook(input) {
    const p = requireActive()
    // Mirrors the database checks: one row the server refuses would hold up every later sync.
    const title = input.title.trim()
    if (!title) throw new Error('Add the book title first.')
    if (title.length > 500) throw new Error('Keep the title to 500 characters or fewer.')
    const length = Math.round(input.length)
    if (!(length >= 1 && length <= 100_000))
      throw new Error(
        input.format === 'audiobook' ? 'Add how many minutes long it is, from 1 to 100,000.' : 'Add how many pages it has, from 1 to 100,000.',
      )
    const stamp = now()
    const book: ShelfItem = {
      id: newId(),
      profileId: p.id,
      olWorkKey: input.olWorkKey,
      title,
      authors: input.authors,
      coverId: input.coverId,
      genre: input.genre,
      format: input.format,
      length,
      position: clamp(input.position ?? 0, 0, length),
      status: 'reading',
      rating: null,
      startedAt: stamp,
      finishedAt: null,
      lastReadAt: null,
      updatedAt: stamp,
    }
    write({ books: [book] })
    return book
  },

  setHeroBook(shelfItemId) {
    const p = activeOf(core.copy)
    if (!p) return
    commit({ ...core.copy, heroByProfile: { ...core.copy.heroByProfile, [p.id]: shelfItemId } })
  },

  async startSession(shelfItemId) {
    const p = requireActive()
    const open = openSessionOf(core.copy.sessions, p.id)
    if (open) return open
    const book = requireBook(shelfItemId)
    const stamp = now()
    const session: ReadingSession = {
      id: newId(),
      profileId: p.id,
      shelfItemId: book.id,
      startedAt: stamp,
      endedAt: null,
      startPosition: book.position,
      endPosition: null,
      checkInsEnabled: true,
      updatedAt: stamp,
    }
    write({ sessions: [session], books: [{ ...book, lastReadAt: stamp, updatedAt: stamp }] })
    return session
  },

  async setCheckIns(enabled) {
    const open = requireOpenSession()
    write({ sessions: [{ ...open, checkInsEnabled: enabled, updatedAt: now() }] })
  },

  async stopSession({ endPosition, endedAt }) {
    const open = requireOpenSession()
    const book = requireBook(open.shelfItemId)
    const endMs = endedAt === undefined ? Date.now() : Date.parse(endedAt)
    if (!(endMs >= Date.parse(open.startedAt))) throw new Error("The end time can't be before the session started.")
    if (!Number.isFinite(endPosition)) throw new Error(book.format === 'audiobook' ? 'Enter the minute you reached.' : 'Enter the page you reached.')
    const end = new Date(endMs).toISOString()
    const stamp = now()
    const position = clamp(endPosition, 0, book.length)
    const session: ReadingSession = { ...open, endedAt: end, endPosition: position, updatedAt: stamp }
    const updated: ShelfItem = { ...book, position, lastReadAt: end, updatedAt: stamp }
    write({ sessions: [session], books: [updated] })
    return { session, book: updated }
  },

  async discardSession() {
    const open = openSessionOf(core.copy.sessions, requireActive().id)
    if (open) write({ deletedSessionId: open.id })
  },

  async addPastSession({ shelfItemId, ...input }) {
    const book = requireBook(shelfItemId)
    const past = pastSession(book, input, openSessionOf(core.copy.sessions, book.profileId), new Date())
    write({ sessions: [past.session], books: past.book ? [past.book] : undefined })
    return past.session
  },

  async finishBook(shelfItemId, rating) {
    const book = requireBook(shelfItemId)
    if (rating !== null && !(Number.isInteger(rating * 2) && rating >= 0.5 && rating <= 5))
      throw new Error('Ratings go from half a star to 5 stars, in half steps.')
    const stamp = now()
    const finished: ShelfItem = { ...book, status: 'finished', finishedAt: stamp, position: book.length, rating, updatedAt: stamp }
    write({ books: [finished] })
    return finished
  },

  async signInWithMagicLink(email) {
    authCheck((await cloud().auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: linkBack() } })).error)
  },

  async signInWithGoogle() {
    authCheck((await cloud().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo() } })).error)
  },

  async signInWithPassword(email, password) {
    authCheck((await cloud().auth.signInWithPassword({ email: email.trim(), password })).error)
  },

  async signUpWithPassword(email, password) {
    const { data, error } = await cloud().auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: linkBack() } })
    authCheck(error)
    // With email confirmation on, the account exists but has no session until the link is opened.
    return { needsConfirmation: !data.session }
  },

  async updatePassword(password) {
    if (password.length < 8) throw new Error('Use at least 8 characters for your password.')
    authCheck((await cloud().auth.updateUser({ password })).error)
    if (core.auth.status === 'signed-in') set({ auth: { ...core.auth, recovering: false } })
  },

  clearAuthError() {
    if (core.authError) set({ authError: null })
  },

  async resetPassword(email) {
    authCheck((await cloud().auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectTo() })).error)
  },

  async signOut() {
    clearTimeout(debounce)
    remember(LOCAL_CHOSEN, null)
    remember(LAST_USER, null)
    // Supabase drops the device session even when the network call fails, so there is nothing to surface.
    if (supabase && core.auth.status === 'signed-in') await supabase.auth.signOut()
    set(signedOut())
  },

  continueOnThisDevice() {
    remember(LOCAL_CHOSEN, '1')
    set(openScope(LOCAL, { status: 'local' }))
  },

  useAnAccount() {
    if (mode !== 'cloud' || core.auth.status !== 'local') return
    // The device copy stays under its own key; an empty account adopts it after its first pull.
    remember(LOCAL_CHOSEN, null)
    set(signedOut())
  },

  syncNow,
}

const getCore = () => core

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function derive(c: Core): WinkApi {
  const { auth, copy } = c
  const ready = auth.status !== 'loading' && !c.firstPull
  const activeProfile = activeOf(copy)
  const pid = activeProfile?.id
  const books = copy.books.filter((b) => b.profileId === pid)
  const sessions = copy.sessions.filter((s) => s.profileId === pid).sort((a, b) => byNewest(a.startedAt, b.startedAt))
  const reading = books.filter((b) => b.status === 'reading')
  const chosen = pid ? reading.find((b) => b.id === copy.heroByProfile[pid]) : undefined
  const heroBook =
    chosen ??
    [...reading].sort((a, b) => byNewest(a.lastReadAt ?? a.startedAt, b.lastReadAt ?? b.startedAt))[0] ??
    null
  const status: SyncStatus =
    mode === 'local' || auth.status === 'local'
      ? 'local-only'
      : !c.online
        ? 'offline'
        : c.syncing
          ? 'syncing'
          : c.syncError
            ? 'error'
            : 'idle'
  return {
    ...actions,
    mode,
    auth,
    ready,
    needsOnboarding: ready && (auth.status === 'signed-in' || auth.status === 'local') && copy.profiles.length === 0,
    profiles: copy.profiles,
    activeProfile,
    books,
    sessions,
    activeSession: pid ? openSessionOf(copy.sessions, pid) : null,
    heroBook,
    sync: {
      status,
      pending: copy.outbox.length,
      lastSyncedAt: copy.lastSyncedAt,
      error: c.syncError,
    },
    storageError: c.storageError,
    authError: c.authError,
  }
}

const WinkContext = createContext<WinkApi | null>(null)

export function WinkProvider({ children }: { children: ReactNode }) {
  const c = useSyncExternalStore(subscribe, getCore, getCore)
  useEffect(start, [])
  const api = useMemo(() => derive(c), [c])
  return <WinkContext.Provider value={api}>{children}</WinkContext.Provider>
}

export function useWink(): WinkApi {
  const api = useContext(WinkContext)
  if (!api) throw new Error('useWink must be used inside <WinkProvider>')
  return api
}
