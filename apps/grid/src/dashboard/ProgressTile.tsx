import { useEffect, useState } from 'react'
import { t } from '../i18n'
import type { SavedView, Scope } from '../types'
import { statOf } from './tiles'

/** "48 van 57" with its first number large, as the prototype. */
function Split({ text, lead }: { text: string; lead: string }) {
  return text.startsWith(lead) ? <>{lead}<small>{text.slice(lead.length)}</small></> : <>{text}</>
}

/** A count against a total from two views: slots filled of slots open. */
export function ProgressTile({ label, done, total, scope, version, onOpen }: {
  label: string; done: SavedView; total: SavedView; scope: Scope | null; version: number; onOpen: () => void
}) {
  const [counts, setCounts] = useState<[number, number] | null>(null)
  useEffect(() => {
    let live = true
    Promise.all([statOf(done, scope, 'count'), statOf(total, scope, 'count')]).then(
      ([d, all]) => live && setCounts([d ?? 0, all ?? 0]),
      () => live && setCounts(null),
    )
    return () => {
      live = false
    }
  }, [done.key, total.key, scope?.id, version])
  const [d, all] = counts ?? [0, 0]
  return (
    <section className="nv-tile nv-progress" aria-label={label}>
      <button type="button" className="nv-tile__title" onClick={onOpen}>{label}</button>
      <b className="nv-progress__value">{counts ? <Split text={t('doneOf', { done: String(d), total: String(all) })} lead={String(d)} /> : '–'}</b>
      <div className="nv-progress__bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={all} aria-valuenow={d}>
        <span style={{ width: `${all > 0 ? Math.min(100, (d / all) * 100) : 0}%` }} />
      </div>
    </section>
  )
}
