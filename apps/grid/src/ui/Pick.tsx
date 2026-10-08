import { Check, ChevronDown, type LucideIcon } from 'lucide-react'
import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { t } from '../i18n'

export interface PickOption {
  value: string
  label: string
  icon?: LucideIcon
}

interface Props {
  /** The control's name: the button says it with the value, the list and its search by it alone. */
  label: string
  value: string
  options: PickOption[]
  onChange: (value: string) => void
  searchable?: boolean
  className?: string
}

/** A button that opens a list under it, the current value checked; a pick, Escape or a click elsewhere closes it. */
export function Pick({ label, value, options, onChange, searchable = false, className = '' }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.value === value)
  const wanted = query.trim().toLocaleLowerCase()
  const shown = options.filter((o) => o.label.toLocaleLowerCase().includes(wanted))

  useEffect(() => {
    if (!open) return
    const away = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  const close = () => {
    setOpen(false)
    setQuery('')
  }
  const choose = (next: string) => {
    if (next !== value) onChange(next)
    close()
  }
  // Escape closes this list only, not the builder it sits in.
  const keys = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !open) return
    event.stopPropagation()
    close()
  }
  const Icon = current?.icon

  return (
    <div className={`nv-pick ${className}`} ref={root} onKeyDown={keys}>
      <button type="button" className="nv-pick__button" aria-label={`${label}: ${current?.label ?? ''}`} aria-haspopup="listbox" aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}>
        {Icon && <Icon size={14} aria-hidden="true" />}
        <span className="nv-pick__text">{current?.label}</span>
        <ChevronDown size={14} aria-hidden="true" className="nv-pick__chevron" />
      </button>
      {open && (
        <div className="nv-pick__panel">
          {searchable && (
            // biome-ignore lint/a11y/noAutofocus: the list opened to be searched.
            <input type="search" className="nv-pick__search" aria-label={t('filterSearch', { field: label })} autoFocus value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && shown[0] && choose(shown[0].value)} />
          )}
          <ul role="listbox" aria-label={label} className="nv-pick__list">
            {shown.map((option) => {
              const OptionIcon = option.icon
              return (
                <li key={option.value} role="option" aria-selected={option.value === value} tabIndex={-1} className="nv-pick__option"
                  onClick={() => choose(option.value)} onKeyDown={(event) => event.key === 'Enter' && choose(option.value)}>
                  {OptionIcon && <OptionIcon size={14} aria-hidden="true" />}
                  <span>{option.label}</span>
                  {option.value === value && <Check size={14} aria-hidden="true" className="nv-pick__check" />}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
