import { Button } from '@sakaniui/react'
import { Grid3x3, Lock, Plus, Table as TableIcon } from 'lucide-react'
import { type Action, MoreMenu } from './MoreMenu'
import type { ReactNode } from 'react'
import { fixedCount, summary, t } from '../i18n'
import type { StoreState } from '../grid/store'
import type { DateWindow } from '../types'
import { WindowControl } from './Window'

export interface Shown {
  rows: number
  /** Null where the view is not grouped. */
  groups: number | null
}

interface Props {
  /** The view's name. */
  title: string
  /** The view's kind, for its icon. */
  matrix?: boolean
  /** A view nobody writes: a lock says so. */
  locked?: boolean
  /** What the grid shows now; absent while there is no grid. */
  shown?: Shown | null
  window: DateWindow | null
  onWindow: (value: DateWindow) => void
  search: ReactNode
  /** A store's state, for the save word; absent while there is no store. */
  saving?: Saving
  addLabel: string
  /** Why `+ New` is off, said next to it; null when it is on. */
  addBlocked: string | null
  /** Absent where a view takes no new row: there is no button. */
  onAdd?: () => void
  /** Exports what the grid shows; absent while there is no grid. */
  onExport?: () => void
  /** Why the export is off, written under it in the ⋯. */
  exportBlocked?: string
  /** Why the last export gave no file; null when it did. */
  exportNote?: string | null
  /** The view differs from how it is saved, in this browser: what to do with the change. */
  modified?: Modified | null
  /** Why the last write to the view itself was refused; null when it was not. */
  viewNote?: string | null
  /** How many saved filters the view holds that no chip shows. */
  fixed?: number
}

export interface Modified {
  /** Absent on a view this user may not write: a starting view, another's shared one. */
  onSave?: () => void
  onSaveAs: () => void
  onRevert: () => void
  /** A view nobody saves over, such as a seeded one: Save is off, Save as new stays. */
  readOnly?: boolean
  /** A save is on its way: Save waits. */
  busy?: boolean
}

/** One Save: it saves one's own view, and asks a name for a new one anywhere else; the rest sits in the toolbar's ⋯. */
function ModifiedState({ modified }: { modified: Modified }) {
  const own = modified.onSave
  return (
    <div className="nv-modified">
      <span className="nv-modified__word">· {t('modified')}</span>
      <Button variant="secondary" size="sm" disabled={modified.readOnly || Boolean(own && modified.busy)} title={own ? undefined : t('saveAsNew')}
        onClick={own ?? modified.onSaveAs}>{t('save')}</Button>
    </div>
  )
}

type Saving = Pick<StoreState, 'save' | 'error'>

function SaveState({ state }: { state: Saving }) {
  const word = state.save === 'saving' ? t('saving') : state.save === 'error' ? t('notSaved') : t('saved')
  return (
    <span className={`nv-save nv-save--${state.save}`} role="status" title={state.error?.message}>
      {state.save === 'error' && state.error ? `${word}: ${state.error.message}` : word}
    </span>
  )
}

export function Toolbar({ title, matrix, locked, shown, window, onWindow, search, saving, addLabel, addBlocked, onAdd, onExport, exportBlocked, exportNote, modified, viewNote, fixed = 0 }: Props) {
  const more: Action[] = [
    ...(modified ? [{ label: t('saveAsNew'), run: modified.onSaveAs }, { label: t('revert'), run: modified.onRevert }] : []),
    ...(onExport || exportBlocked ? [{ label: t('export'), run: () => onExport?.(), blocked: exportBlocked }] : []),
  ]
  return (
    // A changed view's actions take room: there, the end may take a second row rather than leave the screen.
    <header className={modified ? 'nv-toolbar nv-toolbar--crowded' : 'nv-toolbar'}>
      <div className="nv-toolbar__name">
        {matrix ? <Grid3x3 size={16} aria-hidden="true" /> : <TableIcon size={16} aria-hidden="true" />}
        <h1 className="nv-toolbar__title">{title}</h1>
        {locked && <span className="nv-toolbar__lock" title={t('readOnlyTitle')}><Lock size={13} aria-label={t('readOnlyTitle')} role="img" /></span>}
        {shown && <span className="nv-toolbar__summary">{summary(shown.rows, shown.groups)}</span>}
      </div>
      {modified && <ModifiedState modified={modified} />}
      {viewNote && <span className="nv-toolbar__note" role="alert">{viewNote}</span>}
      {fixed > 0 && <span className="nv-toolbar__note">{fixedCount(fixed)}</span>}
      {window && <WindowControl value={window} onChange={onWindow} />}
      <div className="nv-toolbar__end">
        {search}
        {saving && <SaveState state={saving} />}
        {exportNote && <span className="nv-toolbar__note" role="alert">{exportNote}</span>}
        {more.length > 0 && <MoreMenu actions={more} />}
        {onAdd && addBlocked && <span className="nv-toolbar__note">{addBlocked}</span>}
        {onAdd && (
          <Button variant="primary" size="sm" leftIcon={<Plus size={14} />} disabled={addBlocked !== null} onClick={onAdd}>
            {addLabel}
          </Button>
        )}
      </div>
    </header>
  )
}
