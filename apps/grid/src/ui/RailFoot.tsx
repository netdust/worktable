import { Kbd } from '@sakaniui/react'
import { t } from '../i18n'
import { ThemeToggle } from './Theme'

export interface Signed {
  email: string
  onSignOut: () => void
}

/** The keys the sheet answers to, the viewer's theme, and who is signed in. */
export function RailFoot({ signed }: { signed?: Signed }) {
  return (
    <footer className="nv-rail__foot">
      <span><Kbd>↑↓←→</Kbd> <span>{t('hintMove')}</span></span>
      <span><Kbd>↵</Kbd> <span>{t('hintEdit')}</span> · <Kbd>Esc</Kbd> <span>{t('hintCancel')}</span></span>
      <span><Kbd>⌘Z</Kbd> <span>{t('undo')}</span></span>
      <span><Kbd>⌘K</Kbd> <span>{t('hintSearch')}</span></span>
      <ThemeToggle />
      {signed && (
        <span className="nv-rail__account">
          <span className="nv-rail__email">{signed.email}</span>
          <button type="button" className="nv-rail__signout" onClick={signed.onSignOut}>{t('signOut')}</button>
        </span>
      )}
    </footer>
  )
}
