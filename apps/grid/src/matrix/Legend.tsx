import type { CSSProperties } from 'react'
import { locale, t } from '../i18n'
import type { Model, View } from '../types'
import { toneColor } from '../ui/tone'

/** What a matrix cell's marks and shades mean, in the foot: the toned statuses a refusal aside, then away. */
export function Legend({ view, models }: { view: View; models: Record<string, Model> }) {
  const join = view.join
  const field = join ? models[join.model]?.fields[join.cell_field] : undefined
  if (!join || !field) return null
  const said = (word: string) => word.toLocaleLowerCase(locale())
  const toned = Object.entries(join.marks).filter(([status]) => field.tones?.[status] && field.tones[status] !== 'bad')
  return (
    <ul className="nv-legend" aria-label={t('legend')}>
      {toned.map(([status, mark]) => (
        <li key={status}><i style={{ '--c': toneColor(field.tones?.[status]) } as CSSProperties}>{mark}</i>{said(field.options?.[status] ?? status)}</li>
      ))}
      {view.away && <li><i className="nv-legend__away" />{said(t('away'))}</li>}
      {view.away && <li><i className="nv-legend__bad">⚠</i>{said(t('awayWarning'))}</li>}
    </ul>
  )
}
