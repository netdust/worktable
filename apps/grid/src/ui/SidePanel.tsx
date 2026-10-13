import { X } from 'lucide-react'
import { Button } from 'react-aria-components'
import { createContext, type ReactNode, useContext, useEffect, useRef } from 'react'
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
}

/** The app's third column, where every drawer lands full height; without one (a test, a page of its own) a drawer stays where it is mounted. */
export const DrawerSlot = createContext<HTMLElement | null>(null)

/** Beside the sheet, never over it: the sheet stays live. Closes on Escape, an open list inside first. */
export function SidePanel({ label, onClose, children, focusOnOpen = true, focusKey }: Props) {
  const close = useRef<HTMLButtonElement>(null)
  const slot = useContext(DrawerSlot)

  useEffect(() => {
    if (focusOnOpen) close.current?.focus()
  }, [focusKey, focusOnOpen])

  const panel = (
    <aside
      className="nv-drawer"
      aria-label={label}
      onKeyDown={(event) => {
        const open = event.target instanceof Element && event.target.closest('[aria-expanded="true"]')
        if (event.key === 'Escape' && !open) onClose()
      }}
    >
      <header className="nv-drawer__head">
        <h2 className="nv-drawer__title">{label}</h2>
        <Button className="nv-drawer__close" ref={close} onPress={onClose} aria-label={t('close')}>
          <X size={16} aria-hidden="true" />
        </Button>
      </header>
      {children}
    </aside>
  )
  return slot ? createPortal(panel, slot) : panel
}
