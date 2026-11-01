import { X } from 'lucide-react'
import { type ReactNode, useLayoutEffect, useRef } from 'react'
import { Button } from 'react-aria-components'
import { t } from '../i18n'

/** An action's inputs, asked for in a panel: the keyboard moves into it on opening, Escape or its X leave it. Keyed by its action, so another one opens fresh. */
export function AskPanel({ className, onLeave, children }: { className: string; onLeave: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    panel.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.nv-dw-ask__close)')?.focus()
  }, [])
  return (
    <div ref={panel} className={className} onKeyDown={(event) => {
      // Typing here is typing here: the keys of what holds the panel (↑ ↓ j k in a drawer) never see it.
      if (event.key !== 'Escape') return event.stopPropagation()
      const open = event.target instanceof Element && event.target.closest('[aria-expanded="true"]')
      if (open) return
      event.stopPropagation()
      onLeave()
    }}>
      <Button className="nv-dw-ask__close" aria-label={t('close')} onPress={onLeave}><X size={14} aria-hidden="true" /></Button>
      {children}
    </div>
  )
}
