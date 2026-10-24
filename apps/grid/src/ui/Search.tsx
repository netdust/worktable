import { Search as Glass } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Input, Keyboard, SearchField } from 'react-aria-components'
import { t } from '../i18n'
import type { Table } from './tables'

interface Props {
  query: string
  onQuery: (query: string) => void
  tables: Table[]
  onJump: (viewKey: string) => void
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

/** Every view a query reaches by its table's label or its own, named `table · view` where the table has more than one. */
function jumps(tables: Table[], wanted: string): { key: string; name: string }[] {
  if (wanted === '') return []
  return tables.filter((table) => table.listed !== false).flatMap((table) => {
    const byTable = fold(table.label).includes(wanted)
    return table.views
      .filter((view) => byTable || fold(view.label).includes(wanted))
      .map((view) => ({ key: view.key, name: table.views.length > 1 ? `${table.label} · ${view.label}` : table.label }))
  })
}

/** ⌘K / Ctrl+K: the rows filter by title as you type, and a matching view is one click away. */
export function Search({ query, onQuery, tables, onJump }: Props) {
  const input = useRef<HTMLInputElement>(null)
  // Where the toolbar is narrow the field is an icon until asked for; by the stylesheet, so this only remembers the ask.
  const [open, setOpen] = useState(false)
  const matches = jumps(tables, fold(query))

  useEffect(() => {
    const focus = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen(true)
        input.current?.focus()
      }
    }
    document.addEventListener('keydown', focus)
    return () => document.removeEventListener('keydown', focus)
  }, [])
  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])

  return (
    <div className="nv-search" data-open={open ? '' : undefined}>
      <button type="button" className="nv-more nv-search__toggle" aria-label={t('search')} title={t('search')} onClick={() => setOpen(true)}>
        <Glass size={16} aria-hidden="true" />
      </button>
      <SearchField className="nv-search__field" aria-label={t('search')} value={query} onChange={onQuery} onBlur={() => query === '' && setOpen(false)}>
        <Glass size={14} aria-hidden="true" />
        <Input ref={input} placeholder={t('search')} />
        <Keyboard className="nv-kbd">⌘K</Keyboard>
      </SearchField>
      {matches.length > 0 && (
        <div className="nv-pop nv-search__views">
          {matches.map((match) => (
            <button key={match.key} type="button" className="nv-pop__option" onClick={() => {
              onQuery('')
              onJump(match.key)
            }}>
              {t('goToView', { view: match.name })}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
