import { useEffect, useState } from 'react'
import { ownerRows, ownerViews } from '../api'
import { formatDay, formatMoment } from '../grid/columns'
import { t } from '../i18n'
import type { ApiError, OwnerColumn, OwnerRows, OwnerView } from '../types'

type Shown = { view: OwnerView; read: OwnerRows }
type Phase = { kind: 'loading' } | { kind: 'shown'; views: Shown[] } | { kind: 'refused'; text: string }

/** The token leaves the address bar and the history before any request; from here on it lives in memory only. */
function forgetToken(): void {
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
}

function cellText(column: OwnerColumn, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  const text = String(value)
  if (column.options?.[text]) return column.options[text]
  if (column.type === 'date') return formatDay(text)
  if (column.type === 'datetime') return formatMoment(text)
  return text
}

async function readAll(token: string): Promise<Shown[]> {
  const views = await ownerViews(token)
  return Promise.all(views.map(async (view) => ({ view, read: await ownerRows(token, view.id) })))
}

/** A person reads the views shown to them through their link, without signing in; nothing here writes. */
export function LinkPage({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })

  useEffect(() => {
    forgetToken()
    let live = true
    readAll(token).then(
      (views) => live && setPhase({ kind: 'shown', views }),
      (error: ApiError) => live && setPhase({ kind: 'refused', text: error.code === 'bad_link' || error.code === 'unauthenticated' ? t('personDead') : t('personFailed') }),
    )
    return () => {
      live = false
    }
  }, [token])

  return (
    <section className="nv-person" aria-label={t('personTitle')} aria-busy={phase.kind === 'loading'}>
      <h1 className="nv-auth__title">{t('personTitle')}</h1>
      {phase.kind === 'refused' && <p className="nv-auth__note" role="status">{phase.text}</p>}
      {phase.kind === 'shown' && phase.views.length === 0 && <p className="nv-auth__note">{t('personNothing')}</p>}
      {phase.kind === 'shown' && phase.views.map(({ view, read }) => (
        <div key={view.id} className="nv-person__view">
          <h2 id={`nv-person-${view.id}`} className="nv-person__name">{view.name}</h2>
          <table className="nv-person__table" aria-labelledby={`nv-person-${view.id}`}>
            <thead>
              <tr>{read.columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr>
            </thead>
            <tbody>
              {read.rows.map((row, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: the engine serves no key for these rows
                <tr key={i}>{read.columns.map((column) => <td key={column.key}>{cellText(column, row[column.key])}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  )
}
