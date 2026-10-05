import { Kbd } from '@sakaniui/react'
import { t } from '../i18n'
import { ThemeToggle } from './Theme'

/** The keys the sheet answers to, and the viewer's theme. */
export function RailFoot() {
  return (
    <footer className="nv-rail__foot">
      <span><Kbd>↑↓←→</Kbd> <span>{t('hintMove')}</span></span>
      <span><Kbd>↵</Kbd> <span>{t('hintEdit')}</span> · <Kbd>Esc</Kbd> <span>{t('hintCancel')}</span></span>
      <span><Kbd>⌘Z</Kbd> <span>{t('undo')}</span></span>
      <span><Kbd>⌘K</Kbd> <span>{t('hintSearch')}</span></span>
      <ThemeToggle />
    </footer>
  )
}
