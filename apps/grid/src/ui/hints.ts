import { t } from '../i18n'
import type { ViewType } from '../types'

/** The footer's hints for a skin, as its prototype writes them, and only for what the skin does. */
export function hintsOf(skin: ViewType): string[] {
  const undo = `⌘Z ${t('hintUndo')}`
  const period = [`←→ ${t('hintSteps')}`, `T ${t('hintToday')}`]
  switch (skin) {
    case 'matrix':
      return [`↑↓←→ ${t('hintMove')}`, `↵ ${t('hintAssign')}`, undo]
    case 'board':
      return [t('hintDrag'), `↵ ${t('hintOpen')}`, undo]
    case 'calendar':
    case 'timeline':
      return [t('hintClick'), ...period]
    case 'gallery':
      return [t('hintClick')]
    case 'dashboard':
      return [t('hintNumber'), t('hintCompose')]
    default:
      return [`↑↓←→ ${t('hintMove')}`, `↵ ${t('hintEdit')}`, undo]
  }
}

/** Whether a key pressed with focus here may move the period: on the page or the skin, never in a field, a list or a panel. */
export function stepsPeriod(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return true
  if (target === document.body) return true
  if (target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], .nv-drawer, .nv-rail, [role="menu"], [role="listbox"]')) return false
  return target.closest('.nv-sheet') !== null
}
