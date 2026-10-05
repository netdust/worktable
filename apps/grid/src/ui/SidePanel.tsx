import { Button } from '@sakaniui/react'
import { type ReactNode, useEffect, useRef } from 'react'
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

/** Beside the sheet, never over it: the sheet stays live. Closes on Escape, an open list inside first. */
export function SidePanel({ label, onClose, children, focusOnOpen = true, focusKey }: Props) {
  const close = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (focusOnOpen) close.current?.focus()
  }, [focusKey, focusOnOpen])

  return (
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
        <Button ref={close} variant="ghost" size="sm" onClick={onClose}>
          {t('close')}
        </Button>
      </header>
      {children}
    </aside>
  )
}
