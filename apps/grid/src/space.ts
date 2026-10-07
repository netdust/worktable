import { useCallback, useEffect, useState } from 'react'
import { records } from './api'
import type { Row, Scope, Space } from './types'

/** Every record of the space: no scope. */
export type Choice = number | 'all'

export type SpaceState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'ready'; records: Row[]; selected: Row | null; scope: Scope | null }

const ALL = 'all'

function key(model: string): string {
  return `ntdst-views:${window.location.host}:${model}`
}

/** The selection is one viewer's, kept in this browser per site; nothing stored, or blocked storage, is every record. */
export function stored(model: string): Choice {
  try {
    const id = Number(window.localStorage.getItem(key(model)) ?? ALL)
    return Number.isInteger(id) && id > 0 ? id : ALL
  } catch {
    return ALL
  }
}

export function store(model: string, choice: Choice): void {
  try {
    window.localStorage.setItem(key(model), String(choice))
  } catch {
    // Blocked storage: the selection lasts this visit.
  }
}

/** The space's records and the one being worked in: the stored one while it exists, else every record. */
export function useSpace(space: Space | null | undefined): [SpaceState, (choice: Choice) => void] {
  const [list, setList] = useState<{ model: string; rows: Row[] } | null>(null)
  const [chosen, setChosen] = useState<Choice>(ALL)

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
    (choice: Choice) => {
      if (!space) return
      store(space.model, choice)
      setChosen(choice)
    },
    [space?.model],
  )

  if (!space) return [{ status: 'none' }, select]
  if (list?.model !== space.model) return [{ status: 'loading' }, select]
  const selected = list.rows.find((r) => r.id === chosen) ?? null
  return [{ status: 'ready', records: list.rows, selected, scope: selected ? { field: space.field, id: selected.id } : null }, select]
}
