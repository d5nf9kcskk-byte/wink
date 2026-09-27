import { useEffect, useId, useRef, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { ArrowLeft, ArrowRight, CircleAlert, Eye, EyeOff } from 'lucide-react'
import { Band } from '../components/Band'
import { PinPad } from '../components/PinPad'
import { WinkMark } from '../components/WinkMark'
import { useWink } from '../data/store'
import { EASE_OUT, dur, useMotionPref } from '../lib/motion'
import './Welcome.css'

// sessionStorage so the answers survive an OAuth or magic-link redirect in this tab.
const CHILD_SETUP = 'wink.pendingChildSetup'
const AGE_BAND = 'wink.pendingAgeBand'
const memory: Record<string, string | null> = {}

function readFlag(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return memory[key] ?? null
  }
}

function writeFlag(key: string, value: string | null) {
  memory[key] = value
  try {
    if (value === null) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, value)
  } catch {
    /* storage blocked: the in-memory copy covers this page */
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function problem(e: unknown, fallback: string): string {
  return `${fallback} ${e instanceof Error && e.message ? e.message : 'Please try again.'}`
}

function subscribeOnline(cb: () => void) {
  addEventListener('online', cb)
  addEventListener('offline', cb)
  return () => {
    removeEventListener('online', cb)
    removeEventListener('offline', cb)
  }
}

/** `onDone` fires when the reader leaves the "password updated" page, so App can stop holding Welcome open. */
export function Welcome({ onDone }: { onDone?: () => void }) {
  const { auth } = useWink()
  const recovering = auth.status === 'signed-in' && auth.recovering
  const [updated, setUpdated] = useState(false)
  const [wasRecovering, setWasRecovering] = useState(recovering)
  // updatePassword ends recovery; catching that flip during render keeps the success page up with no flash of onboarding.
  if (recovering !== wasRecovering) {
    setWasRecovering(recovering)
    if (!recovering && auth.status === 'signed-in') setUpdated(true)
  }
  if (updated || recovering)
    return (
      <NewPassword
        updated={updated}
        onContinue={() => {
          setUpdated(false)
          onDone?.()
        }}
      />
    )
  return auth.status === 'signed-in' || auth.status === 'local' ? <Onboarding /> : <SignedOut />
}

type Dir = -1 | 0 | 1

function useSteps<S extends string>(first: S | (() => S)) {
  const [step, setStep] = useState<S>(first)
  const [dir, setDir] = useState<Dir>(0)
  const [error, setError] = useState<string | null>(null)
  const go = (next: S, d: Dir = 1) => {
    setStep(next)
    setDir(d)
    setError(null)
  }
  return { step, dir, go, error, setError }
}

type Step = 'intro' | 'age' | 'child' | 'grownup' | 'signin' | 'sent'

function SignedOut() {
  const wink = useWink()
  const { step, dir, go, error, setError } = useSteps<Step>(() => (readFlag(AGE_BAND) ? 'signin' : 'intro'))
  const [busy, setBusy] = useState(false)
  const [year, setYear] = useState('')
  const [grownUp, setGrownUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [withPassword, setWithPassword] = useState(false)
  const [creating, setCreating] = useState(false)
  const [reveal, setReveal] = useState(false)
  const [sent, setSent] = useState<'link' | 'reset' | 'confirm'>('link')
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)
  const childSetup = readFlag(CHILD_SETUP) === '1'
  const emailRef = useRef<HTMLInputElement>(null)

  async function run(task: () => Promise<void>, fallback: string) {
    if (busy) return
    setBusy(true)
    setError(null)
    if (wink.authError) wink.clearAuthError()
    try {
      await task()
    } catch (e) {
      setError(problem(e, fallback))
    } finally {
      setBusy(false)
    }
  }

  function sendTo(kind: typeof sent) {
    setSent(kind)
    go('sent')
  }

  function submit() {
    const address = email.trim()
    switch (step) {
      case 'intro':
        return go('age')
      case 'age': {
        const now = new Date().getFullYear()
        const born = Number(year)
        if (!/^\d{4}$/.test(year)) return setError('Type your birth year as four digits, like 1990.')
        if (born > now || born < now - 120) return setError(`Check the year. It should be between ${now - 120} and ${now}.`)
        writeFlag(CHILD_SETUP, null)
        // A year alone can't tell 12 from 13, so anyone who might still be 12 starts with a grown-up.
        if (born >= now - 13) {
          writeFlag(AGE_BAND, null)
          return go('child')
        }
        writeFlag(AGE_BAND, now - born < 18 ? 'teen' : 'adult')
        return go('signin')
      }
      case 'child':
        return go('grownup')
      case 'grownup':
        writeFlag(CHILD_SETUP, '1')
        writeFlag(AGE_BAND, 'adult')
        return go('signin')
      case 'sent':
        return go('signin', -1)
      case 'signin':
        if (wink.mode === 'local') return wink.continueOnThisDevice()
        if (!EMAIL.test(address)) return setError('Type your email address, like name@example.com.')
        if (!withPassword) return run(async () => {
          await wink.signInWithMagicLink(address)
          sendTo('link')
        }, "We couldn't send the link.")
        if (!password) return setError('Type your password.')
        if (creating) {
          if (password.length < 8) return setError('Use at least 8 characters for your password.')
          return run(async () => {
            // Without confirmation the store signs the reader in and App moves on by itself.
            if ((await wink.signUpWithPassword(address, password)).needsConfirmation) sendTo('confirm')
          }, "We couldn't create your account.")
        }
        return run(() => wink.signInWithPassword(address, password), "We couldn't sign you in.")
    }
  }

  function forgot() {
    const address = email.trim()
    if (!EMAIL.test(address)) return setError('Type your email address above, then choose Forgot password.')
    run(async () => {
      await wink.resetPassword(address)
      sendTo('reset')
    }, "We couldn't send the reset email.")
  }

  const back: Partial<Record<Step, Step>> = {
    age: 'intro',
    child: 'age',
    grownup: 'child',
    signin: childSetup ? 'grownup' : 'age',
    sent: 'signin',
  }
  const backTo = back[step]

  // A failed or expired sign-in lands here from a redirect, on the sign-in step or, in a fresh tab, the first one.
  const authAlert = wink.authError && (
    <div className="welcome__alert">
      <ErrorLine>{wink.authError}</ErrorLine>
      <button
        type="button"
        className="welcome__link"
        onClick={() => {
          wink.clearAuthError()
          if (step === 'intro') go('age')
          else emailRef.current?.focus()
        }}
      >
        Try again
      </button>
    </div>
  )

  let action: string
  let page: ReactNode
  switch (step) {
    case 'intro':
      action = 'Get started'
      page = (
        <>
          <Title>Every page counts.</Title>
          <p className="welcome__body">Time your reading, log your pages, and watch it all add up.</p>
          {authAlert}
        </>
      )
      break
    case 'age':
      action = 'Continue'
      page = (
        <Field
          question
          label="What year were you born?"
          hint="Four digits. We use it to set Wink up for your age, and we don't keep it."
          className="welcome__input--year"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          autoFocus
          value={year}
          onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
          error={error}
        />
      )
      break
    case 'child':
      action = "I'm the grown-up"
      page = (
        <>
          <Title>Young readers start with a grown-up.</Title>
          <p className="welcome__body">
            Ask a parent or guardian to set up Wink. They make the account, then add a reading profile just for you. Wink
            never asks for your email.
          </p>
          <button type="button" className="welcome__link" onClick={() => go('age', -1)}>
            Go back
          </button>
        </>
      )
      break
    case 'grownup':
      action = 'Continue'
      page = (
        <>
          <Title>Your account comes first.</Title>
          <p className="welcome__body">
            Sign in with your own email. Next you'll add your young reader's profile. It has no email or password of its
            own.
          </p>
          <label className="welcome__check">
            <input type="checkbox" checked={grownUp} onChange={(e) => setGrownUp(e.target.checked)} />
            <span>I'm 18 or older, and I'm this young reader's parent or guardian.</span>
          </label>
        </>
      )
      break
    case 'sent':
      action = sent === 'reset' ? 'Back to sign in' : 'Use a different email'
      page = (
        <>
          <Title>{sent === 'confirm' ? 'Check your email to confirm your account.' : 'Check your inbox.'}</Title>
          <p className="welcome__body">
            {sent === 'link' && (
              <>
                We sent a sign-in link to <strong>{email.trim()}</strong>. Open it in this browser to continue.
              </>
            )}
            {sent === 'reset' && (
              <>
                We sent a password reset link to <strong>{email.trim()}</strong>. Open it in this browser to sign in.
              </>
            )}
            {sent === 'confirm' && (
              <>
                We sent a link to <strong>{email.trim()}</strong>.
              </>
            )}
          </p>
          <p className="welcome__hint">Nothing there after a few minutes? Check your spam folder.</p>
        </>
      )
      break
    case 'signin':
      if (wink.mode === 'local') {
        action = 'Continue on this device'
        page = (
          <>
            <Title>Your reading stays on this device.</Title>
            <p className="welcome__body">
              This copy of Wink isn't connected to an account service yet, so everything you log is saved in this
              browser only.
            </p>
          </>
        )
        break
      }
      action = busy ? 'One moment…' : withPassword ? (creating ? 'Create account' : 'Sign in') : 'Email me a sign-in link'
      page = (
        <>
          <Title>{withPassword && creating ? 'Create your account.' : 'Sign in to Wink.'}</Title>
          <p className="welcome__body">
            {childSetup
              ? "Use your own email. You'll add your young reader next."
              : 'New here? The same steps create your account.'}
          </p>
          {authAlert}
          {!online && (
            <div className="welcome__offline">
              <p className="welcome__hint">You're offline. Sign in once you're back online, or start on this device for now.</p>
              <button type="button" className="welcome__link" onClick={() => wink.continueOnThisDevice()}>
                Continue on this device
              </button>
            </div>
          )}
          <Band className="welcome__google" onClick={() => run(() => wink.signInWithGoogle(), "We couldn't open Google sign-in.")}>
            Continue with Google
          </Band>
          <p className="welcome__or">or</p>
          {withPassword && (
            <fieldset className="welcome__switch">
              <legend className="visually-hidden">Do you have an account?</legend>
              {[false, true].map((c) => (
                <label key={String(c)}>
                  <input
                    className="visually-hidden"
                    type="radio"
                    name="welcome-account"
                    checked={creating === c}
                    onChange={() => {
                      setCreating(c)
                      setError(null)
                    }}
                  />
                  {c ? 'Create account' : 'Sign in'}
                </label>
              ))}
            </fieldset>
          )}
          <Field
            ref={emailRef}
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {withPassword && (
            <Field
              label="Password"
              hint={creating ? 'At least 8 characters.' : undefined}
              type={reveal ? 'text' : 'password'}
              autoComplete={creating ? 'new-password' : 'current-password'}
              className="welcome__input--secret"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            >
              <Reveal on={reveal} onToggle={() => setReveal(!reveal)} />
            </Field>
          )}
          {error && <ErrorLine>{error}</ErrorLine>}
          <div className="welcome__links">
            {withPassword && !creating && (
              <button type="button" className="welcome__link" onClick={forgot}>
                Forgot password?
              </button>
            )}
            <button
              type="button"
              className="welcome__link"
              onClick={() => {
                setWithPassword(!withPassword)
                setError(null)
              }}
            >
              {withPassword ? 'Email me a link instead' : 'Use a password instead'}
            </button>
          </div>
        </>
      )
      break
  }

  return (
    <Cover
      step={step}
      dir={dir}
      tall={step === 'intro'}
      onBack={backTo && (() => go(backTo, -1))}
      action={action}
      actionDisabled={step === 'grownup' && !grownUp}
      onSubmit={submit}
    >
      {page}
    </Cover>
  )
}

/** After a reset link: choose the new password, then confirm it took. */
function NewPassword({ updated, onContinue }: { updated: boolean; onContinue: () => void }) {
  const { auth, updatePassword } = useWink()
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [reveal, setReveal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const email = auth.status === 'signed-in' ? auth.email : null

  async function submit() {
    if (busy) return
    if (password.length < 8) return setError('Use at least 8 characters for your new password.')
    if (again !== password) return setError("Those passwords don't match. Type the same one in both boxes.")
    setBusy(true)
    setError(null)
    try {
      await updatePassword(password)
    } catch (e) {
      setError(problem(e, "We couldn't update your password."))
    } finally {
      setBusy(false)
    }
  }

  if (updated)
    return (
      <Cover step="updated" dir={1} action="Continue" onSubmit={onContinue}>
        <Title>Your password is updated.</Title>
        <p className="welcome__body">Use it the next time you sign in to Wink.</p>
      </Cover>
    )

  const secret = { type: reveal ? 'text' : 'password', autoComplete: 'new-password', className: 'welcome__input--secret' }
  return (
    <Cover step="password" dir={0} action={busy ? 'One moment…' : 'Save new password'} onSubmit={submit}>
      <Title>Choose a new password.</Title>
      <p className="welcome__body">
        {email ? (
          <>
            For <strong>{email}</strong>. You'll use it the next time you sign in.
          </>
        ) : (
          "You'll use it the next time you sign in."
        )}
      </p>
      {/* Lets password managers file the new password under the right account. */}
      {email && <input type="email" autoComplete="username" value={email} readOnly hidden />}
      <Field
        label="New password"
        hint="At least 8 characters."
        autoFocus
        {...secret}
        value={password}
        onChange={(e) => {
          setPassword(e.target.value)
          setError(null)
        }}
      >
        <Reveal on={reveal} onToggle={() => setReveal(!reveal)} plural />
      </Field>
      <Field
        label="Type it again"
        {...secret}
        value={again}
        onChange={(e) => {
          setAgain(e.target.value)
          setError(null)
        }}
      />
      {error && <ErrorLine>{error}</ErrorLine>}
    </Cover>
  )
}

function Reveal({ on, onToggle, plural }: { on: boolean; onToggle: () => void; plural?: boolean }) {
  return (
    <button
      type="button"
      className="welcome__reveal"
      aria-label={plural ? 'Show passwords' : 'Show password'}
      aria-pressed={on}
      onClick={onToggle}
    >
      {on ? <EyeOff size={22} aria-hidden="true" /> : <Eye size={22} aria-hidden="true" />}
    </button>
  )
}

type OnboardStep = 'name' | 'pin' | 'child'

function Onboarding() {
  const wink = useWink()
  const { step, dir, go, error, setError } = useSteps<OnboardStep>('name')
  const [childSetup] = useState(() => readFlag(CHILD_SETUP) === '1')
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [childName, setChildName] = useState('')

  async function finish() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await wink.createOwnProfile({ displayName: name.trim(), ageBand: readFlag(AGE_BAND) === 'teen' ? 'teen' : 'adult' })
      writeFlag(CHILD_SETUP, null)
      writeFlag(AGE_BAND, null)
      if (childSetup) {
        await wink.setParentPin(pin)
        wink.switchProfile((await wink.createChildProfile({ displayName: childName.trim() })).id)
      }
    } catch (e) {
      setError(problem(e, "We couldn't finish setting up."))
    } finally {
      setBusy(false)
    }
  }

  function submit() {
    if (step === 'name') {
      if (!name.trim()) return setError('Type a name or nickname to continue.')
      return childSetup ? go('pin') : finish()
    }
    if (step === 'pin') {
      if (pin.length < 4) return setError('Choose four digits for the PIN.')
      if (pin2 !== pin) {
        setPin2('')
        return setError("Those don't match. Type the same four digits again.")
      }
      return go('child')
    }
    if (!childName.trim()) return setError("Type your young reader's name to continue.")
    finish()
  }

  const done = busy ? 'Setting up…' : 'Finish setup'
  let action: string
  let page: ReactNode
  switch (step) {
    case 'name':
      action = childSetup ? 'Continue' : done
      page = (
        <Field
          question
          label="What should we call you?"
          hint="Your first name or a nickname is plenty."
          autoComplete="given-name"
          maxLength={40}
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={error}
        />
      )
      break
    case 'pin':
      action = 'Continue'
      page = (
        <>
          <Title>Set a parent PIN.</Title>
          <p className="welcome__body">
            You'll type these four digits to leave your young reader's profile and get back to yours. Pick something
            they won't guess.
          </p>
          <PinPad
            label="Choose a PIN"
            value={pin}
            onChange={(v) => {
              setPin(v)
              setError(null)
            }}
            error={pin.length < 4 ? error : null}
            autoFocus
          />
          <PinPad
            label="Type it again"
            value={pin2}
            onChange={(v) => {
              setPin2(v)
              setError(null)
            }}
            error={pin.length === 4 ? error : null}
          />
        </>
      )
      break
    case 'child':
      action = done
      page = (
        <Field
          question
          label="What's your young reader's name?"
          hint="A first name or nickname is all Wink needs."
          autoComplete="off"
          maxLength={40}
          autoFocus
          value={childName}
          onChange={(e) => setChildName(e.target.value)}
          error={error}
        />
      )
      break
  }

  const back: Partial<Record<OnboardStep, OnboardStep>> = { pin: 'name', child: 'pin' }
  const backTo = back[step]

  return (
    <Cover step={step} dir={dir} onBack={backTo && (() => go(backTo, -1))} action={action} onSubmit={submit}>
      {page}
    </Cover>
  )
}

