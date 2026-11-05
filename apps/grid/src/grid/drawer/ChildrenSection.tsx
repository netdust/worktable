import { type FormEvent, useEffect, useState } from 'react'
import { rowsWhere } from '../../api'
import { t } from '../../i18n'
import type { Model, Row, Scope, TableDef } from '../../types'
import { categoriesFieldOf, categoryOf } from '../categories'
import { CategoryMark } from '../CategoryMark'
import { madeFrom } from '../newRow'
import { Section } from './Sections'
import '../tree.css'

/** The most children the drawer lists. */
const LISTED = 200

interface Props {
  model: Model
  row: Row
  /** Every table: the dataset's own says whether a space scopes it. */
  tables: TableDef[]
  scope: Scope | null
  /** Changes when the view was read again: the list follows. */
  version: string
  /** Creates a child with these fields; without it the section only reads. */
  onCreate?: (fields: Record<string, unknown>) => Promise<unknown>
  /** Writes the parent's status to this option, as any write. */
  onFinish?: (done: string) => void
}

interface Found {
  children: Row[]
  total: number
  /** Every child, archived ones too, and how many of them are still open or active. */
  all: number
  unfinished: number
}

/** The options of the categories column in these categories. */
const optionsIn = (model: Model, field: string, wanted: string[]): string[] =>
  Object.entries(model.fields[field]?.categories ?? {}).filter(([, category]) => wanted.includes(category)).map(([option]) => option)

async function read(model: Model, parent: string, field: string | undefined, id: number): Promise<Found> {
  const own = { [parent]: id }
  const unfinished = field ? optionsIn(model, field, ['open', 'active']) : []
  const [listed, every, still] = await Promise.all([
    rowsWhere(model.key, own, [], LISTED),
    rowsWhere(model.key, own, [], 1, true),
    unfinished.length === 0 ? Promise.resolve({ total: 0 }) : rowsWhere(model.key, { ...own, [field as string]: { $in: unfinished } }, [], 1, true),
  ])
  return { children: listed.rows, total: listed.total, all: every.total, unfinished: still.total }
}

function AddChild({ label, onAdd }: { label: string; onAdd: (title: string) => Promise<unknown> }) {
  const [asking, setAsking] = useState(false)
  const [title, setTitle] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (title.trim() === '') return
    void onAdd(title.trim()).then(() => {
      setTitle('')
      setAsking(false)
    })
  }
  if (!asking) return <button type="button" className="nv-button nv-button--secondary nv-button--sm" onClick={() => setAsking(true)}>+ {label}</button>
  return (
    <form className="nv-dw-children__all" onSubmit={submit}>
      <input className="nv-input" aria-label={t('childTitle')} value={title} autoFocus onChange={(event) => setTitle(event.target.value)} />
      <button type="submit" className="nv-button nv-button--sm">{t('childAdd')}</button>
      <button type="button" className="nv-button nv-button--secondary nv-button--sm" onClick={() => setAsking(false)}>{t('childCancel')}</button>
    </form>
  )
}

/** A record's children with their status marks, a "+" for a new one, and, once every child is finished, a way to finish the record. */
export function ChildrenSection({ model, row, tables, scope, version, onCreate, onFinish }: Props) {
  const parent = model.parent
  const field = categoriesFieldOf(model)
  const [found, setFound] = useState<Found | null>(null)
  useEffect(() => {
    if (!parent) return
    let live = true
    read(model, parent, field, row.id).then((r) => live && setFound(r), () => undefined)
    return () => {
      live = false
    }
  }, [model.key, row.id, version])
  if (!parent || !found) return null

  const status = field ? model.fields[field] : undefined
  const made = madeFrom(model, tables, null, scope)
  const plan = 'missing' in made ? null : made
  const addable = onCreate && plan !== null && plan.needs.every((need) => need === 'title')
  const done = field ? optionsIn(model, field, ['done'])[0] : undefined
  const finished = found.all > 0 && found.unfinished === 0 && status && categoryOf(status, row.fields[field as string]) !== 'done'
  const label = model.new_label ?? t('childAdd')
  const add = async (title: string) => onCreate?.({ ...plan?.fields, [parent]: [row.id], ...(plan?.needs.includes('title') ? { title } : {}) })

  return (
    <Section title={t('children')} count={String(found.total)}>
      {found.children.length > 0 && (
        <ul className="nv-dw-rows nv-dw-children">
          {found.children.map((child) => {
            const value = field ? child.fields[field] : undefined
            const category = status ? categoryOf(status, value) : undefined
            return (
              <li key={child.id}>
                {category && <CategoryMark category={category} />}
                <span>{child.title || t('untitled')}</span>
                {status && typeof value === 'string' && <small className="nv-muted">{status.options?.[value] ?? value}</small>}
              </li>
            )
          })}
        </ul>
      )}
      {addable && <AddChild label={label} onAdd={add} />}
      {finished && onFinish && done && (
        <div className="nv-dw-children__all">
          <span>{t('allChildrenDone')}</span>
          <button type="button" className="nv-button nv-button--sm" onClick={() => onFinish(done)}>{t('markDone')}</button>
        </div>
      )}
    </Section>
  )
}
