import type { CSSProperties } from 'react'
import type { GenreId } from './types'

export const GENRES: Record<GenreId, { label: string }> = {
  fiction: { label: 'Fiction' },
  mystery: { label: 'Mystery & Crime' },
  thriller: { label: 'Thriller & Horror' },
  romance: { label: 'Romance' },
  fantasy: { label: 'Fantasy & Sci-Fi' },
  biography: { label: 'Biography & Memoir' },
  nonfiction: { label: 'Nonfiction & Ideas' },
  young: { label: 'Young Readers' },
  unclassified: { label: 'Unclassified' },
}

export const GENRE_IDS = Object.keys(GENRES) as GenreId[]

/** Maps a genre's tokens onto generic --band-* custom properties so any component can paint in "its book's" ink. */
export function genreVars(genre: GenreId): CSSProperties {
  return {
    '--band': `var(--g-${genre})`,
    '--band-on': `var(--g-${genre}-on)`,
    '--band-deep': `var(--g-${genre}-deep)`,
    '--band-deep-on': `var(--g-${genre}-deep-on)`,
    '--band-accent': `var(--g-${genre}-accent)`,
    '--band-pattern': `var(--g-${genre}-pattern)`,
  } as CSSProperties
}