type CoverProps = {
  step: string
  dir: Dir
  tall?: boolean
  onBack?: () => void
  action: string
  actionDisabled?: boolean
  onSubmit: () => void
  children: ReactNode
}

function Cover({ step, dir, tall, onBack, action, actionDisabled, onSubmit, children }: CoverProps) {
  const pref = useMotionPref()
  const pageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const page = pageRef.current
    if (dir === 0 || !page || page.contains(document.activeElement)) return
    page.querySelector('h1')?.focus()
  }, [step, dir])

  const enter = dir === 0 || pref === 'off' ? false : pref === 'full' ? { x: 32 * dir, opacity: 0 } : { opacity: 0 }

  return (
    <main className={`welcome${tall ? ' welcome--tall' : ''}`}>
      <div className="welcome__cover on-paper">
        <div className="welcome__top">
          {onBack && (
            <button type="button" className="welcome__back" onClick={onBack} aria-label="Back">
              <ArrowLeft size={24} strokeWidth={2.25} aria-hidden="true" />
            </button>
          )}
          <span className="welcome__brand">
            <WinkMark size={tall ? 96 : 44} title={null} />
            Wink
          </span>
        </div>
        <form
          className="welcome__form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit()
          }}
        >
          <motion.div
            key={step}
            ref={pageRef}
            className="welcome__page"
            initial={enter}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: dur(pref, 0.56), ease: EASE_OUT }}
          >
            {children}
          </motion.div>
          <Band genre="fiction" size="hero" type="submit" className="welcome__action" disabled={actionDisabled}>
            {action}
            <ArrowRight size={28} strokeWidth={2.25} aria-hidden="true" />
          </Band>
        </form>
      </div>
    </main>
  )
}

