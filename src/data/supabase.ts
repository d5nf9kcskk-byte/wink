import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// PKCE answers in the query (?code=), which leaves the app's #/ routes alone.
export const supabase =
  url && anonKey
    ? createClient(url, anonKey, { auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true } })
    : null

export const mode: 'local' | 'cloud' = supabase ? 'cloud' : 'local'

/** Welcome's unfinished answers, which a sign-in link carries because a new tab starts with empty sessionStorage. */
export interface Pending {
  childSetup: boolean
  ageBand: 'teen' | 'adult' | null
}

export const EXPIRED_LINK = 'That sign-in link has expired or was already used. Ask for a new one.'

/** Plain copy for a sign-in failure. Raw descriptions are never shown: anyone can put text in a link. */
export function authMessage(error: string | null, code: string | null, description: string | null): string {
  if (/otp_expired|flow_state/.test(code ?? '') || /expired|already been used|invalid flow/i.test(description ?? ''))
    return EXPIRED_LINK
  if (error === 'access_denied') return 'Google sign-in was cancelled.'
  if (/fetch|network|load failed/i.test(description ?? ''))
    return "Couldn't reach Wink to finish signing in. Check your connection, then ask for a new link."
  const name = (code || error || '').replace(/[^a-z]+/gi, ' ').trim().toLowerCase().slice(0, 40)
  return name ? `Sign-in didn't finish (${name}). Try again.` : "Sign-in didn't finish. Try again."
}

/** Where a sign-in link returns to, with the pending answers in its query. */
export function returnUrl(base: string, pending: Pending): string {
  const next = new URL(base)
  if (pending.childSetup) next.searchParams.set('setup', 'child')
  if (pending.ageBand) next.searchParams.set('age', pending.ageBand)
  return next.href
}

type Arrival = Pending & { authError: string | null; code: boolean; cleaned: string | null }

const OURS = ['error', 'error_code', 'error_description', 'setup', 'age']
const failed = (p: URLSearchParams) => p.has('error') || p.has('error_code') || p.has('error_description')

/**
 * Reads what a sign-in redirect left in the address: an auth error (query, or the legacy #error= hash) and the
 * pending answers. `cleaned` is the address without them, keeping Supabase's ?code and the #/ route; null if unchanged.
 */
export function readArrival(href: string): Arrival {
  const next = new URL(href)
  const query = next.searchParams
  const hash = new URLSearchParams(next.hash.slice(1))
  const source = failed(query) ? query : failed(hash) ? hash : null
  const age = query.get('age')
  const arrival: Omit<Arrival, 'cleaned'> = {
    authError: source && authMessage(source.get('error'), source.get('error_code'), source.get('error_description')),
    childSetup: query.get('setup') === 'child',
    ageBand: age === 'teen' || age === 'adult' ? age : null,
    code: query.has('code'),
  }
  const found = OURS.filter((k) => query.has(k))
  found.forEach((k) => query.delete(k))
  if (failed(hash)) next.hash = ''
  return { ...arrival, cleaned: found.length || failed(hash) ? next.href : null }
}
