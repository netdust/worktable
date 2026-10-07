import { Menu, MenuItem } from '@sakaniui/react'
import { Ellipsis, type LucideIcon } from 'lucide-react'
import { type CSSProperties, type KeyboardEvent, type RefObject, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../i18n'

export interface Action {
  label: string
  run: () => void
  /** Why it is off: the item is disabled and says so under its label. */
  blocked?: string
}

type Placement = 'bottom-start' | 'bottom-end'

/**
 * The actions that do not fit beside the main one, behind ⋯: Escape closes and gives focus back to it.
 * `label` names the ⋯ where several sit side by side; `placement` turns the menu away from an edge;
 * `icon` and `menu` (the menu's name) make it another trigger, such as a `+`.
 * The menu opens in a layer over the page, so no scrolling box it sits in clips it.
 */
export function MoreMenu({ actions, label = t('moreActions'), placement = 'bottom-end', icon: Icon = Ellipsis, menu = t('moreActions') }: {
  actions: Action[]
  label?: string
  placement?: Placement
  icon?: LucideIcon
  menu?: string
}) {
  const trigger = useRef<HTMLButtonElement>(null)
  const layer = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<CSSProperties | null>(null)
  const close = () => setAt(null)
  useClosing(at !== null, [trigger, layer], close, () => trigger.current?.focus())
  const toggle = () => {
    const rect = trigger.current?.getBoundingClientRect()
    setAt(at || !rect ? null : position(rect, placement))
  }
  return (
    <span className="nv-menu">
      <button ref={trigger} type="button" className="nv-more" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={at !== null}
        onClick={toggle}>
        <Icon size={16} aria-hidden="true" />
      </button>
      {at && createPortal(
        <div ref={layer} className="nv-menu__layer" style={at}>
          <Items actions={actions} label={menu} onChosen={close} />
        </div>,
        document.getElementById('root') ?? document.body,
      )}
    </span>
  )
}

/** Under the trigger, or over it when the trigger sits in the lower part of the window. */
function position(rect: DOMRect, placement: Placement): CSSProperties {
  const gap = 4
  const vertical = rect.bottom > window.innerHeight * 0.6 ? { bottom: window.innerHeight - rect.top + gap } : { top: rect.bottom + gap }
  const horizontal = placement === 'bottom-start' ? { left: rect.left } : { right: window.innerWidth - rect.right }
  return { ...vertical, ...horizontal }
}

/** An open menu closes on a press outside it and its trigger, on Escape (focus goes back), and when the page scrolls or resizes. */
function useClosing(open: boolean, inside: RefObject<HTMLElement | null>[], close: () => void, refocus: () => void) {
  useEffect(() => {
    if (!open) return
    const outside = (event: MouseEvent) => {
      if (!inside.some((ref) => ref.current?.contains(event.target as Node))) close()
    }
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      close()
      refocus()
    }
    const moved = (event: Event) => {
      if (!inside.some((ref) => ref.current?.contains(event.target as Node))) close()
    }
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', escape)
    window.addEventListener('scroll', moved, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('keydown', escape)
      window.removeEventListener('scroll', moved, true)
      window.removeEventListener('resize', close)
    }
  }, [open])
}

function Items({ actions, label, onChosen }: { actions: Action[]; label: string; onChosen: () => void }) {
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
      <Menu aria-label={label} minWidth={200}>
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
