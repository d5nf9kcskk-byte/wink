export type GenreId =
  | 'fiction'
  | 'mystery'
  | 'thriller'
  | 'romance'
  | 'fantasy'
  | 'biography'
  | 'nonfiction'
  | 'young'
  | 'unclassified'

export type BookFormat = 'physical' | 'ebook' | 'audiobook'
export type ShelfStatus = 'reading' | 'finished' | 'want' | 'dnf'
export type AgeBand = 'child' | 'teen' | 'adult'
export type GoalUnit = 'minutes' | 'pages'

/** A person reading. Adults and teens own their account; a child profile is owned by a parent's account and has no login. */
export interface Profile {
  id: string
  ownerUserId: string | null // null in "this device only" mode
  displayName: string
  ageBand: AgeBand
  parentProfileId: string | null
  goal: { unit: GoalUnit; amount: number }
  /** SHA-256 hex of the parent PIN; set on the parent profile once a child profile exists. */
  parentPinHash: string | null
  createdAt: string
  updatedAt: string
}

/** A book on one profile's shelf. Positions are pages for physical/ebook, minutes for audiobooks. */
export interface ShelfItem {
  id: string
  profileId: string
  olWorkKey: string | null // e.g. "/works/OL45883W"
  title: string
  authors: string[]
  coverId: number | null // Open Library cover id
  genre: GenreId
  format: BookFormat
  length: number // total pages, or total minutes for audiobooks
  position: number // current page, or minutes listened
  status: ShelfStatus
  rating: number | null // 0.5 to 5 in half steps
  startedAt: string
  finishedAt: string | null
  lastReadAt: string | null
  updatedAt: string
}

/** One sitting. An open session has endedAt === null. Ids are client-generated so offline sync is idempotent. */
export interface ReadingSession {
  id: string
  profileId: string
  shelfItemId: string
  startedAt: string
  endedAt: string | null
  startPosition: number
  endPosition: number | null
  checkInsEnabled: boolean // resets to true for every new session
  updatedAt: string
}

export type MotionPref = 'full' | 'reduced' | 'off'

export type SyncStatus = 'local-only' | 'idle' | 'syncing' | 'offline' | 'error'

/** What a new book needs when added from search. */
export interface NewBook {
  olWorkKey: string | null
  title: string
  authors: string[]
  coverId: number | null
  genre: GenreId
  format: BookFormat
  length: number
  position?: number
}
