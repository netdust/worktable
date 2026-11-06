import type { Model } from '../types'

/** The lifecycle a board column moves: its own model's, or the one its query column writes; null where a move is no transition. */
export function lifecycleOf(model: Model, column: string, models: Record<string, Model>): { model: Model; column: string } | null {
  if (model.lifecycle === column) return { model, column }
  const writes = model.fields[column]?.writes
  const target = writes ? models[writes.dataset] : undefined
  return writes && target?.lifecycle === writes.field ? { model: target, column: writes.field } : null
}

/** A card in state `from` may land in the lane of state `to`: its own lane, or one a served transition leads to. */
export function reachable(life: ReturnType<typeof lifecycleOf>, from: string | null, to: string | null): boolean {
  if (!life) return true
  if (to === null) return false
  if (to === from) return true
  return (life.model.lifecycle_transitions ?? []).some((t) => t.to === to && (t.from === '*' || (from !== null && t.from.includes(from))))
}
