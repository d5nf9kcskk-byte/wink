import { useSyncExternalStore } from 'react'
import type { MotionPref } from './types'

const KEY = 'wink.motion'
const reduceQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null
const listeners = new Set<() => void>()

function stored(): MotionPref | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'full' || v === 'reduced' || v === 'off' ? v : null
  } catch {
    return null
  }
}

/** The effective setting: the reader's choice, else Reduced when the OS asks for less motion, else Full. */
export function getMotionPref(): MotionPref {
  return stored() ?? (reduceQuery?.matches ? 'reduced' : 'full')
}

function apply() {
  document.documentElement.dataset.motion = getMotionPref()
  listeners.forEach((l) => l())
}

export function setMotionPref(pref: MotionPref) {
  try {
    localStorage.setItem(KEY, pref)
  } catch {
    /* private mode: the choice lasts this visit only */
  }
  apply()
}

export function initMotion() {
  apply()
  reduceQuery?.addEventListener('change', apply)
}

export function useMotionPref(): MotionPref {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    getMotionPref,
    () => 'full' as const,
  )
}

export const EASE_OUT = [0.16, 1, 0.3, 1] as const

/** Seconds for a Motion transition at the current setting. Reduced keeps a short fade; Off is instant. */
export function dur(pref: MotionPref, fullSeconds: number): number {
  if (pref === 'off') return 0
  if (pref === 'reduced') return Math.min(fullSeconds, 0.2)
  return fullSeconds
}
