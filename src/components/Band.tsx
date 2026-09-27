import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import { genreVars } from '../lib/genres'
import type { GenreId } from '../lib/types'
import './Band.css'

type BandProps = {
  /** Paints the band in this genre's ink. Omit to inherit --band from an ancestor. */
  genre?: GenreId
  /** 'hero' is the full-height Start/Stop band; 'regular' is a standard band control. */
  size?: 'hero' | 'regular'
  /** 0..1 page position, drawn as the band's fill rule along its top edge. */
  progress?: number
  children: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>

/** A flat genre-ink band that is also the control. Pressed deepens it; disabled greys it; aria-pressed adds a keyline. */
export function Band({ genre, size = 'regular', progress, className, style, children, type = 'button', ...rest }: BandProps) {
  const vars: CSSProperties = { ...(genre ? genreVars(genre) : {}), ...style }
  return (
    <button type={type} className={`band band--${size} ${className ?? ''}`} style={vars} {...rest}>
      {progress !== undefined && (
        <span className="band__rule" aria-hidden="true">
          <span className="band__fill" style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }} />
        </span>
      )}
      <span className="band__content">{children}</span>
    </button>
  )
}
