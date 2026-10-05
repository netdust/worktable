import { Spinner } from '@sakaniui/react'
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react'
import { records } from '../../api'
import { t } from '../../i18n'
import type { Row } from '../../types'

export const PICKER_CAP = 50
const DEBOUNCE = 150

export type Pick = 'key' | 'click'

interface Props {
  /** The model searched. */
  model: string
  /** The input's label and placeholder: the relation field's word. */
  label: string
  /** What a search opens with: the character that opened it, or nothing. */
  query?: string
  /** Records listed before the rest, in the order the server gave. */
  first?: (row: Row) => boolean
  onPick: (row: Row, how: Pick) => void
  /** Escape: leave, and undo what opened it. */
  onCancel: () => void
  /** Focus or Tab went elsewhere: close and keep everything; Escape's by default. */
  onClose?: () => void
  /** Delete on an empty search; absent where the value may not be emptied. */
  onClear?: () => void
}

type Found = { status: 'loading' } | { status: 'ready'; rows: Row[]; total: number }

function ordered(rows: Row[], first: Props['first']): Row[] {
  return first ? [...rows.filter(first), ...rows.filter((r) => !first(r))] : rows
}

/** A search over one model's records with a listbox under it: ↑↓ move, Enter picks, Escape cancels. */
export function RelationPicker({ model, label, query: opening = '', first, onPick, onCancel, onClose = onCancel, onClear }: Props) {
  const [query, setQuery] = useState(opening)
  const [found, setFound] = useState<Found>({ status: 'loading' })
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const id = useId()

  useEffect(() => {
    const el = input.current
    el?.focus()
    el?.setSelectionRange(el.value.length, el.value.length)
  }, [])

  useEffect(() => {
    let live = true
    const timer = setTimeout(() => {
      records(model, query.trim()).then(
        (r) => live && setFound({ status: 'ready', rows: ordered(r.rows, first).slice(0, PICKER_CAP), total: r.total }),
        () => live && setFound({ status: 'ready', rows: [], total: 0 }),
      )
    }, query === opening ? 0 : DEBOUNCE)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [model, query])

  const rows = found.status === 'ready' ? found.rows : []

  const keys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      setActive((i) => Math.max(0, Math.min(rows.length - 1, i + (event.key === 'ArrowDown' ? 1 : -1))))
    } else if (event.key === 'Enter') {
      // Until the typed search answers, the list is the last one: a pick from it would be a stranger.
      if (found.status === 'ready' && rows[active]) onPick(rows[active], 'key')
    } else if (event.key === 'Escape') {
      onCancel()
    } else if (event.key === 'Tab') {
      onClose()
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && query === '' && onClear) {
      onClear()
    } else {
      return
    }
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <div className="nv-pop nv-picker" data-editor>
      <input
        ref={input}
        className="nv-picker__input"
        role="combobox"
        aria-label={label}
        aria-expanded="true"
        aria-controls={`${id}-list`}
        aria-activedescendant={rows[active] ? `${id}-${rows[active].id}` : undefined}
        aria-autocomplete="list"
        placeholder={`${label}…`}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setActive(0)
          setFound({ status: 'loading' })
        }}
        onKeyDown={keys}
        onBlur={onClose}
      />
      <ul id={`${id}-list`} role="listbox" aria-label={label} className="nv-picker__list" onMouseDown={(event) => event.preventDefault()}>
        {rows.map((row, i) => (
          <li
            key={row.id}
            id={`${id}-${row.id}`}
            role="option"
            aria-selected={i === active}
            className="nv-pop__option"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(row, 'click')}
          >
            {row.title}
          </li>
        ))}
      </ul>
      {found.status === 'loading' && <Spinner size="sm" />}
      {found.status === 'ready' && rows.length === 0 && <p className="nv-picker__note">{t('noMatches')}</p>}
      {found.status === 'ready' && found.total > rows.length && <p className="nv-picker__note">{t('moreResults')}</p>}
    </div>
  )
}
