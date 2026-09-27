import { useEffect, useState } from 'react'
import { MotionConfig } from 'motion/react'
import { BookOpen, Compass, Library, User, Users, type LucideIcon } from 'lucide-react'
import { RollingNumber } from './components/RollingNumber'
import { WinkMark } from './components/WinkMark'
import { useWink } from './data/store'
import { useMotionPref } from './lib/motion'
import { sessionMinutes } from './lib/progress'
import { useRoute, type Route } from './lib/route'
import type { ReadingSession } from './lib/types'
import { Home } from './screens/Home'
import { Session } from './screens/Session'
import { Streak } from './screens/Streak'
import { Welcome } from './screens/Welcome'
import { You } from './screens/You'
import './App.css'

const TABS: { route: Route; label: string; Icon: LucideIcon }[] = [
  { route: 'home', label: 'Home', Icon: BookOpen },
  { route: 'library', label: 'Library', Icon: Library },
  { route: 'discover', label: 'Discover', Icon: Compass },
  { route: 'friends', label: 'Friends', Icon: Users },
  { route: 'you', label: 'You', Icon: User },
]

const SOON: Partial<Record<Route, string>> = {
  library: 'Your library is on its way. Every book you finish is already being kept for it.',
  discover: "Recommendations are coming. They'll be built from the books you rate.",
  friends: 'Reading with friends is coming later.',
}

export default function App() {
  const pref = useMotionPref()
  const { ready, auth, needsOnboarding } = useWink()
  const recovering = auth.status === 'signed-in' && auth.recovering
  // Keep Welcome up after a password reset until the reader leaves its "password updated" page.
  const [held, setHeld] = useState(false)
  if (recovering && !held) setHeld(true)
  return (
    <MotionConfig
      reducedMotion={pref === 'full' ? 'never' : 'always'}
      transition={pref === 'off' ? { duration: 0 } : undefined}
    >
      {!ready || auth.status === 'loading' ? (
        <div className="app-splash" aria-busy="true">
          <WinkMark size={72} title="Loading Wink" />
        </div>
      ) : auth.status === 'signed-out' || needsOnboarding || recovering || held ? (
        <Welcome onDone={() => setHeld(false)} />
      ) : (
        <Shell />
      )}
    </MotionConfig>
  )
}

function Shell() {
  const { activeProfile, activeSession, books, storageError } = useWink()
  const [route, go] = useRoute()
  const child = activeProfile?.ageBand === 'child'
  const hideFriends = route === 'friends' && child
  const redirect = hideFriends || (route === 'session' && !activeSession)
  const screen: Route = hideFriends ? 'home' : route
  const full = screen === 'session'
  // Home's own band already says Resume, so the banner only follows the reader elsewhere.
  const banner = !full && screen !== 'home' && activeSession
  // The streak page belongs to Home: Home's tab stays current and the title names the page.
  const tab: Route = screen === 'streak' ? 'home' : screen
  const label = screen === 'streak' ? 'Your year' : TABS.find((t) => t.route === screen)?.label

  useEffect(() => {
    // Replace, not push, so Back never lands on a route that bounces forward again.
    if (redirect) go('home', { replace: true })
  }, [redirect, go])

  useEffect(() => {
    if (full) return // the session screen keeps the live timer in the title
    document.title = screen === 'home' ? 'Wink' : `${label ?? 'Reading'} · Wink`
    scrollTo(0, 0)
    return () => {
      document.title = 'Wink'
    }
  }, [screen, label, full])

  return (
    <div className={`app${full ? ' app--full' : ''}${banner ? ' app--banner' : ''}`}>
      <main className="app__main">
        {storageError && (
          <p className="app-alert" role="alert">
            {storageError}
          </p>
        )}
        {screen === 'home' ? (
          <Home />
        ) : screen === 'session' ? (
          <Session />
        ) : screen === 'streak' ? (
          <Streak />
        ) : screen === 'you' ? (
          <You />
        ) : (
          <div className="app-soon">
            <div className="app-soon__band">
              <h1 className="app-soon__title">{label}</h1>
              <p className="app-soon__text">{SOON[screen]}</p>
            </div>
          </div>
        )}
      </main>

      {banner && (
        <SessionBanner
          session={activeSession}
          title={books.find((b) => b.id === activeSession.shelfItemId)?.title ?? 'your book'}
        />
      )}

      {!full && (
        <nav className="app-nav" aria-label="Main">
          <span className="app-nav__mark">
            <WinkMark />
          </span>
          <ul className="app-nav__list">
            {TABS.filter((t) => !(child && t.route === 'friends')).map(({ route: r, label: l, Icon }) => (
              <li key={r}>
                <a
                  className="app-nav__tab"
                  href={r === 'home' ? '#/' : `#/${r}`}
                  aria-current={r === tab ? 'page' : undefined}
                >
                  <Icon size={24} strokeWidth={2} aria-hidden="true" />
                  <span>{l}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  )
}

function SessionBanner({ session, title }: { session: ReadingSession; title: string }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const m = sessionMinutes(session, now)

  return (
    <a className="app-banner" href="#/session">
      <span className="app-banner__what">
        <span className="caps">Reading</span>{' '}
        <span className="app-banner__title">{title}</span>{' '}
        <span aria-hidden="true">·</span>{' '}
        <RollingNumber className="app-banner__time" text={`${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`} />
      </span>{' '}
      <span className="app-banner__go">Return</span>
    </a>
  )
}
