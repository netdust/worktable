import { t } from '../i18n'

function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return <button type="button" className={on ? 'nv-chip nv-chip--set' : 'nv-chip'} aria-pressed={on} onClick={onToggle}>{label}</button>
}

/** Afgerond tonen: the done and cancelled rows a skin leaves out, put back. */
export const FinishedChip = ({ on, onToggle }: { on: boolean; onToggle: () => void }) => <Toggle on={on} onToggle={onToggle} label={t('showFinished')} />

/** Archief tonen: the rows the engine archived by age, asked for again. */
export const ArchiveChip = ({ on, onToggle }: { on: boolean; onToggle: () => void }) => <Toggle on={on} onToggle={onToggle} label={t('showArchive')} />
