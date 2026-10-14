import { useState } from 'react'
import { readStored, writeStored } from '../grid/layout'
import type { View } from '../types'

/** A skin's own choice for a view (a gallery's size, a matrix's away layer), kept in this browser. */
export function useViewChoice<T>(view: View | undefined, prefix: string, parse: (raw: unknown) => T | null, fallback: T): [T, (next: T) => void] {
  const [, redraw] = useState(0)
  const value = (view && readStored(prefix, view, parse)) ?? fallback
  const set = (next: T) => {
    if (!view) return
    writeStored(prefix, view, next)
    redraw((n) => n + 1)
  }
  return [value, set]
}
