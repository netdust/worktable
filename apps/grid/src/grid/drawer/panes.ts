import { History, List, type LucideIcon, NotebookPen, Paperclip, Table2 } from 'lucide-react'
import { t } from '../../i18n'
import type { Link, Schema } from '../../types'
import { iconNamed } from '../../ui/icons'
import type { Column } from '../columns'
import type { Inbound } from './derive'

export type PaneKind = 'fields' | 'notes' | 'link' | 'inbound' | 'history' | 'files'

/** One tab of the drawer: what it holds, named and drawn from the schema's shapes, never from a dataset's name. */
export interface Pane {
  key: string
  kind: PaneKind
  label: string
  icon: LucideIcon
}

export interface PaneInput {
  /** The long texts the drawer shows: writable here, or holding text. */
  longs: Column[]
  links: { key: string; column: Column; link: Link }[]
  inbound: Inbound[]
  history: boolean
  files: boolean
  schema: Schema | null
}

const tableIcon = (schema: Schema | null, found: (table: Schema['tables'][number]) => boolean): LucideIcon =>
  iconNamed(schema?.tables.find(found)?.icon) ?? Table2

/** The drawer's tabs in order: Gegevens, Notities, every link but the first, the rows pointing here, Geschiedenis, Bijlagen. */
export function panesOf({ longs, links, inbound, history, files, schema }: PaneInput): Pane[] {
  const panes: Pane[] = [{ key: 'fields', kind: 'fields', label: t('tabFields'), icon: List }]
  if (longs.length > 0) panes.push({ key: 'notes', kind: 'notes', label: t('tabNotes'), icon: NotebookPen })
  for (const { column, link } of links.slice(1))
    panes.push({ key: `link:${column.id}`, kind: 'link', label: column.label, icon: tableIcon(schema, (table) => table.model === link.target_dataset) })
  for (const i of inbound)
    panes.push({ key: `inbound:${i.model}:${i.field}`, kind: 'inbound', label: i.label, icon: tableIcon(schema, (table) => table.key === i.table) })
  if (history) panes.push({ key: 'history', kind: 'history', label: t('history'), icon: History })
  if (files) panes.push({ key: 'files', kind: 'files', label: t('attachments'), icon: Paperclip })
  return panes
}
