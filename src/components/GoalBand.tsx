import { useId, useState, type CSSProperties, type FormEvent } from 'react'
import { Check, Minus, Plus, SlidersHorizontal } from 'lucide-react'
import { useWink } from '../data/store'
import { genreVars } from '../lib/genres'
import type { GenreId, GoalUnit, Profile } from '../lib/types'
import { Band } from './Band'
import { RollingNumber } from './RollingNumber'
import { Sheet } from './Sheet'
import './GoalBand.css'

type Goal = Profile['goal']

const STEP = 5
const MAX: Record<GoalUnit, number> = { minutes: 240, pages: 200 }
const clamp = (n: number, unit: GoalUnit) => Math.min(MAX[unit], Math.max(STEP, Math.round(n / STEP) * STEP))

export function GoalBand({ done, goal, genre, kid }: { done: number; goal: Goal; genre: GenreId; kid: boolean }) {
  // Each opening remounts the sheet so the draft starts from the saved goal.
  const [sheet, setSheet] = useState({ open: false, n: 0 })
  const count = Math.round(done)
  const met = count >= goal.amount
  const unit = goal.unit === 'pages' ? 'pages' : kid ? 'minutes' : 'min'
  const fill = goal.amount > 0 ? Math.min(1, count / goal.amount) : 0

  const label = (
    <span className="goal-band__label">
      {met && <Check size={20} strokeWidth={2.5} aria-hidden="true" />}
      <span>
        {met ? 'Goal met' : 'Today'} · {count} of {goal.amount} {unit}
      </span>
      <SlidersHorizontal className="goal-band__edit" size={20} aria-hidden="true" />
    </span>
  )

  return (
    <div className="goal-band" style={genreVars(genre)}>
      <button
        type="button"
        className="goal-band__bar"
        style={{ '--goal-fill': fill } as CSSProperties}
        aria-haspopup="dialog"
        onClick={() => setSheet((s) => ({ open: true, n: s.n + 1 }))}
      >
        {label}
        <span className="goal-band__fill" aria-hidden="true">
          {label}
        </span>
        <span className="visually-hidden">, change daily goal</span>
      </button>
      {sheet.n > 0 && (
        <GoalSheet
          key={sheet.n}
          open={sheet.open}
          onClose={() => setSheet((s) => ({ ...s, open: false }))}
          goal={goal}
          genre={genre}
        />
      )}
    </div>
  )
}

type GoalSheetProps = { open: boolean; onClose: () => void; goal: Goal; genre: GenreId }

function GoalSheet({ open, onClose, goal, genre }: GoalSheetProps) {
  const { updateGoal } = useWink()
  const [unit, setUnit] = useState(goal.unit)
  const [amount, setAmount] = useState(goal.amount)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const unitId = useId()
  const amountId = useId()

  async function save(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await updateGoal({ unit, amount })
      onClose()
    } catch {
      setError("Your goal didn't save. Check your connection and try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Daily goal" genre={genre}>
      <form className="goal-band__form" onSubmit={save}>
        <div>
          <p id={unitId} className="goal-band__prompt">
            Count my reading in
          </p>
          <div className="goal-band__units" role="group" aria-labelledby={unitId}>
            {(['minutes', 'pages'] as const).map((u) => (
              <Band
                key={u}
                genre={unit === u ? genre : 'unclassified'}
                aria-pressed={unit === u}
                onClick={() => {
                  setUnit(u)
                  setAmount((a) => clamp(a, u))
                }}
              >
                {unit === u && <Check size={20} strokeWidth={2.5} aria-hidden="true" />}
                {u === 'minutes' ? 'Minutes' : 'Pages'}
              </Band>
            ))}
          </div>
        </div>

        <div>
          <p id={amountId} className="goal-band__prompt">
            Every day
          </p>
          <div className="goal-band__stepper" role="group" aria-labelledby={amountId}>
            <button
              type="button"
              className="goal-band__step"
              aria-label={`${STEP} fewer ${unit}`}
              aria-disabled={amount <= STEP}
              onClick={() => setAmount((a) => clamp(a - STEP, unit))}
            >
              <Minus size={22} strokeWidth={2.25} aria-hidden="true" />
            </button>
            <output className="goal-band__amount">
              <RollingNumber text={String(amount)} /> {unit}
            </output>
            <button
              type="button"
              className="goal-band__step"
              aria-label={`${STEP} more ${unit}`}
              aria-disabled={amount >= MAX[unit]}
              onClick={() => setAmount((a) => clamp(a + STEP, unit))}
            >
              <Plus size={22} strokeWidth={2.25} aria-hidden="true" />
            </button>
          </div>
        </div>

        <Band type="submit" genre={genre} disabled={saving}>
          Save goal
        </Band>
        {error && (
          <p className="goal-band__error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  )
}
