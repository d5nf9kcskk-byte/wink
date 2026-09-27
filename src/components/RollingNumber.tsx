import './RollingNumber.css'

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

/**
 * Rolls each digit of `text` into place like a counter wheel; other characters stay put.
 * Each slot takes its current digit's width, so proportional figures keep their natural spacing. Speed follows the Motion setting via --dur tokens.
 */
export function RollingNumber({ text, className }: { text: string; className?: string }) {
  return (
    <span className={`roll ${className ?? ''}`}>
      <span className="visually-hidden">{text}</span>
      <span className="roll__glyphs" aria-hidden="true">
        {[...text].map((ch, i) =>
          /\d/.test(ch) ? (
            <span className="roll__slot" key={`${text.length}-${i}`}>
              <span className="roll__sizer">{ch}</span>
              <span className="roll__reel" style={{ transform: `translateY(${-Number(ch) * 10}%)` }}>
                {DIGITS.map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </span>
            </span>
          ) : (
            <span className="roll__static" key={`${text.length}-${i}`}>
              {ch}
            </span>
          ),
        )}
      </span>
    </span>
  )
}
