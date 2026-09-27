import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { genreVars } from '../lib/genres'
import type { GenreId } from '../lib/types'
import './Sheet.css'

type SheetProps = {
  open: boolean
  onClose: () => void
  title: string
  /** Paints the sheet's header band in this genre's ink; omit for the ink header. */
  genre?: GenreId
  /** Hide the close control when the sheet must be answered (e.g. a check-in). Esc still closes unless `locked`. */
  locked?: boolean
  children: ReactNode
}

/** A bottom sheet on phones, a centered leaf on wide screens. Native <dialog> provides focus trapping and Esc. */
export function Sheet({ open, onClose, title, genre, locked, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  const style = (genre ? genreVars(genre) : undefined) as CSSProperties | undefined

  return (
    <dialog
      ref={ref}
      className={`sheet ${genre ? 'sheet--genre' : ''}`}
      style={style}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        if (!locked) onClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !locked) onClose()
      }}
    >
      <div className="sheet__leaf on-paper">
        <header className="sheet__head">
          <h2 id={titleId} className="sheet__title">
            {title}
          </h2>
          {!locked && (
            <button type="button" className="sheet__close" onClick={onClose} aria-label="Close">
              <X size={22} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
        </header>
        <div className="sheet__body">{children}</div>
      </div>
    </dialog>
  )
}
