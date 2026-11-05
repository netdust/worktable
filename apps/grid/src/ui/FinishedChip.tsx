import { t } from '../i18n'

/** Afgerond tonen: the done and cancelled rows a skin leaves out, put back. */
export function FinishedChip({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return <button type="button" className={on ? 'nv-chip nv-chip--set' : 'nv-chip'} aria-pressed={on} onClick={onToggle}>{t('showFinished')}</button>
}
