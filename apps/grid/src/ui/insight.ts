import type { Model, Row } from '../types'

export interface Insight {
  label: string
  count: number
  tone: 'bad' | 'warn'
}

/** The worst first. */
const TONES = ['bad', 'warn'] as const

/**
 * What still waits in the view's rows, for the title line: per tone, bad before warn, the rows whose option has it, named by
 * those options. The record's state is read (its lifecycle column, else the first option field with such a tone); none where no row holds one.
 */
export function insightOf(model: Model, rows: Row[]): Insight[] {
  const worried = (key: string) => Object.values(model.fields[key]?.tones ?? {}).some((tone) => TONES.some((t) => t === tone))
  const field = model.lifecycle && worried(model.lifecycle)
    ? model.lifecycle
    : Object.keys(model.fields).find((key) => model.fields[key].type === 'select' && worried(key))
  if (!field) return []
  const { tones = {}, options = {} } = model.fields[field]
  const held = (option: string) => rows.filter((row) => row.fields[field] === option).length
  return TONES.flatMap((tone) => {
    const present = Object.keys(tones).filter((option) => tones[option] === tone && held(option) > 0)
    const count = present.reduce((sum, option) => sum + held(option), 0)
    return count > 0 ? [{ label: present.map((option) => options[option] ?? option).join(' · '), count, tone }] : []
  })
}
