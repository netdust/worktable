import { Maximize2, Minimize2, X } from 'lucide-react'
import { Button } from 'react-aria-components'
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../i18n'

interface Props {
  label: string
  onClose: () => void
  children: ReactNode
  /** False leaves focus where it was: the matrix keeps typing in its cell. */
  focusOnOpen?: boolean
  /** What the panel shows: focus moves to it again when this changes, not when the label does. */
  focusKey?: string | number
  /** The head line in place of the title: the drawer's kind, position and steps. */
  head?: ReactNode
  /** The panel widens over the work column, and Escape or the same button takes it back. */
  expandable?: boolean
}

/** The app's third column, where every drawer lands full height; without one (a test, a page of its own) a drawer stays where it is mounted. */
export const DrawerSlot = createContext<HTMLElement | null>(null)

/** Beside the sheet, never over it: the sheet stays live. Closes on Escape, an open list inside first. */
export function SidePanel({ label, onClose, children, focusOnOpen = true, focusKey, head, expandable = false }: Props) {
  const [wide, setWide] = useState(false)
  const close = useRef<HTMLButtonElement>(null)
  const slot = useContext(DrawerSlot)

  useEffect(() => {
    if (focusOnOpen) close.current?.focus()
  }, [focusKey, focusOnOpen])

  const panel = (
    <aside
      className={wide ? 'nv-drawer nv-drawer--wide' : 'nv-drawer'}
      aria-label={label}
      onKeyDown={(event) => {
        const open = event.target instanceof Element && event.target.closest('[aria-expanded="true"]')
        if (event.key !== 'Escape' || open) return
        if (wide) setWide(false)
        else onClose()
      }}
    >
      <header className="nv-drawer__head">
        {head ?? <h2 className="nv-drawer__title">{label}</h2>}
        {expandable && (
          <Button className="nv-drawer__tool" aria-label={t(wide ? 'narrow' : 'expand')} onPress={() => setWide(!wide)}>
            {wide ? <Minimize2 size={14} aria-hidden="true" /> : <Maximize2 size={14} aria-hidden="true" />}
          </Button>
        )}
        <Button className="nv-drawer__close" ref={close} onPress={onClose} aria-label={t('close')}>
          <X size={16} aria-hidden="true" />
        </Button>
      </header>
      {children}
    </aside>
  )
  return slot ? createPortal(panel, slot) : panel
}
