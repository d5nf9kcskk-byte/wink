import { describe, expect, it } from 'vitest'
import { GENRE_IDS } from './genres'

// The app tsconfig has no Node types and vitest empties CSS imports (even ?raw), so load node:fs untyped.
const { readFileSync } = await import(/* @vite-ignore */ 'node:fs' as string)
const css: string = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8')

function hex(name: string): string {
  const m = css.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})\\b`, 'i'))
  if (!m) throw new Error(`${name} is missing from tokens.css`)
  return m[1]
}

function luminance(color: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(color.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('genre inks', () => {
  it('measures contrast the WCAG way', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21)
    expect(contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 2)
  })

  it.each(GENRE_IDS)('%s: text on the band and on its deep fill meets AA (4.5:1)', (id) => {
    expect(contrast(hex(`--g-${id}`), hex(`--g-${id}-on`))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(hex(`--g-${id}-deep`), hex(`--g-${id}-deep-on`))).toBeGreaterThanOrEqual(4.5)
  })
})
