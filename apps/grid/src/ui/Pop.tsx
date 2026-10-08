import type { MouseEvent } from 'react'
import { Popover, type PopoverProps } from 'react-aria-components'

const stop = (event: MouseEvent) => event.stopPropagation()

/** A cell editor's popover. Escape is the sheet's, so it cancels the edit, and a click inside never reaches the cell. */
export function Pop({ className, ...props }: PopoverProps & { className?: string }) {
  return (
    <Popover {...props} isNonModal isKeyboardDismissDisabled className={className ? `nv-pop ${className}` : 'nv-pop'}
      data-editor onClick={stop} onDoubleClick={stop} />
  )
}
