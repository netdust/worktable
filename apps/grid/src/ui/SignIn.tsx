import { Button } from '@sakaniui/react'
import { type FormEvent, useId, useState } from 'react'
import { requestLink } from '../api'
import { t } from '../i18n'

/** Asks a sign-in link; it says the same whatever the engine answers, so it tells nobody which addresses have an account. */
export function SignIn({ note }: { note?: string }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const field = useId()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const address = email.trim()
    if (address === '') return
    requestLink(address).catch(() => undefined).finally(() => setSent(true))
  }

  return (
    <form className="nv-auth" aria-label={t('signIn')} onSubmit={submit}>
      <h1 className="nv-auth__title">{t('signIn')}</h1>
      {note && <p className="nv-auth__note">{note}</p>}
      {sent ? <p className="nv-auth__note" role="status">{t('checkMail')}</p> : (
        <>
          <label className="nv-auth__label" htmlFor={field}>{t('email')}</label>
          <input id={field} className="nv-auth__input" type="email" value={email} autoComplete="email" autoFocus
            onChange={(event) => setEmail(event.target.value)} />
          <Button type="submit" variant="primary" size="sm" disabled={email.trim() === ''}>{t('sendLink')}</Button>
        </>
      )}
    </form>
  )
}
