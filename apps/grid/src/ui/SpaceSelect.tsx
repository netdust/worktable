import { ChevronsUpDown } from 'lucide-react'
import { type KeyboardEvent, useId, useState } from 'react'
import { t } from '../i18n'
import type { Choice } from '../space'
import type { Row } from '../types'

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
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const id = useId()
  const all = t('allSpace', { label: label.toLocaleLowerCase() })
  const wanted = query.trim().toLocaleLowerCase()
  const options = [{ choice: 'all', title: all } as Option, ...records.map((r): Option => ({ choice: r.id, title: r.title }))]
    .filter((o) => o.title.toLocaleLowerCase().includes(wanted))

  const close = () => {
    setOpen(false)
    setQuery('')
    setActive(0)
  }
  const pick = (choice: Choice) => {
    onSelect(choice)
    close()
  }
  const keys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      setActive((i) => Math.max(0, Math.min(options.length - 1, i + (event.key === 'ArrowDown' ? 1 : -1))))
    } else if (event.key === 'Enter') {
      if (options[active]) pick(options[active].choice)
    } else if (event.key === 'Escape') {
      close()
    } else {
      return
    }
    event.preventDefault()
  }
  const current = selected?.id ?? 'all'

  return (
    <div className="nv-space">
      <button type="button" className="nv-space__button" aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`${id}-name`}
        onMouseDown={(event) => open && event.preventDefault()} onClick={() => (open ? close() : setOpen(true))}>
        <span className={`nv-space__mark${selected ? '' : ' nv-space__mark--all'}`} aria-hidden="true">{selected ? markOf(selected.title) : '∗'}</span>
        <span className="nv-space__text">
          <strong id={`${id}-name`}>{selected?.title ?? all}</strong>
          <small>{selected ? label : t('spaceCount', { count: records.length, label: label.toLocaleLowerCase() })}</small>
        </span>
        <ChevronsUpDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="nv-pop nv-space__pop">
          <input
            // biome-ignore lint/a11y/noAutofocus: the list opens to be searched
            autoFocus
            className="nv-picker__input"
            role="combobox"
            aria-label={t('searchSpace', { label })}
            aria-expanded="true"
            aria-controls={`${id}-list`}
            aria-activedescendant={options[active] ? `${id}-${options[active].choice}` : undefined}
            aria-autocomplete="list"
            placeholder={`${t('searchSpace', { label })}…`}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
            }}
            onKeyDown={keys}
            onBlur={close}
          />
          <ul id={`${id}-list`} role="listbox" aria-label={label} className="nv-picker__list" onMouseDown={(event) => event.preventDefault()}>
            {options.map((option, i) => (
              <li
                key={option.choice}
                id={`${id}-${option.choice}`}
                role="option"
                aria-selected={option.choice === current}
                className={`nv-pop__option nv-space__option${i === active ? ' is-active' : ''}`}
                onClick={() => pick(option.choice)}
              >
                <span className={`nv-space__dot${option.choice === 'all' ? ' nv-space__dot--all' : ''}`} aria-hidden="true" />
                {option.title}
              </li>
            ))}
          </ul>
          {options.length === 0 && <p className="nv-picker__note">{t('noMatches')}</p>}
        </div>
      )}
    </div>
  )
}
