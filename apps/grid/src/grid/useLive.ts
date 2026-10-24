import { useEffect, useRef, useState } from 'react'
import type { ApiError, Model, Row } from '../types'

export const EVERY = 3000
export const BACKED_OFF = 15_000
export const ERRORS = 3
export const REFUSED = new Set([401, 403, 404])

/** The viewer holds a primary button on the record: it waits for them, not for an outside process. */
export const waiting = (row: Row): boolean => row.available?.buttons.some((button) => button.primary) === true

/** An open drawer follows a record while an outside process holds it, and stops at the first of: close, leaving a live state, the record gone, a refusal. */
export function useLive(model: Model | undefined, row: Row, reread: () => Promise<Row | null>): { busy: boolean } {
  const column = model?.lifecycle
  const live = model?.live
  const liveKey = live?.join('\0')
  const state = column ? row.fields[column] : undefined
  const [halted, setHalted] = useState(false)
  const inLive = typeof state === 'string' && live?.includes(state) === true
  const busy = inLive && !halted && !waiting(row)
  const again = useRef(reread)
  again.current = reread
  useEffect(() => {
    if (!inLive || !column || !live) return
    setHalted(false)
    let stopped = false
    let errors = 0
    let timer: ReturnType<typeof setTimeout>
    const wait = () => {
      timer = setTimeout(poll, errors >= ERRORS ? BACKED_OFF : EVERY)
    }
    // Polling that ends takes the busy mark with it.
    const halt = () => {
      if (!stopped) setHalted(true)
    }
    async function poll() {
      try {
        const found = await again.current()
        if (stopped) return
        const next = found?.fields[column as string]
        if (typeof next !== 'string' || !live?.includes(next)) return halt()
        errors = 0
      } catch (error) {
        if (stopped) return
        if (REFUSED.has((error as ApiError).status ?? 0)) return halt()
        errors += 1
      }
      wait()
    }
    wait()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [inLive, column, liveKey, row.id])
  return { busy }
}
