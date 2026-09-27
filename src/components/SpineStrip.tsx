import { Plus } from 'lucide-react'
import { genreVars } from '../lib/genres'
import type { ShelfItem } from '../lib/types'
import './SpineStrip.css'

// A spine letters the whole title; only an extreme one is cut, and only at a word.
const spineTitle = (t: string) => (t.length <= 40 ? t : `${t.slice(0, 41).replace(/\s+\S*$/, '')}…`)

type SpineStripProps = {
  books: ShelfItem[]
  heroId: string | null
  onPick: (id: string) => void
  onAdd: () => void
}

export function SpineStrip({ books, heroId, onPick, onAdd }: SpineStripProps) {
  return (
    <ul className="spine-strip" aria-label="Books you're reading">
      {books.map((b, i) => (
        <li key={b.id}>
          <button
            type="button"
            className="spine-strip__spine"
            style={genreVars(b.genre)}
            aria-pressed={b.id === heroId}
            aria-label={b.title}
            title={b.title}
            onClick={() => onPick(b.id)}
          >
            <span className="spine-strip__title">{spineTitle(b.title)}</span>
            <span className="spine-strip__no" aria-hidden="true">
              {i + 1}
            </span>
          </button>
        </li>
      ))}
      <li>
        <button
          type="button"
          className="spine-strip__spine spine-strip__spine--add"
          aria-label="Add a book"
          onClick={onAdd}
        >
          <Plus size={20} strokeWidth={2.25} aria-hidden="true" />
          <span className="spine-strip__title">Add</span>
        </button>
      </li>
    </ul>
  )
}
