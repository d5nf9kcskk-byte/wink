import { useId } from 'react'
import { Star } from 'lucide-react'
import './StarRating.css'

const starsLabel = (v: number) => `${v} ${v === 1 ? 'star' : 'stars'}`

/** Five stars in half steps: a native radio group of 0.5–5, so arrow keys and screen readers work for free. Draws in currentColor. */
export function StarRating({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number) => void }) {
  const name = useId()
  return (
    <fieldset className="starrating">
      <legend className="starrating__legend">{label}</legend>
      <div className="starrating__stars">
        {[1, 2, 3, 4, 5].map((n) => {
          const fill = value === null ? 0 : Math.max(0, Math.min(1, value - n + 1))
          return (
            <span key={n} className="starrating__star" data-fill={fill === 1 ? 'full' : fill === 0.5 ? 'half' : 'none'}>
              <Star className="starrating__icon" size={44} strokeWidth={1.75} aria-hidden="true" />
              <Star className="starrating__icon starrating__fill" size={44} strokeWidth={1.75} fill="currentColor" aria-hidden="true" />
              {[n - 0.5, n].map((v, i) => (
                <label key={v} className={`starrating__half starrating__half--${i ? 'right' : 'left'}`}>
                  <input
                    type="radio"
                    className="visually-hidden"
                    name={name}
                    value={v}
                    checked={value === v}
                    onChange={() => onChange(v)}
                    aria-label={starsLabel(v)}
                  />
                </label>
              ))}
            </span>
          )
        })}
      </div>
      <p className="starrating__value">{value === null ? 'No rating yet' : `${starsLabel(value)} out of 5`}</p>
    </fieldset>
  )
}
