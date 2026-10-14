import { Button } from 'react-aria-components'
import { History, Lock, Plus, Users } from 'lucide-react'
import { hint as titled } from './hint'
import { type Action, MoreMenu } from './MoreMenu'
import { createElement, type ReactNode } from 'react'
import { fixedCount, summary, t } from '../i18n'
import type { Column } from '../grid/columns'
import type { StoreState } from '../grid/store'
import type { ViewType } from '../types'
import { VIEW_ICONS } from './NewViewDialog'

export interface Shown {
  rows: number
  /** Null where the view is not grouped. */
  groups: number | null
  /** The read limit cut the rows: the count is what loaded. */
  cut: boolean
  /** A board's columns. */
  columns?: number
  /** A gallery's cards with a picture. */
  pictures?: number
  /** A sheet's columns, as Kolommen offers them. */
  menu?: Column[]
  /** Said in place of the counts: a calendar's period. */
  label?: string
}

interface Props {
  /** The view's name. */
  title: string
  /** The view's kind, for its icon. */
  kind?: ViewType
  /** A view this user can only copy: a lock says whose it is. */
  locked?: 'standard' | 'colleague' | null
  /** What the grid shows now; absent while there is no grid. */
  shown?: Shown | null
  /** The period's name ("Week 42 · 12–18 okt"), which the pill shows in place of the count on every skin. */
  period?: string | null
  search: ReactNode
  /** A store's state, for the save word; absent while there is no store. */
  saving?: Saving
  addLabel: string
  /** Why `+ New` is off, said next to it; null when it is on. */
  addBlocked: string | null
  /** Absent where a view takes no new row: there is no button. */
  onAdd?: () => void
  /** Exporteren / delen: its menu, where the view has one. */
  share?: ReactNode
  /** Why the last export gave no file; null when it did. */
  exportNote?: string | null
  /** The view holds a change kept in this browser (a view one may not write, a public one, or one not saved yet). */
  local?: Local | null
  /** Why the last write to the view itself was refused; null when it was not. */
  viewNote?: string | null
  /** How many saved filters the view holds that no chip shows. */
  fixed?: number
  /** Opens the view's history; absent while there is no view. */
  onHistory?: () => void
}

export interface Local {
  onRevert: () => void
  /** On a public view one may write: its change is published only on purpose. */
  onPublish?: () => void
}

type Saving = Pick<StoreState, 'save' | 'error'>

/** Only a refused or failed write says something: a cell saves as it is written. */
function SaveState({ state }: { state: Saving }) {
  if (state.save !== 'error') return null
  return (
    <span className="nv-save nv-save--error" role="status" data-react-aria-top-layer title={state.error?.message}>
      {state.error ? `${t('notSaved')}: ${state.error.message}` : t('notSaved')}
    </span>
  )
}

export function Toolbar({ title, kind = 'grid', locked, shown, period, search, saving, addLabel, addBlocked, onAdd, share, exportNote, local, viewNote, fixed = 0, onHistory }: Props) {
  const more: Action[] = [
    ...(local?.onPublish ? [{ label: t('publishChange'), run: local.onPublish }] : []),
    ...(local ? [{ label: t('revert'), run: local.onRevert }] : []),
  ]
  return (
    <header className="nv-toolbar">
      <div className="nv-toolbar__name">
        <span className="nv-toolbar__glyph" aria-hidden="true">{createElement(VIEW_ICONS[kind], { size: 16 })}</span>
        <h1 className="nv-toolbar__title">{title}</h1>
        {locked && <span className="nv-toolbar__lock" role="img" aria-label={t(locked === 'colleague' ? 'colleagueTitle' : 'readOnlyTitle')} title={t(locked === 'colleague' ? 'colleagueTitle' : 'readOnlyTitle')}>{locked === 'colleague' ? <Users size={13} aria-hidden="true" /> : <Lock size={13} aria-hidden="true" />}</span>}
        {(period || shown) && <span className="nv-toolbar__summary">{period ?? shown?.label ?? (shown && summary(shown.rows, shown.groups, shown.cut, shown.columns, shown.pictures))}</span>}
      </div>
      {viewNote && <span className="nv-toolbar__note" role="alert">{viewNote}</span>}
      {fixed > 0 && <span className="nv-toolbar__note">{fixedCount(fixed)}</span>}
      <div className="nv-toolbar__end">
        {search}
        {saving && <SaveState state={saving} />}
        {exportNote && <span className="nv-toolbar__note" role="alert">{exportNote}</span>}
        {onHistory && (
          <button type="button" className="nv-more" aria-label={t('history')} title={t('history')} onClick={onHistory}>
            <History size={16} aria-hidden="true" />
          </button>
        )}
        {share}
        {more.length > 0 && <MoreMenu actions={more} />}
        {onAdd && addBlocked && !(locked && addBlocked === t('readOnly')) && <span className="nv-toolbar__note nv-toolbar__note--hint">{addBlocked}</span>}
        {onAdd && (
          <Button ref={titled(addBlocked)} className="nv-button nv-button--primary nv-button--sm" isDisabled={addBlocked !== null} onPress={onAdd}>
            <Plus size={14} aria-hidden="true" />
            {addLabel}
          </Button>
        )}
      </div>
    </header>
  )
}
