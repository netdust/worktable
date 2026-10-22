import { useEffect, useRef } from 'react'
import type { ApiError, Model, Row } from '../types'

const EVERY = 3000
const BACKED_OFF = 15_000
const ERRORS = 3
const REFUSED = new Set([401, 403, 404])

/** An open drawer follows a record while an outside process holds it, and stops at the first of: close, leaving a live state, the record gone, a refusal. */
export function useLive(model: Model | undefined, row: Row, reread: () => Promise<Row | null>): { busy: boolean } {
  const column = model?.lifecycle
  const live = model?.live
  const liveKey = live?.join('\0')
  const state = column ? row.fields[column] : undefined
  const busy = typeof state === 'string' && live?.includes(state) === true
  const again = useRef(reread)
  again.current = reread
  useEffect(() => {
    if (!busy || !column || !live) return
    let stopped = false
    let errors = 0
    let timer: ReturnType<typeof setTimeout>
    const wait = () => {
      timer = setTimeout(poll, errors >= ERRORS ? BACKED_OFF : EVERY)
    }
    async function poll() {
      try {
        const found = await again.current()
        if (stopped || !found) return
        errors = 0
        const next = found.fields[column as string]
        if (typeof next !== 'string' || !live?.includes(next)) return
      } catch (error) {
        if (stopped || REFUSED.has((error as ApiError).status ?? 0)) return
        errors += 1
      }
      wait()
    }
    wait()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [busy, column, liveKey, row.id])
  return { busy }
}
