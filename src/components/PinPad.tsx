import { useId, type Ref } from 'react'
import { CircleAlert } from 'lucide-react'
import './PinPad.css'

type PinPadProps = {
  label: string
  value: string
  onChange: (pin: string) => void
  error?: string | null
  autoFocus?: boolean
  ref?: Ref<HTMLInputElement>
}

const DOT = '•'

/** Keeps the digits behind the dots still in the field, then adds any newly typed or pasted digits. */
function nextPin(pin: string, field: string): string {
  return (pin.slice(0, field.split(DOT).length - 1) + field.replace(/\D/g, '')).slice(0, 4)
}

/** A 4-digit PIN field: one numeric input drawn as four cells, so paste, backspace and screen readers work natively. */
export function PinPad({ label, value, onChange, error, autoFocus, ref }: PinPadProps) {
  const id = useId()

  return (
    <div className="pinpad">
      <label className="pinpad__label" htmlFor={id}>
        {label}
      </label>
      <div className="pinpad__field">
        {/* A text field that only ever holds dots: browsers never offer to save it, and screen readers hear dots and a count, never digits. */}
        <input
          ref={ref}
          id={id}
          className="pinpad__input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus={autoFocus}
          value={DOT.repeat(value.length)}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-count${error ? ` ${id}-error` : ''}`}
          onChange={(e) => onChange(nextPin(value, e.target.value))}
        />
        <span className="pinpad__cells" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`pinpad__cell${i < value.length ? ' pinpad__cell--filled' : ''}${i === value.length ? ' pinpad__cell--next' : ''}`}
            />
          ))}
        </span>
      </div>
      <span id={`${id}-count`} className="visually-hidden">
        {value.length} of 4 digits
      </span>
      {error && (
        <p id={`${id}-error`} className="pinpad__error" role="alert">
          <CircleAlert size={18} strokeWidth={2.25} aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  )
}
