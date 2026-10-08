import { Spinner } from '@sakaniui/react'
import { type FocusEvent, type KeyboardEvent, type Key, type MouseEvent, type ReactNode, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ComboBox, ComboBoxStateContext, Group, Input, ListBox, ListBoxItem } from 'react-aria-components'
import { records } from '../../api'
import { t } from '../../i18n'
import type { Row } from '../../types'
import { Pop } from '../../ui/Pop'

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
  /** Shown in the search box before the input: a multiselect's chosen records. */
  before?: ReactNode
  /** Records left out of the list, such as those chosen already. */
  hide?: (row: Row) => boolean
  /** A multiselect: the search empties after each pick, ready for the next. */
  clearOnPick?: boolean
}

type Found = { status: 'loading' } | { status: 'ready'; rows: Row[]; total: number }

function ordered(rows: Row[], first: Props['first']): Row[] {
  return first ? [...rows.filter(first), ...rows.filter((r) => !first(r))] : rows
}

/** The list shows from the start: the picker is the search, not a field that may offer one. */
function OpenOnMount() {
  const state = useContext(ComboBoxStateContext)
  useEffect(() => state?.open(null, 'manual'), [])
  return null
}

const keepFocus = (event: MouseEvent) => event.preventDefault()
const stop = (event: MouseEvent) => event.stopPropagation()

/** A search over one model's records with a listbox under it: ↑↓ move, Enter picks, Escape cancels. */
export function RelationPicker({ model, label, query: opening = '', first, onPick, onCancel, onClose = onCancel, onClear, before, hide, clearOnPick }: Props) {
  const [query, setQuery] = useState(opening)
  const [found, setFound] = useState<Found>({ status: 'loading' })
  const input = useRef<HTMLInputElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [shift, setShift] = useState(0)

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

  // A picker in a column near the right edge would run off the screen: it moves left by what overflows.
  useLayoutEffect(() => {
    const right = box.current?.getBoundingClientRect().right ?? 0
    setShift(Math.max(0, right - (window.innerWidth - 8)))
  }, [])

  const rows = found.status === 'ready' ? (hide ? found.rows.filter((row) => !hide(row)) : found.rows) : []

  const pick = (row: Row, how: Pick) => {
    onPick(row, how)
    if (clearOnPick) setQuery('')
  }

  const search = (value: string) => {
    if (value === query) return
    setQuery(value)
    setFound({ status: 'loading' })
  }

  const chosen = (key: Key | null) => {
    const row = rows.find((r) => r.id === key)
    if (row) pick(row, 'click')
  }

  // Enter picks the record the arrows moved to, else the first listed.
  const active = (): Row | undefined => {
    const id = input.current?.getAttribute('aria-activedescendant')
    if (!id) return rows[0]
    const key = document.getElementById(id)?.dataset.key
    return rows.find((row) => String(row.id) === key)
  }

  // React Aria would close its list on Escape and commit on Tab, and the sheet would hear the key as well.
  const keys = (event: KeyboardEvent) => {
    const onInput = event.target === input.current
    if (event.key === 'Escape') onCancel()
    else if (event.key === 'Tab') onClose()
    else if ((event.key === 'Delete' || event.key === 'Backspace') && onInput && query === '' && onClear) onClear()
    else if (event.key === 'Enter' && onInput) {
      // Until the typed search answers, the list is the last one: a pick from it would be a stranger.
      const row = found.status === 'ready' ? active() : undefined
      if (row) pick(row, 'key')
    } else return
    event.preventDefault()
    event.stopPropagation()
  }

  const blur = (event: FocusEvent) => {
    const next = event.relatedTarget
    if (next instanceof Element && next.closest('[data-editor]')) return
    onClose()
  }

  return (
    <div ref={box} className="nv-pop nv-picker" data-editor onKeyDownCapture={keys} onBlur={blur} onClick={stop} onDoubleClick={stop}
      style={shift ? { transform: `translateX(-${shift}px)` } : undefined}>
      <ComboBox aria-label={label} allowsEmptyCollection menuTrigger="input" inputValue={query} onInputChange={search}
        items={rows} selectedKey={null} onSelectionChange={chosen}>
        <OpenOnMount />
        <Group className={before ? 'nv-picker__box' : 'nv-picker__field'}>
          {/* An open combobox hides the rest of the page from a screen reader; the chosen records stay heard. */}
          {before && <span className="nv-picker__before" data-react-aria-top-layer>{before}</span>}
          <Input ref={input} className="nv-picker__input" placeholder={`${label}…`} />
        </Group>
        <Pop triggerRef={box} placement="bottom start" offset={4} className="nv-picker__pop">
          <div onMouseDown={keepFocus}>
            <ListBox<Row> className="nv-picker__list">
              {(row) => <ListBoxItem id={row.id} textValue={row.title} className="nv-pop__option">{row.title}</ListBoxItem>}
            </ListBox>
            {found.status === 'loading' && <Spinner size="sm" />}
            {found.status === 'ready' && rows.length === 0 && <p className="nv-picker__note">{t('noMatches')}</p>}
            {found.status === 'ready' && found.total > found.rows.length && <p className="nv-picker__note">{t('moreResults')}</p>}
          </div>
        </Pop>
      </ComboBox>
    </div>
  )
}
