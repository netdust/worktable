import { Menu, MenuItem, Popover, type PopoverPlacement } from '@sakaniui/react'
import { Ellipsis } from 'lucide-react'
import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { t } from '../i18n'

export interface Action {
  label: string
  run: () => void
  /** Why it is off: the item is disabled and says so under its label. */
  blocked?: string
}

/**
 * The actions that do not fit beside the main one, behind ⋯: Escape closes and gives focus back to it.
 * `label` names the ⋯ where several sit side by side; `placement` turns the menu away from an edge.
 */
export function MoreMenu({ actions, label = t('moreActions'), placement = 'bottom-end' }: { actions: Action[]; label?: string; placement?: PopoverPlacement }) {
  // A chosen action closes the menu: the popover keeps its own open state, so it starts again.
  const [round, setRound] = useState(0)
  const [open, setOpen, root] = useOpen()
  return (
    <span className="nv-menu" ref={root}>
      <Popover key={round} placement={placement} trigger={
        <button type="button" className="nv-more" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open}
          onClick={() => setOpen(!open)}>
          <Ellipsis size={16} aria-hidden="true" />
        </button>
      }>
        <Items actions={actions} onChosen={() => {
          setOpen(false)
          setRound((n) => n + 1)
        }} />
      </Popover>
    </span>
  )
}

/** The popover's open state, mirrored for `aria-expanded`: it closes on the same outside press and Escape. */
function useOpen() {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const outside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  return [open, setOpen, root] as const
}

function Items({ actions, onChosen }: { actions: Action[]; onChosen: () => void }) {
  const list = useRef<HTMLDivElement>(null)
  const items = () => [...(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [])]

  useEffect(() => items()[0]?.focus(), [])

  const move = (event: KeyboardEvent) => {
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    const all = items()
    const at = all.indexOf(document.activeElement as HTMLElement)
    all[(at + step + all.length) % all.length]?.focus()
  }

  return (
    <div ref={list} onKeyDown={move}>
      <Menu aria-label={t('moreActions')} minWidth={200}>
        {actions.map((action) => (
          <MenuItem key={action.label} state={action.blocked ? 'disabled' : 'default'} onSelect={() => {
            onChosen()
            action.run()
          }}>
            {action.label}
            {action.blocked && <span className="nv-menu__reason">{action.blocked}</span>}
          </MenuItem>
        ))}
      </Menu>
    </div>
  )
}
