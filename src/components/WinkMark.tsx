/** The Wink cartouche: an oval holding one open eye and one wink. Draws in currentColor. */
export function WinkMark({ size = 40, title = 'Wink' }: { size?: number; title?: string | null }) {
  return (
    <svg
      width={size}
      height={(size * 24) / 40}
      viewBox="0 0 40 24"
      fill="none"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title ?? undefined}
    >
      <ellipse cx="20" cy="12" rx="18.5" ry="10.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="14" cy="12" r="2.4" fill="currentColor" />
      <path d="M22.5 12.8 Q26.25 9 30 12.8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}
