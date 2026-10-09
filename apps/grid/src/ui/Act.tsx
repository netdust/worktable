import { Button } from 'react-aria-components'
import { useEffect, useState } from 'react'
import { actOn, actView } from '../api'
import { errorText, t } from '../i18n'
import type { ActView, ApiError } from '../types'

type Phase = { kind: 'loading' } | { kind: 'shown'; view: ActView } | { kind: 'done'; answer: string } | { kind: 'refused'; text: string }

/** The token leaves the address bar and the history before any request; from here on it lives in memory only. */
function forgetToken(): void {
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
}

function refusalText(error: ApiError): string {
  if (error.code === 'bad_token') return t('actDead')
  if (error.code === 'transition_lost') return t('actAnswered')
  return errorText(error.code, error.message)
}

const shownValue = (value: unknown): string => (value === null || value === undefined || value === '' ? '—' : String(value))

/** A person answers an invite without signing in: one button per answer the token allows, each a POST. */
export function Act({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    forgetToken()
    let live = true
    actView(token).then(
      (view) => live && setPhase({ kind: 'shown', view }),
      (error: ApiError) => live && setPhase({ kind: 'refused', text: refusalText(error) }),
    )
    return () => {
      live = false
    }
  }, [token])

  const answer = (to: { value: string; label: string }) => {
    setBusy(true)
    actOn(token, to.value).then(
      () => setPhase({ kind: 'done', answer: to.label }),
      (error: ApiError) => setPhase({ kind: 'refused', text: refusalText(error) }),
    )
  }

  const note = phase.kind === 'done' ? t('actDone', { answer: phase.answer }) : phase.kind === 'refused' ? phase.text : t('actHint')
  return (
    <section className="nv-auth" aria-label={t('actTitle')} aria-busy={phase.kind === 'loading'}>
      <h1 className="nv-auth__title">{t('actTitle')}</h1>
      {phase.kind === 'shown' && (
        <dl className="nv-act__facts">
          {Object.entries(phase.view.projection).map(([key, value]) => (
            <div key={key}>
              <dt>{phase.view.labels[key] ?? key}</dt>
              <dd>{shownValue(value)}</dd>
            </div>
          ))}
        </dl>
      )}
      {phase.kind !== 'loading' && <p className="nv-auth__note" role={phase.kind === 'shown' ? undefined : 'status'}>{note}</p>}
      {phase.kind === 'shown' && (
        <div className="nv-act__answers">
          {phase.view.to.map((to, i) => (
            <Button key={to.value} className={`nv-button nv-button--sm${i === 0 ? ' nv-button--primary' : ''}`} isDisabled={busy} onPress={() => answer(to)}>
              {to.label}
            </Button>
          ))}
        </div>
      )}
    </section>
  )
}
