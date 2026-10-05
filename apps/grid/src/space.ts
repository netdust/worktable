import { useCallback, useEffect, useState } from 'react'
import { records } from './api'
import type { Row, Scope, Space } from './types'

export type SpaceState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'ready'; records: Row[]; selected: Row | null; scope: Scope | null }

function key(model: string): string {
  return `ntdst-views:${window.location.host}:${model}`
}

/** The selection is one viewer's, kept in this browser per site; blocked storage keeps it for the visit. */
export function stored(model: string): number | null {
  try {
    const id = Number(window.localStorage.getItem(key(model)))
    return Number.isInteger(id) && id > 0 ? id : null
  } catch {
    return null
  }
}

export function store(model: string, id: number): void {
  try {
    window.localStorage.setItem(key(model), String(id))
  } catch {
    // Blocked storage: the selection lasts this visit.
  }
}

/** The space's records and the one being worked in: the stored one while it exists, else the first. */
export function useSpace(space: Space | null | undefined): [SpaceState, (id: number) => void] {
  const [list, setList] = useState<{ model: string; rows: Row[] } | null>(null)
  const [chosen, setChosen] = useState<number | null>(null)

  useEffect(() => {
    if (!space) return
    let live = true
    setChosen(stored(space.model))
    records(space.model, '').then(
      (r) => live && setList({ model: space.model, rows: r.rows }),
      () => live && setList({ model: space.model, rows: [] }),
    )
    return () => {
      live = false
    }
  }, [space?.model])

  const select = useCallback(
    (id: number) => {
      if (!space) return
      store(space.model, id)
      setChosen(id)
    },
    [space?.model],
  )

  if (!space) return [{ status: 'none' }, select]
  if (list?.model !== space.model) return [{ status: 'loading' }, select]
  const selected = list.rows.find((r) => r.id === chosen) ?? list.rows[0] ?? null
  return [{ status: 'ready', records: list.rows, selected, scope: selected ? { field: space.field, id: selected.id } : null }, select]
}
