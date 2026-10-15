import { useEffect, useRef } from 'react'

export interface PageSaves {
  undo: () => Promise<void>
  redo: () => Promise<void>
}

// A field keeps its own ⌘Z; a dialog (a quick create, a picker) is not the page.
const KEEPS_ITS_KEYS = 'input, textarea, select, [contenteditable="true"], [role="dialog"]'

/**
 * ⌘Z and ⇧⌘Z on the page, for every skin: the toast promises the undo wherever the focus went (a drop, a drawer's button
 * that unmounted). A cell that handled the key first has prevented it.
 */
export function usePageUndo(saves: PageSaves | null): void {
  const latest = useRef(saves)
  latest.current = saves
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return
      if (event.target instanceof Element && event.target.closest(KEEPS_ITS_KEYS)) return
      const now = latest.current
      if (!now) return
      event.preventDefault()
      void (event.shiftKey ? now.redo() : now.undo())
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
}
