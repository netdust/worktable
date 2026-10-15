import type { Model, Row } from '../types'

export interface Insight {
  label: string
  count: number
}

/**
 * What still waits in the view's rows, for the title line: the warn-toned option of the record's state (its lifecycle
 * column, else the first option field with a warn option) and how many rows hold it; none where no row does.
 */
export function insightOf(model: Model, rows: Row[]): Insight | null {
  const warned = (key: string) => Object.values(model.fields[key]?.tones ?? {}).includes('warn')
  const field = model.lifecycle && warned(model.lifecycle)
    ? model.lifecycle
    : Object.keys(model.fields).find((key) => model.fields[key].type === 'select' && warned(key))
  if (!field) return null
  const tones = model.fields[field].tones ?? {}
  const option = Object.keys(tones).find((key) => tones[key] === 'warn') as string
  const count = rows.filter((row) => row.fields[field] === option).length
  return count > 0 ? { label: model.fields[field].options?.[option] ?? option, count } : null
}
