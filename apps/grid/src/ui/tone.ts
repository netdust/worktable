import type { Tone } from '../types'

/** A tone as the colour of a column's dot: the status tones keep their own ink. */
export const toneColor = (tone: Tone | undefined) =>
  !tone ? 'var(--color-fg-subtle)' : tone === 'ok' ? 'var(--color-success-fg)' : tone === 'warn' ? 'var(--color-warning-fg)' : tone === 'bad' ? 'var(--color-danger-fg)' : `var(--tone-${tone})`

// The prototype's person hues: a face keeps its colour wherever it shows.
const HUES = ['#2563ab', '#c2416b', '#2f8a57', '#6d4fc2', '#b7791f', '#138a8a', '#a0612a', '#2b7bb9', '#5b6675', '#8a4fb5']

/** A record's own hue, by its id: the same person is the same colour on every card. */
export const hueOf = (id: number) => HUES[Math.abs(id) % HUES.length]

// The lanes' colours, in order; the status tones are left to statuses.
const LANE_TONES = ['sky', 'violet', 'amber', 'teal', 'rose', 'green', 'slate', 'grey']

/** A lane's colour by its place: the calendar's and the timeline's lanes alike, until a record names its own. */
export const laneTone = (at: number) => `var(--tone-${LANE_TONES[Math.max(0, at) % LANE_TONES.length]})`
