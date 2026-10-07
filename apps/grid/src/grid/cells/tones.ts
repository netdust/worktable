import { BedDouble, Car, Coffee, Drama, Hammer, type LucideIcon, Mic, Music, UtensilsCrossed, Wrench } from 'lucide-react'

import type { Tone } from '../../types'

export type { Tone }

/**
 * What an option key means, in the common words of planning: settled, pending
 * or off. A key not listed is neutral; a site's own words are its labels.
 */
const TONES: Record<string, Tone> = {
  confirmed: 'ok', done: 'ok', approved: 'ok',
  option: 'warn', requested: 'warn', maybe: 'warn', pending: 'warn', tentative: 'warn',
  cancelled: 'bad', canceled: 'bad', declined: 'bad', rejected: 'bad',
}

/** The kinds of planned thing the mockup draws with an icon. */
const ICONS: Record<string, LucideIcon> = {
  travel: Car, build: Wrench, strike: Hammer, rehearsal: Music, soundcheck: Mic,
  show: Drama, meal: UtensilsCrossed, overnight: BedDouble, free: Coffee,
}

/** A tone the column declares wins over the built-in defaults. */
export function toneOf(option: string, declared?: Record<string, Tone>): Tone | null {
  return declared?.[option] ?? TONES[option] ?? null
}

export function iconOf(option: string): LucideIcon | null {
  return ICONS[option] ?? null
}
