import type { NewBook, Profile, ReadingSession, ShelfItem, SyncStatus } from '../lib/types'

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; userId: string; email: string | null; recovering: boolean } // recovering: arrived from a password-reset link
  | { status: 'local' } // "this device only": no account, nothing leaves the browser

export interface WinkState {
  /** 'cloud' when VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set, otherwise 'local'. */
  mode: 'local' | 'cloud'
  auth: AuthState
  /** False until the on-device copy has loaded. */
  ready: boolean
  /** Signed in (or local) but no profile yet: show onboarding. */
  needsOnboarding: boolean
  profiles: Profile[]
  activeProfile: Profile | null
  /** The active profile's shelf. */
  books: ShelfItem[]
  /** The active profile's sessions, closed and open, newest first. */
  sessions: ReadingSession[]
  activeSession: ReadingSession | null
  /** The book shown large on Home: the chosen hero, else the most recently read 'reading' book. */
  heroBook: ShelfItem | null
  /** Sync problems only. */
  sync: { status: SyncStatus; pending: number; lastSyncedAt: string | null; error: string | null }
  /** Saving to this device failed (storage full). Must be shown wherever the reader is. */
  storageError: string | null
  /** A sign-in problem to show on Welcome, e.g. an expired link or a cancelled Google sign-in. */
  authError: string | null
}

export interface WinkActions {
  createOwnProfile(input: { displayName: string; ageBand: 'teen' | 'adult' }): Promise<Profile>
  /** Adults only. Requires a parent PIN to be set first. */
  createChildProfile(input: { displayName: string }): Promise<Profile>
  setParentPin(pin: string): Promise<void>
  verifyParentPin(pin: string): Promise<boolean>
  /** Switching from a child profile to an adult one must be gated by verifyParentPin in the UI. */
  switchProfile(profileId: string): void
  updateGoal(goal: Profile['goal']): Promise<void>

  addBook(book: NewBook): Promise<ShelfItem>
  setHeroBook(shelfItemId: string): void

  startSession(shelfItemId: string): Promise<ReadingSession>
  /** Applies to the open session only; every new session starts with check-ins on. */
  setCheckIns(enabled: boolean): Promise<void>
  stopSession(input: { endPosition: number; endedAt?: string }): Promise<{ session: ReadingSession; book: ShelfItem }>
  discardSession(): Promise<void>
  finishBook(shelfItemId: string, rating: number | null): Promise<ShelfItem>
  /**
   * Logs reading that wasn't timed, on a past day or earlier today. `day` is YYYY-MM-DD (local), `startTime` HH:MM (local).
   * `reachedPosition` (page, or minutes for audiobooks) moves the book forward only when it is past the book's current position.
   */
  addPastSession(input: {
    shelfItemId: string
    day: string
    startTime: string
    minutes: number
    reachedPosition?: number
  }): Promise<ReadingSession>

  signInWithMagicLink(email: string): Promise<void>
  signInWithGoogle(): Promise<void>
  signInWithPassword(email: string, password: string): Promise<void>
  signUpWithPassword(email: string, password: string): Promise<{ needsConfirmation: boolean }>
  /** After a reset link (auth.recovering): sets the new password and ends recovery. */
  updatePassword(password: string): Promise<void>
  clearAuthError(): void
  resetPassword(email: string): Promise<void>
  signOut(): Promise<void>
  /** Local mode entry point (also offered in cloud mode as a fallback when offline). */
  continueOnThisDevice(): void
  /** Cloud builds only: leave "this device only" for sign-in. On the account's first sign-in, if it has no profiles yet, the device's reading moves into it. */
  useAnAccount(): void
  syncNow(): Promise<void>
}

export type WinkApi = WinkState & WinkActions
