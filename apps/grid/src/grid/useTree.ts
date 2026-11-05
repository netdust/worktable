import { useMemo } from 'react'
import type { Model } from '../types'
import type { Group } from './group'
import { useFolded } from './hooks'
import { parentIds, treeOrder } from './tree'

/** How a row sits in the tree: its indent, whether it folds, whether it is an ancestor shown only for a filtered child. */
export interface Place {
  depth: number
  muted: boolean
  folds: boolean
  open: boolean
}

/** The groups with each one's rows in tree order, the place of every row, and the fold of a parent; a model without a parent passes through. */
export function useTree(model: Model, viewKey: string, groups: Group[]): { groups: Group[]; places: Map<number, Place>; fold: (id: number) => void } {
  const field = model.parent
  const [shut, toggle] = useFolded(viewKey, field ?? null)
  const tree = useMemo(() => {
    const places = new Map<number, Place>()
    if (!field) return { groups, places }
    const ordered = groups.map((group) => {
      const rows = group.rows
      const muted = new Set(rows.filter((row) => row.muted).map((row) => row.id))
      const parents = parentIds(rows, field)
      const placed = treeOrder(rows, field, { shut, muted })
      for (const { row, depth, muted: grey } of placed) places.set(row.id, { depth, muted: grey, folds: parents.has(row.id), open: !shut.has(String(row.id)) })
      return { ...group, rows: placed.map((p) => p.row) }
    })
    return { groups: ordered, places }
  }, [field, groups, shut])
  return { ...tree, fold: (id) => toggle(String(id)) }
}
