import { Button } from 'react-aria-components'
import { useEffect, useState } from 'react'
import { actOn, actView } from '../api'
import { errorText, t } from '../i18n'
import type { ActView, ApiError } from '../types'

type Phase =
  | { kind: 'loading' }
  | { kind: 'shown'; view: ActView; failed?: string }
  | { kind: 'done'; answer: string }
  | { kind: 'refused'; text: string }

/** The token leaves the address bar and the history before any request; from here on it lives in memory only. */
function forgetToken(): void {
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
}

// Only these end the page; any other failure leaves the answers to try again.
const TERMINAL: Record<string, 'actDead' | 'actAnswered'> = { bad_token: 'actDead', transition_lost: 'actAnswered' }

function failureText(error: ApiError): string {
  return error.code === 'rate_limited' ? t('actRetryLater') : errorText(error.code, t('actFailed'))
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
      (error: ApiError) => live && setPhase({ kind: 'refused', text: TERMINAL[error.code] ? t(TERMINAL[error.code]) : failureText(error) }),
    )
    return () => {
      live = false
    }
  }, [token])

  const answer = (view: ActView, to: { value: string; label: string }) => {
    setBusy(true)
    actOn(token, to.value).then(
      () => setPhase({ kind: 'done', answer: to.label }),
      (error: ApiError) => {
        const terminal = TERMINAL[error.code]
        setPhase(terminal ? { kind: 'refused', text: t(terminal) } : { kind: 'shown', view, failed: failureText(error) })
        setBusy(false)
      },
    )
  }

  const note =
    phase.kind === 'done' ? t('actDone', { answer: phase.answer })
    : phase.kind === 'refused' ? phase.text
    : phase.kind === 'shown' ? (phase.failed ?? t('actHint'))
    : ''
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
      {phase.kind !== 'loading' && <p className="nv-auth__note" role={phase.kind === 'shown' && !phase.failed ? undefined : 'status'}>{note}</p>}
      {phase.kind === 'shown' && (
        <div className="nv-act__answers">
          {phase.view.to.map((to, i) => (
            <Button key={to.value} className={`nv-button nv-button--sm${i === 0 ? ' nv-button--primary' : ''}`} isDisabled={busy} onPress={() => answer(phase.view, to)}>
              {to.label}
            </Button>
          ))}
        </div>
      )}
    </section>
  )
}
