import { ChevronsUpDown } from 'lucide-react'
import { type FocusEvent, useContext, useId, useRef, useState } from 'react'
import { UNSAFE_PortalProvider } from 'react-aria'
import { Autocomplete, Button, Input, ListBox, ListBoxItem, Popover, Select, SelectStateContext, TextField } from 'react-aria-components'
import { t } from '../i18n'
import type { Choice } from '../space'
import type { Row } from '../types'
import { FirstMatch, holds, Outside } from './Pick'

interface Props {
  /** The space model's word, plural. */
  label: string
  records: Row[]
  /** Null: every record. */
  selected: Row | null
  onSelect: (choice: Choice) => void
}

type Option = { choice: Choice; title: string }

/** Up to two initials: "Open Dag" reads OD. */
const markOf = (title: string): string =>
  title.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toLocaleUpperCase()

/** The rail's top: the record being worked in, or every record, and a searchable list that changes it. */
export function SpaceSelect({ label, records, selected, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const id = useId()
  const all = t('allSpace', { label: label.toLocaleLowerCase() })
  const options = [{ choice: 'all', title: all } as Option, ...records.map((r): Option => ({ choice: r.id, title: r.title }))]
  const none = !options.some((o) => holds(o.title, query))

  return (
    <div className="nv-space" ref={root}>
      {/* The list opens inside the switcher, under its button. */}
      <UNSAFE_PortalProvider getContainer={() => root.current}>
        <Select aria-label={label} selectedKey={selected?.id ?? 'all'} onSelectionChange={(key) => key !== null && onSelect(key as Choice)}
          onOpenChange={(open) => open || setQuery('')}>
          <Button className="nv-space__button" aria-labelledby={`${id}-name`}>
            <span className={`nv-space__mark${selected ? '' : ' nv-space__mark--all'}`} aria-hidden="true">{selected ? markOf(selected.title) : '∗'}</span>
            <span className="nv-space__text">
              <strong id={`${id}-name`}>{selected?.title ?? all}</strong>
              <small>{selected ? label : t('spaceCount', { count: records.length, label: label.toLocaleLowerCase() })}</small>
            </span>
            <ChevronsUpDown size={14} aria-hidden="true" />
          </Button>
          <Popover isNonModal className="nv-pop nv-space__pop" placement="bottom start" offset={4}>
            <Outside>
              <FirstMatch texts={options.map((o) => [o.choice, o.title])}>
                <Autocomplete inputValue={query} onInputChange={setQuery} filter={holds}>
                  <Search label={label} />
                  <ListBox aria-label={label} aria-labelledby="" className="nv-picker__list">
                    {options.map((option) => (
                      <ListBoxItem key={option.choice} id={option.choice} textValue={option.title} className="nv-pop__option nv-space__option">
                        <span className={`nv-space__dot${option.choice === 'all' ? ' nv-space__dot--all' : ''}`} aria-hidden="true" />
                        {option.title}
                      </ListBoxItem>
                    ))}
                  </ListBox>
                </Autocomplete>
              </FirstMatch>
              {none && <p className="nv-picker__note">{t('noMatches')}</p>}
            </Outside>
          </Popover>
        </Select>
      </UNSAFE_PortalProvider>
    </div>
  )
}

/** The list's search; leaving it for anything outside the list closes the list. */
function Search({ label }: { label: string }) {
  const state = useContext(SelectStateContext)
  const leave = (event: FocusEvent) => {
    const next = event.relatedTarget
    if (!(next instanceof Node && event.currentTarget.closest('.nv-space__pop')?.contains(next))) state?.close()
  }
  return (
    <div onBlur={leave}>
      <TextField aria-label={t('searchSpace', { label })}>
        {/* biome-ignore lint/a11y/noAutofocus: the list opens to be searched */}
        <Input autoFocus className="nv-picker__input" role="combobox" aria-expanded="true" placeholder={`${t('searchSpace', { label })}…`} />
      </TextField>
    </div>
  )
}
