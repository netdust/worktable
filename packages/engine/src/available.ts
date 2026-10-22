import type { Actor, Condition, Domain } from './declare'
import type { Source } from './registry'

export interface Available {
  state: string | null
  buttons: { to: string; label: string }[]
  actions: string[]
}

type Row = Record<string, unknown>

// A key absent from the row, as an owner's lookup is, never matches, not even null.
function matches(when: Condition | undefined, row: Row): boolean {
  if (!when) return true
  return Object.entries(when).every(([key, want]) => {
    if (!Object.hasOwn(row, key)) return false
    return typeof want === 'object' && want !== null ? (want.$in as unknown[]).includes(row[key]) : row[key] === want
  })
}

function actionsOf(domain: Domain, source: Source): [string, Condition | undefined][] {
  return Object.entries(domain.actions ?? {})
    .filter(([, action]) => action.on === source.name)
    .map(([name, action]) => [name, action.when])
}

export function declaresMarks(domain: Domain, source: Source): boolean {
  if (source.kind !== 'dataset') return false
  const buttons = source.lifecycle?.transitions.some((t) => t.button !== undefined) ?? false
  return buttons || actionsOf(domain, source).some(([, when]) => when !== undefined)
}

function buttonsOf(source: Source, state: string | null, row: Row, actor: Actor): Available['buttons'] {
  if (source.kind !== 'dataset' || state === null) return []
  return (source.lifecycle?.transitions ?? []).flatMap((t) => {
    const leaves = t.from === '*' || t.from.includes(state)
    const shown = t.button !== undefined && leaves && t.to !== state
    return shown && t.roles.includes(actor.role) && matches(t.when, row)
      ? [{ to: t.to, label: t.button as string }]
      : []
  })
}

/** What the caller may press or run on `row`, which is the row as the caller reads it. */
export function availableOf(domain: Domain, source: Source, row: Row, actor: Actor): Available | undefined {
  if (!declaresMarks(domain, source) || source.kind !== 'dataset') return undefined
  const value = source.lifecycle ? row[source.lifecycle.column] : null
  const state = typeof value === 'string' ? value : null
  return {
    state,
    buttons: buttonsOf(source, state, row, actor),
    actions: actionsOf(domain, source)
      .filter(([, when]) => matches(when, row))
      .map(([name]) => name),
  }
}

export const markOf = (domain: Domain, source: Source, row: Row, actor: Actor): { available?: Available } => {
  const available = availableOf(domain, source, row, actor)
  return available ? { available } : {}
}