function Title({ children }: { children: ReactNode }) {
  return (
    <h1 className="welcome__title" tabIndex={-1}>
      {children}
    </h1>
  )
}

function ErrorLine({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="welcome__error" role="alert">
      <CircleAlert size={20} strokeWidth={2.25} aria-hidden="true" />
      {children}
    </p>
  )
}

type FieldProps = {
  label: string
  /** Renders the label as the page's heading: the question is the title. */
  question?: boolean
  hint?: string
  error?: string | null
  children?: ReactNode
} & ComponentProps<'input'>

function Field({ label, question, hint, error, children, className, ...input }: FieldProps) {
  const id = useId()
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
  const labelEl = (
    <label htmlFor={id} className={question ? undefined : 'welcome__label'}>
      {label}
    </label>
  )
  return (
    <div className="welcome__field">
      {question ? <h1 className="welcome__title">{labelEl}</h1> : labelEl}
      {hint && (
        <p id={`${id}-hint`} className="welcome__hint">
          {hint}
        </p>
      )}
      <div className="welcome__control">
        <input
          id={id}
          className={`welcome__input ${className ?? ''}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...input}
        />
        {children}
      </div>
      {error && <ErrorLine id={`${id}-error`}>{error}</ErrorLine>}
    </div>
  )
}
