import { useState } from 'react'
import { readStored, writeStored } from '../grid/layout'
import type { View } from '../types'

export type Size = 'S' | 'M' | 'L'

/** A card's least width at each size, as the prototype's S M L. */
export const SIZE_PX: Record<Size, number> = { S: 172, M: 236, L: 330 }

const PREFIX = 'ntdst-views/gallery-size/v1/'
const parse = (raw: unknown): Size | null => (raw === 'S' || raw === 'M' || raw === 'L' ? raw : null)

/** A gallery's card size, kept per view in this browser. */
export function useGallerySize(view: View | undefined): [Size, (size: Size) => void] {
  const [, redraw] = useState(0)
  const size = (view && readStored(PREFIX, view, parse)) ?? 'M'
  const set = (next: Size) => {
    if (!view) return
    writeStored(PREFIX, view, next)
    redraw((n) => n + 1)
  }
  return [size, set]
}
