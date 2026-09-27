import { useEffect, useId, useRef, useState, type FormEvent, type Ref } from 'react'
import { ChevronLeft, Search, X } from 'lucide-react'
import { Band } from '../components/Band'
import { DurationInput, type Hm } from '../components/PageEntry'
import { Sheet } from '../components/Sheet'
import { coverUrl, searchBooks, type SearchResult } from '../data/openlibrary'
import { useWink } from '../data/store'
import { GENRE_IDS, GENRES, genreVars } from '../lib/genres'
import { genreFromSubjects } from '../lib/progress'
import type { BookFormat, GenreId, ShelfItem } from '../lib/types'
import './AddBook.css'

type Choice = {
  olWorkKey: string | null
  title: string
  authors: string[]
  coverId: number | null
  pages: number | null
  genre: GenreId
  manual: boolean
}

const FORMATS: Record<BookFormat, string> = { physical: 'Print', ebook: 'Ebook', audiobook: 'Audiobook' }
const FORMAT_IDS = Object.keys(FORMATS) as BookFormat[]

const toInt = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s) : null)
const toMinutes = ({ h, m }: Hm) =>
  (h.trim() || m.trim()) && /^\d*$/.test(h.trim()) && /^\d*$/.test(m.trim()) ? Number(h || 0) * 60 + Number(m || 0) : null
const hmText = (min: number) => `${Math.floor(min / 60)} h ${min % 60} min`

