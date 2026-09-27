import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { stagger, useAnimate } from 'motion/react'
import { genreVars } from '../lib/genres'
import { dur, EASE_OUT } from '../lib/motion'
import { useRoute } from '../lib/route'
import type { ShelfItem } from '../lib/types'
import './BookOpening.css'

/** Front leaves that turn before the title page. Each sits one fore-edge step narrower than the leaf below it. */
const LEAVES = 4
const STEP = 4
/** The boards overhang the pages by this much on the head, tail and fore-edge (--s-1). */
const SQUARE = 4
/** A board has weight: it starts slow, swings, then settles. */
const HEFT = [0.45, 0, 0.25, 1] as const

function geometry(r: DOMRect) {
  const { clientWidth: w, clientHeight: h } = document.documentElement
  // The open book settles a little smaller; on a phone, small enough that the spread shows a page and a half.
  const scale = Math.min(0.76, (w - 32) / (1.5 * r.width))
  // Spine at the centre, unless that would push the title page off a narrow screen; then the left page runs off instead.
  const spine = Math.min(w / 2, w - r.width * scale - 16)
  const head = h / 2 - (r.height / 2 - SQUARE) * scale
  return {
    box: { left: r.left, top: r.top, width: r.width, height: r.height },
    open: `translate(${spine - r.left}px, ${h / 2 - r.top - r.height / 2}px) scale(${scale})`,
    // Where the title page sits once the book has settled; the paper grows from here to the whole screen.
    page: `inset(${head}px ${Math.max(0, w - spine - (r.width - SQUARE) * scale)}px ${head}px ${spine}px)`,
  }
}

function TitlePage({ book }: { book: ShelfItem }) {
  return (
    <div className="opening__title">
      <p className="opening__name">{book.title}</p>
      {book.authors.length > 0 && (
        <>
          <span className="opening__rule" />
          <p className="opening__author">{book.authors.join(', ')}</p>
        </>
      )}
    </div>
  )
}

type Props = { book: ShelfItem; cover: HTMLElement; full: boolean }

/**
 * Start reading, played over everything: at Full the cover swings open on its spine, a few leaves turn,
 * and the title page grows into the white session page. Reduced fades straight to that page.
 * A tap or Escape/Enter/Space skips ahead. The layer goes when Home unmounts under the session screen.
 */
export function BookOpening({ book, cover, full }: Props) {
  const [, go] = useRoute()
  const [scope, animate] = useAnimate<HTMLDivElement>()
  const face = useRef<HTMLDivElement>(null)
  const [{ box, open, page }] = useState(() => geometry(cover.getBoundingClientRect()))

  // The cover travels as a still copy of itself; the real one hides underneath.
  useLayoutEffect(() => {
    face.current?.replaceChildren(cover.cloneNode(true))
  }, [cover])

  useEffect(() => {
    const root = scope.current
    let gone = false
    const leave = () => {
      if (gone) return
      gone = true
      go('session')
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || !['Escape', 'Enter', ' '].includes(e.key)) return
      e.preventDefault()
      leave()
    }
    // click, not pointerdown: the whole tap has to land here, or its tail clicks whatever Session puts under the finger.
    root.addEventListener('click', leave)
    addEventListener('keydown', onKey)

    const runs = full
      ? [
          animate('.opening__ground', { opacity: [0, 1] }, { duration: 0.5, ease: EASE_OUT }),
          animate('.opening__book', { transform: ['translate(0px, 0px) scale(1)', open] }, { duration: 0.95, ease: HEFT }),
          animate('.opening__cover', { transform: ['rotateY(0deg)', 'rotateY(-180deg)'] }, { duration: 0.95, ease: HEFT }),
          animate(
            '.opening__leaf',
            { transform: ['rotateY(0deg)', 'rotateY(-180deg)'] },
            { duration: 0.68, ease: HEFT, delay: stagger(0.12, { startDelay: 0.45 }) },
          ),
          // Swaps in exactly over the title page it copies, then grows.
          animate('.opening__page', { opacity: [0, 1] }, { duration: 0.001, delay: 1.3 }),
          // Aims a hair past the edges so the ease-out's long tail doesn't leave a 1px sliver of ground for its last 150ms.
          animate('.opening__page', { clipPath: [page, 'inset(-4px -4px -4px -4px)'] }, { duration: 0.42, delay: 1.3, ease: EASE_OUT }),
          animate(
            '.opening__page .opening__title',
            { opacity: [1, 0], transform: ['scale(1)', 'scale(1.12)'] },
            { duration: 0.3, delay: 1.3, ease: EASE_OUT },
          ),
        ]
      : [animate('.opening__page', { opacity: [0, 1] }, { duration: dur('reduced', 0.25), ease: EASE_OUT })]
    void Promise.all(runs).then(leave)

    return () => {
      gone = true
      root.removeEventListener('click', leave)
      removeEventListener('keydown', onKey)
      runs.forEach((r) => r.stop())
    }
  }, [animate, scope, full, open, page, go])

  return createPortal(
    <div ref={scope} className="opening" style={genreVars(book.genre)} aria-hidden="true">
      {full && (
        <>
          <div className="opening__ground" />
          <div className="opening__at opening__book on-paper" style={box}>
            <div className="opening__block">
              <TitlePage book={book} />
            </div>
            {Array.from({ length: LEAVES }, (_, i) => (
              <div
                key={i}
                className="opening__leaf"
                style={{ right: SQUARE + STEP * (LEAVES + 1 - i), '--z': `${(LEAVES - i) / 2}px` } as CSSProperties}
              />
            ))}
            <div className="opening__cover">
              <div ref={face} className="opening__face" inert />
              <div className="opening__face opening__face--inside" />
            </div>
          </div>
        </>
      )}
      <div className="opening__page on-paper" style={full ? { clipPath: page } : undefined}>
        {full && (
          <div className="opening__at" style={{ ...box, transform: open }}>
            <div className="opening__block opening__block--bare">
              <TitlePage book={book} />
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
