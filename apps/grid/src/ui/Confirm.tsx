import { Button } from '@sakaniui/react'
import { useState } from 'react'
import { consumeLink } from '../api'
import { errorText, t } from '../i18n'
import type { Account, ApiError } from '../types'
import { SignIn } from './SignIn'

/** The token leaves the address bar and the history before the grid mounts: its hash writes would carry it along. */
function forgetLink(): void {
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
}

/** A link only signs in at the press: a mail scanner opening it burns nothing. */
export function Confirm({ token, onSignedIn }: { token: string; onSignedIn: (account: Account) => void }) {
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<ApiError | null>(null)
  if (refusal?.code === 'bad_token') return <SignIn note={t('linkDead')} />

  const press = () => {
    setBusy(true)
    consumeLink(token).finally(forgetLink).then(onSignedIn, (error: ApiError) => {
      setRefusal(error)
      setBusy(false)
    })
  }

  return (
    <section className="nv-auth" aria-label={t('signIn')}>
      <h1 className="nv-auth__title">{t('signIn')}</h1>
      <p className="nv-auth__note">{refusal ? errorText(refusal.code, refusal.message) : t('confirmHint')}</p>
      <Button variant="primary" size="sm" disabled={busy} onClick={press}>{t('signIn')}</Button>
    </section>
  )
}
