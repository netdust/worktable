import { Check, ChevronDown, type LucideIcon } from 'lucide-react'
import { type KeyboardEvent, type ReactNode, useContext, useEffect, useRef } from 'react'
import { UNSAFE_PortalProvider, useInteractOutside } from 'react-aria'
import {
  Autocomplete, Button, Input, type Key, ListBox, ListBoxItem, Popover, Select, SelectStateContext, TextField,
} from 'react-aria-components'
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

/** What a search matches: the label holding the typed text, whatever its case. */
export const holds = (text: string, typed: string) => text.toLocaleLowerCase().includes(typed.trim().toLocaleLowerCase())

/** A closed select would pick by a letter or ←→ on its button; this one only opens. */
function stayClosed(event: KeyboardEvent) {
  const button = event.target instanceof HTMLElement && event.target.getAttribute('aria-expanded') === 'false'
  const picks = event.key === 'ArrowLeft' || event.key === 'ArrowRight' || (event.key.length === 1 && event.key !== ' ')
  if (button && picks && !event.ctrlKey && !event.metaKey && !event.altKey) event.stopPropagation()
}

/** A button that opens a list under it, the current value checked; a pick, Escape or a click elsewhere closes it. */
export function Pick({ label, value, options, onChange, searchable = false, className = '' }: Props) {
  const root = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.value === value)
  const Icon = current?.icon
  const choose = (key: Key | null) => {
    if (key !== null && String(key) !== value) onChange(String(key))
  }

  return (
    <div className={`nv-pick ${className}`} ref={root} onKeyDownCapture={stayClosed}>
      {/* The list opens inside the picker, so the builder it sits in counts a press on it as its own. */}
      <UNSAFE_PortalProvider getContainer={() => root.current}>
        <Select aria-label={label} selectedKey={value} onSelectionChange={choose}>
          <Button className="nv-pick__button" aria-label={`${label}: ${current?.label ?? ''}`} aria-labelledby="">
            {Icon && <Icon size={14} aria-hidden="true" />}
            <span className="nv-pick__text">{current?.label}</span>
            <ChevronDown size={14} aria-hidden="true" className="nv-pick__chevron" />
          </Button>
          {/* React Aria keeps 12px from the window's edge in the picker's own coordinates, which moved the list right of its button. */}
          <Popover isNonModal className="nv-pick__panel" placement="bottom start" offset={4} maxHeight={260} containerPadding={0}>
            <Outside>
              {searchable ? <Searched label={label} options={options} /> : <Options label={label} options={options} />}
            </Outside>
          </Popover>
        </Select>
      </UNSAFE_PortalProvider>
    </div>
  )
}

/** The popover is non-modal, so the page stays live: a press outside it closes it and still reaches its target. */
export function Outside({ children }: { children: ReactNode }) {
  const state = useContext(SelectStateContext)
  const box = useRef<HTMLDivElement>(null)
  useInteractOutside({ ref: box, onInteractOutside: () => state?.close() })
  return <div ref={box}>{children}</div>
}

/**
 * A searched list opens on its first option, and Enter takes the first match while no option is focused,
 * as before it was React Aria's, which opens on the current value.
 */
export function FirstMatch({ texts, children }: { texts: [Key, string][]; children: ReactNode }) {
  const state = useContext(SelectStateContext)
  // A parent's effect runs after the list's own, so this focus wins over React Aria's.
  useEffect(() => {
    if (texts[0]) state?.selectionManager.setFocusedKey(texts[0][0])
  }, [])
  const enter = (event: KeyboardEvent) => {
    const input = event.target
    if (event.key !== 'Enter' || !(input instanceof HTMLInputElement) || !state) return
    const active = input.getAttribute('aria-activedescendant')
    if (active && document.getElementById(active)) return
    const match = texts.find(([, text]) => holds(text, input.value))
    if (!match) return
    event.preventDefault()
    event.stopPropagation()
    state.setSelectedKey(match[0])
    state.close()
  }
  return <div onKeyDownCapture={enter}>{children}</div>
}

function Searched({ label, options }: { label: string; options: PickOption[] }) {
  return (
    <FirstMatch texts={options.map((o) => [o.value, o.label])}>
      <Autocomplete filter={holds}>
        <TextField aria-label={t('filterSearch', { field: label })}>
          {/* biome-ignore lint/a11y/noAutofocus: the list opened to be searched. */}
          <Input type="search" className="nv-pick__search" autoFocus />
        </TextField>
        <Options label={label} options={options} />
      </Autocomplete>
    </FirstMatch>
  )
}

function Options({ label, options }: { label: string; options: PickOption[] }) {
  return (
    <ListBox aria-label={label} aria-labelledby="" className="nv-pick__list">
      {options.map((option) => {
        const OptionIcon = option.icon
        return (
          <ListBoxItem key={option.value} id={option.value} textValue={option.label} className="nv-pick__option">
            {({ isSelected }) => (
              <>
                {OptionIcon && <OptionIcon size={14} aria-hidden="true" />}
                <span>{option.label}</span>
                {isSelected && <Check size={14} aria-hidden="true" className="nv-pick__check" />}
              </>
            )}
          </ListBoxItem>
        )
      })}
    </ListBox>
  )
}
