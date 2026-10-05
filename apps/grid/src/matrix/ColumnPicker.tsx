import { useEffect, useState } from 'react'
import { records } from '../api'
import { t } from '../i18n'
import type { MatrixColumn, Row } from '../types'

interface Props {
  model: string
  /** Records that already have a column. */
  taken: number[]
  onPick: (id: number) => void
  /** Every column of the window, hidden ones too. */
  columns: MatrixColumn[]
  hidden: string[]
  onToggle: (key: string) => void
}

const DEBOUNCE = 150

/** The window's columns to hide or show, and a search over the column model's records: open in the page, nothing floats. */
export function ColumnPicker({ model, taken, onPick, columns, hidden, onToggle }: Props) {
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Row[] | null>(null)

  useEffect(() => {
    let live = true
    const timer = setTimeout(() => {
      records(model, query.trim()).then((r) => live && setFound(r.rows), () => live && setFound([]))
    }, query === '' ? 0 : DEBOUNCE)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [model, query])

  const open = (found ?? []).filter((row) => !taken.includes(row.id))
  return (
    <div className="nv-mx__picker">
      <ul className="nv-mx__columns">
        {columns.map((column) => {
          const word = t(hidden.includes(column.key) ? 'showColumn' : 'hideColumn')
          return (
            <li key={column.key} data-column={column.key}>
              <span>{column.title}</span>
              <button type="button" className="nv-mx__pick" aria-label={`${word} ${column.title}`} onClick={() => onToggle(column.key)}>{word}</button>
            </li>
          )
        })}
      </ul>
      <input type="search" className="nv-picker__input" aria-label={t('addColumn')} placeholder={t('search')} value={query} onChange={(e) => setQuery(e.target.value)} />
      <ul className="nv-mx__picks">
        {open.map((row) => (
          <li key={row.id}>
            <button type="button" className="nv-mx__pick" onClick={() => onPick(row.id)}>{row.title}</button>
          </li>
        ))}
      </ul>
      {found !== null && open.length === 0 && <p className="nv-picker__note">{t('noMatches')}</p>}
    </div>
  )
}
