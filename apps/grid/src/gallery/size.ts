import { useViewChoice } from '../ui/choice'
import type { View } from '../types'

export type Size = 'S' | 'M' | 'L'

/** A card's least width at each size, as the prototype's S M L. */
export const SIZE_PX: Record<Size, number> = { S: 172, M: 236, L: 330 }

const parse = (raw: unknown): Size | null => (raw === 'S' || raw === 'M' || raw === 'L' ? raw : null)

/** A gallery's card size, kept per view in this browser. */
export const useGallerySize = (view: View | undefined) => useViewChoice<Size>(view, 'ntdst-views/gallery-size/v1/', parse, 'M')
