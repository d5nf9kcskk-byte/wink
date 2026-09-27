import { useCallback, useSyncExternalStore } from 'react'

// Hash routes keep deep links working on GitHub Pages without a 404 fallback.
export type Route = 'home' | 'library' | 'discover' | 'friends' | 'you' | 'session' | 'streak'
const ROUTES: Route[] = ['home', 'library', 'discover', 'friends', 'you', 'session', 'streak']

function read(): Route {
  const r = location.hash.replace(/^#\/?/, '').split(/[?/]/)[0] as Route
  return ROUTES.includes(r) ? r : 'home'
}

function subscribe(cb: () => void) {
  addEventListener('hashchange', cb)
  return () => removeEventListener('hashchange', cb)
}

export function useRoute(): [Route, (r: Route, opts?: { replace?: boolean }) => void] {
  const route = useSyncExternalStore(subscribe, read, () => 'home' as const)
  const go = useCallback((r: Route, opts?: { replace?: boolean }) => {
    const hash = r === 'home' ? '#/' : `#/${r}`
    if (opts?.replace) location.replace(hash)
    else location.hash = hash
  }, [])
  return [route, go]
}
