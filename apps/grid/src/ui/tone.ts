import type { Tone } from '../types'

/** A tone as the colour of a column's dot: the status tones keep their own ink. */
export const toneColor = (tone: Tone | undefined) =>
  !tone ? 'var(--color-fg-subtle)' : tone === 'ok' ? 'var(--color-success-fg)' : tone === 'warn' ? 'var(--color-warning-fg)' : tone === 'bad' ? 'var(--color-danger-fg)' : `var(--tone-${tone})`
