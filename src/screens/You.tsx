import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  Check,
  ChevronRight,
  CircleAlert,
  CloudCheck,
  CloudOff,
  HardDrive,
  KeyRound,
  Lock,
  LogIn,
  LogOut,
  RefreshCw,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import { Band } from '../components/Band'
import { PinPad } from '../components/PinPad'
import { RollingNumber } from '../components/RollingNumber'
import { Sheet } from '../components/Sheet'
import type { WinkState } from '../data/api'
import { useWink } from '../data/store'
import { genreVars } from '../lib/genres'
import { setMotionPref, useMotionPref } from '../lib/motion'
import type { MotionPref, Profile } from '../lib/types'
import './You.css'

function reason(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'Please try again.'
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

export function You() {
  const { activeProfile: me } = useWink()
  const headRef = useRef<HTMLHeadingElement>(null)
  const shownId = useRef(me?.id)

  // Switching replaces the row that had focus, so land on the new profile's name instead of the page body.
  useEffect(() => {
    if (!me || shownId.current === me.id) return
    shownId.current = me.id
    headRef.current?.focus()
  }, [me])

  if (!me) return null
  const isChild = me.ageBand === 'child'
  const since = new Date(me.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  return (
    <div className="you">
      <header className="you__head">
        <h1 ref={headRef} className="you__name" tabIndex={-1}>
          {me.displayName}
        </h1>
        <p className="you__since">Reading with Wink since {since}</p>
      </header>
      <Profiles me={me} />
      <MotionSetting />
      <SyncStatus />
      {!isChild && <Account />}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section className="you__section" aria-labelledby={id}>
      <h2 id={id} className="you__h2">
        {title}
      </h2>
      {children}
    </section>
  )
}

function ErrorLine({ children }: { children: ReactNode }) {
  return (
    <p className="you__error" role="alert">
      <CircleAlert size={20} strokeWidth={2.25} aria-hidden="true" />
      {children}
    </p>
  )
}

function Profiles({ me }: { me: Profile }) {
  const { profiles, switchProfile } = useWink()
  const [locked, setLocked] = useState<Profile | null>(null)
  const [unlocking, setUnlocking] = useState(false)
  const [adding, setAdding] = useState(false)
  const [changingPin, setChangingPin] = useState(false)
  const isChild = me.ageBand === 'child'

  return (
    <Section title="Profiles">
      {isChild && <p className="you__note">Ask a grown-up to switch profiles.</p>}
      <ul className="you__profiles">
        {profiles.map((p) => {
          const young = p.ageBand === 'child'
          const tag = young && (
            <span className="you__tag caps" style={genreVars('young')}>
              Young reader
            </span>
          )
          if (p.id === me.id) {
            return (
              <li key={p.id}>
                <div className="you__profile" aria-current="true">
                  <span className="you__profile-name">{p.displayName}</span>
                  {tag}
                  <span className="you__profile-state">
                    <Check size={18} strokeWidth={2.5} aria-hidden="true" />
                    Current
                  </span>
                </div>
              </li>
            )
          }
          const needsPin = isChild && !young
          return (
            <li key={p.id}>
              <button
                type="button"
                className="you__profile"
                aria-label={`Switch to ${p.displayName}${young ? ', young reader' : ''}${needsPin ? ', needs PIN' : ''}`}
                onClick={() => {
                  if (!needsPin) return switchProfile(p.id)
                  setLocked(p)
                  setUnlocking(true)
                }}
              >
                <span className="you__profile-name">{p.displayName}</span>
                {tag}
                <span className="you__profile-state">
                  {needsPin ? (
                    <>
                      <Lock size={16} strokeWidth={2.25} aria-hidden="true" />
                      Needs PIN
                    </>
                  ) : (
                    <>
                      Switch
                      <ChevronRight size={18} strokeWidth={2.25} aria-hidden="true" />
                    </>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {me.ageBand === 'adult' && (
        <Band className="you__btn" onClick={() => setAdding(true)}>
          <UserPlus size={22} strokeWidth={2.25} aria-hidden="true" />
          Add a young reader
        </Band>
      )}
      {me.ageBand === 'adult' && me.parentPinHash && (
        <Band className="you__btn" onClick={() => setChangingPin(true)}>
          <KeyRound size={22} strokeWidth={2.25} aria-hidden="true" />
          Change parent PIN
        </Band>
      )}
      <UnlockSheet target={locked} open={unlocking} onClose={() => setUnlocking(false)} />
      <AddChildSheet open={adding} onClose={() => setAdding(false)} />
      <AddChildSheet changePin open={changingPin} onClose={() => setChangingPin(false)} />
    </Section>
  )
}

const MAX_TRIES = 5
const LOCK_MS = 30_000

function UnlockSheet({ target, open, onClose }: { target: Profile | null; open: boolean; onClose: () => void }) {
  const { auth, verifyParentPin, switchProfile, signOut } = useWink()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [outError, setOutError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tries, setTries] = useState(0)
  // ponytail: the lock is component state, so leaving the You tab resets it; move it into the store if kids game that.
  const [lockedUntil, setLockedUntil] = useState(0)
  const [now, setNow] = useState(0)
  const wait = Math.ceil((lockedUntil - now) / 1000)
  const pinRef = useRef<HTMLInputElement>(null)

  // After the Sheet's own effect has opened the dialog, so focus lands on the PIN rather than the close button.
  useEffect(() => {
    if (open) pinRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!lockedUntil) return
    const id = setInterval(() => {
      const t = Date.now()
      if (t >= lockedUntil) setLockedUntil(0)
      setNow(t)
    }, 1000)
    return () => clearInterval(id)
  }, [lockedUntil])

  function close() {
    setPin('')
    setError(null)
    onClose()
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!target || busy || wait > 0) return
    if (pin.length < 4) return setError('Type all four digits of the parent PIN.')
    setBusy(true)
    try {
      if (await verifyParentPin(pin)) {
        setTries(0)
        switchProfile(target.id)
        close()
      } else {
        setPin('')
        pinRef.current?.focus()
        if (tries + 1 < MAX_TRIES) {
          setTries(tries + 1)
          return setError("That PIN isn't right. Try again.")
        }
        const t = Date.now()
        setTries(0)
        setNow(t)
        setLockedUntil(t + LOCK_MS)
        setError(null)
      }
    } catch (err) {
      setError(`We couldn't check the PIN. ${reason(err)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={close} title="Parent PIN">
      <form className="you__form" onSubmit={submit} noValidate>
        <p className="you__sheet-text">A grown-up can type the parent PIN to switch to {target?.displayName ?? 'their profile'}.</p>
        <PinPad
          ref={pinRef}
          label="Parent PIN"
          value={pin}
          onChange={(v) => {
            setPin(v)
            setError(null)
          }}
          error={wait > 0 ? `That's ${MAX_TRIES} wrong tries in a row, so the PIN is paused for ${LOCK_MS / 1000} seconds.` : error}
        />
        {/* The countdown lives on the disabled band so it's visible without a live region ticking every second. */}
        <Band type="submit" className="you__btn" disabled={wait > 0}>
          {wait > 0
            ? `Try again in ${plural(wait, 'second')}`
            : busy
              ? 'Checking…'
              : `Switch to ${target?.displayName ?? 'profile'}`}
        </Band>
      </form>
      <div className="you__forgot">
        {auth.status === 'signed-in' ? (
          <>
            <p className="you__sheet-text">
              <strong>Forgot the PIN?</strong> Sign out on this device and sign back in to set a new one.
            </p>
            {outError && <ErrorLine>{outError}</ErrorLine>}
            <Band
              onClick={() => {
                setOutError(null)
                signOut().catch((err) => setOutError(`We couldn't sign you out. ${reason(err)}`))
              }}
            >
              <LogOut size={22} strokeWidth={2.25} aria-hidden="true" />
              Sign out
            </Band>
          </>
        ) : (
          <p className="you__sheet-text">
            <strong>Forgot the PIN?</strong> Wink keeps it only in this browser, so it can't be recovered here. Resetting
            it would mean clearing Wink's data in this browser, which erases the reading saved on this device too.
          </p>
        )}
      </div>
    </Sheet>
  )
}

function AddChildSheet({ open, onClose, changePin }: { open: boolean; onClose: () => void; changePin?: boolean }) {
  const { activeProfile, setParentPin, createChildProfile } = useWink()
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const pinRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const nameId = useId()
  const stage = changePin || !activeProfile?.parentPinHash ? 'pin' : 'name'

  useEffect(() => {
    if (open) (stage === 'pin' ? pinRef : nameRef).current?.focus()
  }, [open, stage])

  function close() {
    setPin('')
    setPin2('')
    setName('')
    setError(null)
    onClose()
  }

  async function attempt(task: () => Promise<void>, fallback: string) {
    setBusy(true)
    try {
      await task()
    } catch (err) {
      setError(`${fallback} ${reason(err)}`)
    } finally {
      setBusy(false)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (stage === 'pin') {
      if (pin.length < 4) return setError('Choose four digits for the PIN.')
      if (pin2 !== pin) {
        setPin2('')
        return setError("Those don't match. Type the same four digits again.")
      }
      return attempt(async () => {
        await setParentPin(pin)
        if (changePin) close()
      }, "We couldn't save the PIN.")
    }
    if (!name.trim()) return setError("Type your young reader's name to continue.")
    return attempt(async () => {
      await createChildProfile({ displayName: name.trim() })
      close()
    }, "We couldn't add your young reader.")
  }

  return (
    <Sheet open={open} onClose={close} title={changePin ? 'Change parent PIN' : 'Add a young reader'}>
      <form className="you__form" onSubmit={submit} noValidate>
        {stage === 'pin' ? (
          <>
            <p className="you__sheet-text">
              {changePin
                ? "Choose four new digits. You'll type them to leave a young reader's profile and get back to yours."
                : "First, set a parent PIN. You'll type it to leave a young reader's profile and get back to yours."}
            </p>
            <PinPad
              ref={pinRef}
              label="Choose a PIN"
              value={pin}
              onChange={(v) => {
                setPin(v)
                setError(null)
              }}
              error={pin.length < 4 ? error : null}
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
            <Band type="submit" className="you__btn">
              {busy ? 'Saving…' : 'Save PIN'}
            </Band>
          </>
        ) : (
          <>
            <div className="you__field">
              <label className="you__label" htmlFor={nameId}>
                Young reader's name
              </label>
              <p id={`${nameId}-hint`} className="you__hint">
                A first name or nickname. Their profile has no email or password.
              </p>
              <input
                ref={nameRef}
                id={nameId}
                className="you__input"
                autoComplete="off"
                maxLength={40}
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setError(null)
                }}
                aria-invalid={error ? true : undefined}
                aria-describedby={`${nameId}-hint`}
              />
            </div>
            {error && <ErrorLine>{error}</ErrorLine>}
            <Band type="submit" className="you__btn">
              {busy ? 'Adding…' : 'Add young reader'}
            </Band>
          </>
        )}
      </form>
    </Sheet>
  )
}

const MOTION: [MotionPref, string][] = [
  ['full', 'Full'],
  ['reduced', 'Reduced'],
  ['off', 'Off'],
]

function MotionSetting() {
  const pref = useMotionPref()
  const [flipped, setFlipped] = useState(false)
  const noteId = useId()

  return (
    <Section title="Motion">
      <p id={noteId} className="you__note">
        Choose how much Wink moves. Reduced keeps quick fades, and Off stops animation.
      </p>
      <div className="you__segments" role="radiogroup" aria-label="Motion" aria-describedby={noteId}>
        {MOTION.map(([value, label]) => (
          <label key={value} className={`you__segment${pref === value ? ' you__segment--on' : ''}`}>
            <input
              className="visually-hidden"
              type="radio"
              name="you-motion"
              value={value}
              checked={pref === value}
              onChange={() => {
                setMotionPref(value)
                setFlipped((f) => !f)
              }}
            />
            {label}
          </label>
        ))}
      </div>
      <Band genre="fiction" className="you__preview" progress={flipped ? 0.85 : 0.3} onClick={() => setFlipped((f) => !f)}>
        Play preview
        <span aria-hidden="true">
          p. <RollingNumber text={flipped ? '386' : '248'} />
        </span>
      </Band>
    </Section>
  )
}

function syncLine({ status, pending, error }: WinkState['sync'], storageFull: boolean): [LucideIcon, string] {
  // The shell's alert explains the fix; this line just mustn't claim everything is saved.
  if (storageFull) return [CircleAlert, 'Storage is full, so recent changes may not be kept on this device.']
  if (status === 'error') return [CircleAlert, error ?? "Couldn't sync. Try Sync now."]
  if (status === 'local-only') return [HardDrive, 'Saved on this device only']
  if (status === 'syncing') return [RefreshCw, 'Syncing your changes…']
  if (status === 'offline') return [CloudOff, `Offline. Changes will sync when you're back online${pending ? ` (${pending} waiting)` : ''}.`]
  return [CloudCheck, pending ? `${plural(pending, 'change')} waiting to sync` : 'All changes saved']
}

function SyncStatus() {
  const { auth, sync, syncNow, storageError } = useWink()
  const [Icon, line] = syncLine(sync, storageError !== null)
  const signedIn = auth.status === 'signed-in'
  const last = sync.lastSyncedAt
    ? new Date(sync.lastSyncedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null

  return (
    <Section title="Sync">
      <p className="you__status" role="status">
        <Icon size={22} strokeWidth={2} aria-hidden="true" />
        {line}
      </p>
      {signedIn && last && <p className="you__fact">Last synced {last}</p>}
      {signedIn && (
        <Band
          className="you__btn"
          disabled={sync.status === 'offline'}
          onClick={() => {
            if (sync.status !== 'syncing') void syncNow()
          }}
        >
          <RefreshCw size={22} strokeWidth={2.25} aria-hidden="true" />
          {sync.status === 'syncing' ? 'Syncing…' : 'Sync now'}
        </Band>
      )}
    </Section>
  )
}

function Account() {
  const wink = useWink()
  const { auth, sync, signOut } = wink
  const [error, setError] = useState<string | null>(null)

  if (auth.status !== 'signed-in') {
    return (
      <Section title="Account">
        <p className="you__note">
          You're using Wink without an account, so your reading is saved in this browser only. Clearing this site's data
          would erase it.
        </p>
        {wink.mode === 'cloud' && (
          <>
            <p className="you__text">
              Sign in to keep your reading on all your devices. What's on this device comes with you if your account is
              new.
            </p>
            <Band className="you__btn" onClick={() => wink.useAnAccount()}>
              <LogIn size={22} strokeWidth={2.25} aria-hidden="true" />
              Use an account
            </Band>
          </>
        )}
      </Section>
    )
  }

  return (
    <Section title="Account">
      <p className="you__text">
        Signed in as <strong>{auth.email ?? 'your account'}</strong>
      </p>
      {sync.pending > 0 && (
        <p className="you__note">
          {plural(sync.pending, 'change')} {sync.pending === 1 ? "hasn't" : "haven't"} synced yet. They stay on this
          device and sync the next time you sign in here.
        </p>
      )}
      {error && <ErrorLine>{error}</ErrorLine>}
      <Band
        className="you__btn"
        onClick={() => {
          setError(null)
          signOut().catch((e) => setError(`We couldn't sign you out. ${reason(e)}`))
        }}
      >
        <LogOut size={22} strokeWidth={2.25} aria-hidden="true" />
        Sign out
      </Band>
    </Section>
  )
}
