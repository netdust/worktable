import { rowsWhere } from '../api'
import type { Model, Row } from '../types'

/** Deepest level read or indented; a looped chain stops here. */
export const MAX_DEPTH = 5
/** Most ancestor ids one read asks for. */
const MAX_ANCESTORS = 500
/** The engine's `$in` takes at most this many ids. */
const PER_READ = 100

export interface Placed {
  row: Row
  depth: number
  muted: boolean
}

/** The id a row's parent column holds, whether the grid keeps the relation as a list or the engine as a number. */
export function parentOf(row: Row, field: string): number | null {
  const value = row.fields[field]
  const id = Array.isArray(value) ? value[0] : value
  return typeof id === 'number' ? id : null
}

/**
 * Children under their parent, siblings in the order given. A row whose parent is not among the rows is a root.
 * A row in a loop is placed once; no row sits deeper than MAX_DEPTH.
 */
export function treeOrder(rows: Row[], field: string, opts: { shut: Set<string>; muted: Set<number> }): Placed[] {
  const present = new Set(rows.map((row) => row.id))
  const children = new Map<number, Row[]>()
  const roots: Row[] = []
  for (const row of rows) {
    const parent = parentOf(row, field)
    if (parent === null || parent === row.id || !present.has(parent)) roots.push(row)
    else children.set(parent, [...(children.get(parent) ?? []), row])
  }
  const placed: Placed[] = []
  const seen = new Set<number>()
  const place = (row: Row, depth: number, hidden: boolean) => {
    if (seen.has(row.id)) return
    seen.add(row.id)
    if (!hidden) placed.push({ row, depth, muted: opts.muted.has(row.id) })
    const shut = hidden || opts.shut.has(String(row.id))
    for (const child of children.get(row.id) ?? []) place(child, Math.min(depth + 1, MAX_DEPTH), shut)
  }
  for (const root of roots) place(root, 0, false)
  // What no root reached sits in a loop: shown from its first row, so no row is lost.
  for (const row of rows) place(row, 0, false)
  return placed
}

/** The rows that have a child among the rows: the ones that fold. */
export function parentIds(rows: Row[], field: string): Set<number> {
  return new Set(rows.flatMap((row) => parentOf(row, field) ?? []))
}

const missingParents = (rows: Row[], field: string, known: Set<number>): number[] =>
  [...new Set(rows.flatMap((row) => parentOf(row, field) ?? []))].filter((id) => !known.has(id))

/**
 * The rows with the ancestors a filter dropped: one read per level, archived ones too, so an archived parent
 * of an open child still shows. At most MAX_DEPTH levels and MAX_ANCESTORS ids; each added row is muted.
 */
export async function withAncestors(model: Model, rows: Row[]): Promise<{ rows: Row[]; muted: Set<number> }> {
  const field = model.parent
  const muted = new Set<number>()
  if (!field) return { rows, muted }
  const all = [...rows]
  const known = new Set(rows.map((row) => row.id))
  let level = rows
  let asked = 0
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const ids = missingParents(level, field, known).slice(0, MAX_ANCESTORS - asked)
    if (ids.length === 0) break
    asked += ids.length
    const found: Row[] = []
    for (let at = 0; at < ids.length; at += PER_READ) {
      const read = await rowsWhere(model.key, { id: { $in: ids.slice(at, at + PER_READ) } }, [], PER_READ, true)
      found.push(...read.rows)
    }
    for (const row of found) {
      known.add(row.id)
      muted.add(row.id)
    }
    all.push(...found)
    level = found
  }
  return { rows: all, muted }
}

/** A read of the view with the ancestors its filter dropped added, each marked `muted`; the engine's total stays as read. */
export async function readWithTree(model: Model | undefined, read: { rows: Row[]; total: number }): Promise<{ rows: Row[]; total: number }> {
  if (!model?.parent) return read
  const { rows, muted } = await withAncestors(model, read.rows)
  return { rows: rows.map((row) => (muted.has(row.id) ? { ...row, muted: true as const } : row)), total: read.total }
}
