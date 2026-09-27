import { useEffect, useId, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Band } from '../components/Band'
import { StarRating } from '../components/StarRating'
import { WinkMark } from '../components/WinkMark'
import { useWink } from '../data/store'
import { genreVars } from '../lib/genres'
import { dur, EASE_OUT, useMotionPref } from '../lib/motion'
import type { ShelfItem } from '../lib/types'
import './Finish.css'

export function FinishFlow({ book, open, onClose }: { book: ShelfItem; open: boolean; onClose: () => void }) {
  return open ? <Finished book={book} onClose={onClose} /> : null
}

function Finished({ book, onClose }: { book: ShelfItem; onClose: () => void }) {
  const { finishBook } = useWink()
  const pref = useMotionPref()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const busy = useRef(false)
  const [rating, setRating] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  const stampId = useId()
  const titleId = useId()

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    const back = document.activeElement as HTMLElement | null
    d.showModal()
    titleRef.current?.focus()
    return () => {
      d.close()
      back?.focus()
    }
  }, [])

  async function done(value: number | null) {
    if (busy.current) return
    busy.current = true
    try {
      await finishBook(book.id, value)
      onClose()
    } catch {
      busy.current = false
      setFailed(true)
    }
  }

  const full = pref === 'full'
  const off = pref === 'off'
  const at = (seconds: number, delay: number) => ({ duration: dur(pref, seconds), delay: full ? delay : 0, ease: EASE_OUT })
  const fadeIn = { initial: off ? false : { opacity: 0 }, animate: { opacity: 1 } } as const

  return (
    <dialog
      ref={dialogRef}
      className="finish"
      style={genreVars(book.genre)}
      aria-labelledby={`${stampId} ${titleId}`}
      onCancel={(e) => {
        e.preventDefault()
        void done(null)
      }}
    >
      <motion.div
        className="finish__ink"
        aria-hidden="true"
        initial={full ? { clipPath: 'inset(100% 0% 0% 0%)' } : fadeIn.initial}
        animate={full ? { clipPath: 'inset(0% 0% 0% 0%)' } : fadeIn.animate}
        transition={at(0.9, 0)}
      >
        <WinkMark title={null} size={44} />
      </motion.div>

      <div className="finish__layout">
        <motion.div
          className="finish__band"
          initial={full ? { y: 40, opacity: 0 } : fadeIn.initial}
          animate={{ y: 0, opacity: 1 }}
          transition={at(0.7, 0.55)}
        >
          <h2 id={titleId} ref={titleRef} tabIndex={-1} className="finish__title">
            {book.title}
          </h2>
          <p id={stampId} className="finish__stamp caps">
            Finished
          </p>
        </motion.div>

        <motion.div className="finish__rate" {...fadeIn} transition={at(0.4, 1)}>
          <StarRating label="How would you rate it?" value={rating} onChange={setRating} />
          {failed && (
            <p className="finish__error" role="alert">
              We couldn’t mark this book as finished. Please try again.
            </p>
          )}
          <button type="button" className="finish__skip" onClick={() => void done(null)}>
            Skip rating
          </button>
          <Band size="hero" className="finish__save" disabled={rating === null} onClick={() => void done(rating)}>
            Save rating
          </Band>
        </motion.div>
      </div>
    </dialog>
  )
}