export function AddBookSheet({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded?: (book: ShelfItem) => void }) {
  const [wasOpen, setWasOpen] = useState(open)
  const [query, setQuery] = useState('')
  // results: null means the search failed.
  const [found, setFound] = useState<{ q: string; results: SearchResult[] | null } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [choice, setChoice] = useState<Choice | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const id = useId()
  const q = query.trim()

  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setQuery('')
      setFound(null)
      setChoice(null)
    }
  }

  // Runs after <Sheet> has called showModal, so the field is focusable.
  useEffect(() => {
    if (open) searchRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (q.length < 2) return
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      searchBooks(q, ctrl.signal).then(
        (results) => setFound({ q, results }),
        () => {
          if (!ctrl.signal.aborted) setFound({ q, results: null })
        },
      )
    }, 300)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [q, attempt])

  const results = q.length >= 2 && found?.q === q ? found.results : undefined
  const status =
    q.length < 2
      ? 'Search by title or author.'
      : results === undefined
        ? 'Searching…'
        : results === null
          ? 'Search needs an internet connection. Check your connection and try again.'
          : results.length === 0
            ? `No books match “${q}”. Try the title and author together.`
            : null

  return (
    <Sheet open={open} onClose={onClose} title="Add a book">
      <div className="addbook">
        {choice ? (
          <Confirm
            choice={choice}
            onBack={() => setChoice(null)}
            onAdded={(book) => {
              onAdded?.(book)
              onClose()
            }}
          />
        ) : (
          <>
            <label htmlFor={`${id}-q`} className="addbook__label">
              Find a book
            </label>
            <div className="addbook__search">
              <Search size={20} strokeWidth={2} aria-hidden="true" />
              <input
                ref={searchRef}
                id={`${id}-q`}
                className="addbook__input addbook__query"
                type="search"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                aria-describedby={`${id}-status`}
              />
              {query && (
                <button
                  type="button"
                  className="addbook__clear"
                  aria-label="Clear search"
                  onClick={() => {
                    setQuery('')
                    // This button unmounts once the field is empty, so hand focus back to the field.
                    searchRef.current?.focus()
                  }}
                >
                  <X size={20} strokeWidth={2.25} aria-hidden="true" />
                </button>
              )}
            </div>
            <p id={`${id}-status`} className="addbook__status" role="status">
              {status ?? <span className="visually-hidden">{results?.length === 1 ? '1 book found' : `${results?.length} books found`}</span>}
            </p>
            {results === null && (
              <button
                type="button"
                className="addbook__alt"
                onClick={() => {
                  setFound(null)
                  setAttempt((a) => a + 1)
                }}
              >
                Try again
              </button>
            )}
            {!!results?.length && (
              <ul className="addbook__results">
                {results.map((r) => {
                  const genre = genreFromSubjects(r.subjects)
                  return (
                    <li key={r.olWorkKey}>
                      <button
                        type="button"
                        className="addbook__result"
                        onClick={() => setChoice({ ...r, genre, manual: false })}
                      >
                        <Thumb coverId={r.coverId} genre={genre} />
                        <span className="addbook__result-text">
                          <span className="addbook__result-title">{r.title}</span>
                          <span className="addbook__result-fact">
                            {r.authors.join(', ') || 'Unknown author'}
                            {r.firstPublishYear ? ` · ${r.firstPublishYear}` : ''}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            <button
              type="button"
              className="addbook__quiet"
              onClick={() =>
                setChoice({ olWorkKey: null, title: q, authors: [], coverId: null, pages: null, genre: 'unclassified', manual: true })
              }
            >
              Can’t find it? Add it by hand
            </button>
          </>
        )}
      </div>
    </Sheet>
  )
}

function Thumb({ coverId, genre }: { coverId: number | null; genre: GenreId }) {
  const [failed, setFailed] = useState(false)
  if (coverId === null || failed) {
    return <span className="addbook__thumb addbook__thumb--band" style={genreVars(genre)} aria-hidden="true" />
  }
  return (
    <img
      className="addbook__thumb"
      src={coverUrl(coverId, 'S')}
      srcSet={`${coverUrl(coverId, 'M')} 2x`}
      width={40}
      height={60}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
}

type Errors = { title?: string; length?: string; position?: string; save?: string }

function Confirm({ choice, onBack, onAdded }: { choice: Choice; onBack: () => void; onAdded: (book: ShelfItem) => void }) {
  const { addBook } = useWink()
  const [title, setTitle] = useState(choice.title)
  const [author, setAuthor] = useState('')
  const [format, setFormat] = useState<BookFormat>('physical')
  const [pages, setPages] = useState(choice.pages ? String(choice.pages) : '')
  const [length, setLength] = useState<Hm>({ h: '', m: '' })
  const [page, setPage] = useState('')
  const [listened, setListened] = useState<Hm>({ h: '', m: '' })
  const [genre, setGenre] = useState(choice.genre)
  const [errors, setErrors] = useState<Errors>({})
  const busy = useRef(false)
  const headRef = useRef<HTMLHeadingElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const lengthRef = useRef<HTMLInputElement>(null)
  const positionRef = useRef<HTMLInputElement>(null)
  const id = useId()
  const audio = format === 'audiobook'
  const authors = choice.manual ? (author.trim() ? [author.trim()] : []) : choice.authors
  const clear = (key: keyof Errors) => setErrors((e) => ({ ...e, [key]: undefined, save: undefined }))

  useEffect(() => {
    const first = choice.manual ? titleRef : headRef
    first.current?.focus()
  }, [choice.manual])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy.current) return
    const len = audio ? toMinutes(length) : toInt(pages)
    const pos = audio
      ? listened.h.trim() || listened.m.trim()
        ? toMinutes(listened)
        : 0
      : page.trim()
        ? toInt(page)
        : 0
    const next: Errors = {}
    if (!title.trim()) next.title = 'Add the book’s title.'
    if (!len) next.length = audio ? 'Enter how long the audiobook is.' : 'Enter how many pages the book has, using numbers only.'
    if (pos === null) {
      next.position = audio ? 'Enter hours and minutes using numbers only.' : 'Enter the page number using numbers only.'
    } else if (len && pos > len) {
      next.position = audio
        ? `That’s past the end. The audiobook is ${hmText(len)} long.`
        : `That’s past the last page. The book has ${len} pages.`
    }
    setErrors(next)
    if (!len || pos === null || next.title || next.position) {
      const invalid = next.title ? titleRef : next.length ? lengthRef : positionRef
      invalid.current?.focus()
      return
    }
    busy.current = true
    try {
      const book = await addBook({
        olWorkKey: choice.olWorkKey,
        title: title.trim(),
        authors,
        coverId: choice.coverId,
        genre,
        format,
        length: len,
        position: pos,
      })
      onAdded(book)
    } catch {
      busy.current = false
      setErrors({ save: 'We couldn’t add this book. Please try again.' })
    }
  }

  return (
    <form className="addbook__confirm" noValidate onSubmit={submit}>
      <button type="button" className="addbook__back" onClick={onBack}>
        <ChevronLeft size={20} strokeWidth={2.25} aria-hidden="true" />
        Back to search
      </button>

      <div className="addbook__book" style={genreVars(genre)}>
        <p className="addbook__book-band caps">{GENRES[genre].label}</p>
        <div className="addbook__book-page">
          <div className="addbook__book-text">
            <h3 ref={headRef} tabIndex={-1} className="addbook__book-title">
              {title.trim() || 'Your book'}
            </h3>
            {authors.length > 0 && <p className="addbook__book-author">{authors.join(', ')}</p>}
          </div>
          {choice.coverId !== null && <Thumb coverId={choice.coverId} genre={genre} />}
        </div>
        <p className="addbook__book-band caps">{FORMATS[format]}</p>
      </div>

      {choice.manual && (
        <>
          <TextField
            ref={titleRef}
            label="Title"
            value={title}
            onChange={(v) => {
              setTitle(v)
              clear('title')
            }}
            error={errors.title}
          />
          <TextField label="Author (optional)" value={author} onChange={setAuthor} />
        </>
      )}

      <fieldset className="addbook__formats">
        <legend className="addbook__label">Format</legend>
        <div className="addbook__segments">
          {FORMAT_IDS.map((f) => (
            <label key={f} className="addbook__segment">
              <input
                type="radio"
                className="visually-hidden"
                name={`${id}-format`}
                value={f}
                checked={format === f}
                onChange={() => {
                  setFormat(f)
                  setErrors({})
                }}
              />
              {FORMATS[f]}
            </label>
          ))}
        </div>
      </fieldset>

      {audio ? (
        <>
          <Duration
            ref={lengthRef}
            legend="Length"
            value={length}
            onChange={(v) => {
              setLength(v)
              clear('length')
            }}
            error={errors.length}
          />
          <Duration
            ref={positionRef}
            legend="Listened so far (optional)"
            value={listened}
            onChange={(v) => {
              setListened(v)
              clear('position')
            }}
            error={errors.position}
          />
        </>
      ) : (
        <>
          <TextField
            ref={lengthRef}
            label="Pages"
            numeric
            value={pages}
            onChange={(v) => {
              setPages(v)
              clear('length')
            }}
            error={errors.length}
          />
          <TextField
            ref={positionRef}
            label="Page you’re on (optional)"
            numeric
            value={page}
            onChange={(v) => {
              setPage(v)
              clear('position')
            }}
            error={errors.position}
          />
        </>
      )}

      <div className="addbook__field">
        <label htmlFor={`${id}-genre`} className="addbook__label">
          Genre
        </label>
        <select
          id={`${id}-genre`}
          className="addbook__input"
          value={genre}
          onChange={(e) => setGenre(e.target.value as GenreId)}
          aria-describedby={choice.manual ? undefined : `${id}-genre-hint`}
        >
          {GENRE_IDS.map((g) => (
            <option key={g} value={g}>
              {GENRES[g].label}
            </option>
          ))}
        </select>
        {!choice.manual && (
          <p id={`${id}-genre-hint`} className="addbook__hint">
            Our best guess from the book’s subjects. Change it if it’s wrong.
          </p>
        )}
      </div>

      {errors.save && (
        <p className="addbook__error" role="alert">
          {errors.save}
        </p>
      )}
      <Band type="submit" genre={genre}>
        Add to my reading
      </Band>
    </form>
  )
}

function TextField({
  label,
  value,
  onChange,
  error,
  numeric,
  ref,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
  numeric?: boolean
  ref?: Ref<HTMLInputElement>
}) {
  const id = useId()
  return (
    <div className="addbook__field">
      <label htmlFor={id} className="addbook__label">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        className="addbook__input"
        inputMode={numeric ? 'numeric' : undefined}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && (
        <p id={`${id}-error`} className="addbook__error">
          {error}
        </p>
      )}
    </div>
  )
}

function Duration({ error, ...props }: Omit<Parameters<typeof DurationInput>[0], 'describedBy' | 'invalid'> & { error?: string }) {
  const id = useId()
  return (
    <div className="addbook__field">
      <DurationInput {...props} describedBy={error ? id : undefined} invalid={!!error} />
      {error && (
        <p id={id} className="addbook__error">
          {error}
        </p>
      )}
    </div>
  )
}
