import { type RefObject, useLayoutEffect, useState } from 'react'

const GAP = 8
const MORE = 40

export interface Measure {
  room: number
  widths: number[]
}

/** Reads a line's room and the width of each of its items from the layout; tests hand in their own. */
export function measureLine(line: HTMLElement, items = ':scope > .nv-button'): Measure {
  const shown = [...line.querySelectorAll<HTMLElement>(items)]
  return { room: line.clientWidth, widths: shown.map((item) => item.offsetWidth) }
}

/** How many of the items fit before the line needs a Meer menu; the first, a primary, never folds. */
export function fitting({ room, widths }: Measure, primary: boolean): number {
  if (room === 0) return widths.length
  const all = widths.reduce((sum, width) => sum + width, 0) + GAP * (widths.length - 1)
  if (all <= room) return widths.length
  let used = MORE
  let shown = 0
  for (const width of widths) {
    if (used + GAP + width > room && !(primary && shown === 0)) break
    used += GAP + width
    shown += 1
  }
  return shown
}

/**
 * How many items a line shows, null while it shows them all to read their widths.
 * It measures again when `signature` changes or `watched` (the line itself, unless the line's width follows its content) changes width.
 */
export function useFitting({ line, signature, primary, measure, present, watched = (element) => element }: {
  line: RefObject<HTMLElement | null>
  signature: string
  primary: boolean
  measure: (line: HTMLElement) => Measure
  present: boolean
  watched?: (line: HTMLElement) => HTMLElement
}): number | null {
  const [shown, setShown] = useState<number | null>(null)
  useLayoutEffect(() => setShown(null), [signature])
  useLayoutEffect(() => {
    if (shown !== null || !line.current) return
    setShown(fitting(measure(line.current), primary))
  })
  // biome-ignore lint/correctness/useExhaustiveDependencies: the line mounts and leaves with `present`; the ref itself never changes.
  useLayoutEffect(() => {
    const element = line.current && watched(line.current)
    if (!element || typeof ResizeObserver === 'undefined') return
    let width = element.clientWidth
    const watch = new ResizeObserver(() => {
      if (element.clientWidth !== width) setShown(null)
      width = element.clientWidth
    })
    watch.observe(element)
    return () => watch.disconnect()
  }, [present])
  return shown
}
