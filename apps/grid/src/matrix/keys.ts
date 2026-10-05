import type { View } from '../types'

export type Action = { status: string } | 'cycle' | 'remove' | 'fill' | 'copy' | 'paste' | 'undo' | 'redo' | null

const COMMANDS: Record<string, Action> = { d: 'fill', c: 'copy', v: 'paste', z: 'undo', y: 'redo' }

/** A declared key's status, exact then lower-cased; only the site's own keys, never an inherited name like `constructor`. */
export function keyed(keys: Record<string, string>, key: string): string | undefined {
  const lower = key.toLowerCase()
  if (Object.hasOwn(keys, key)) return keys[key]
  return Object.hasOwn(keys, lower) ? keys[lower] : undefined
}

/** What a key does to a cell: a declared key is a status; null leaves the key to the browser. */
export function actionForKey(view: View, key: string, mods: { ctrl: boolean; shift: boolean }): Action {
  const join = view.join
  if (!join) return null
  const lower = key.toLowerCase()
  if (mods.ctrl) return lower === 'z' && mods.shift ? 'redo' : COMMANDS[lower] ?? null
  if (key === 'Delete' || key === 'Backspace') return 'remove'
  if (key === ' ') return 'cycle'
  const status = keyed(join.keys, key)
  return status === undefined ? null : { status }
}

/** The option after `current` in the declared order, wrapping; an empty or unknown cell starts at the first. */
export function cycle(order: string[], current: string): string {
  return order[(order.indexOf(current) + 1) % order.length]
}
