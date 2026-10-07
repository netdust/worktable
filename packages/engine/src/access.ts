import type { Actor, Domain } from './declare'
import { ApiError } from './params'
import { type Source, sourceOf } from './registry'

export type Surface =
  | 'auth.open'
  | 'public'
  | 'session'
  | 'schema'
  | 'rows.read'
  | 'rows.write'
  | 'views.read'
  | 'views.write'
  | 'views.share'
  | 'sources.display'

type Role = Actor['role']
const SIGNED_IN: Role[] = ['owner', 'editor', 'administrator']

// The Decisions permissions table. Rows are scoped for an owner by scopeOf, after may() lets it in.
const ALLOWED: Record<Surface, Role[] | 'anyone'> = {
  'auth.open': 'anyone',
  public: 'anyone',
  session: SIGNED_IN,
  schema: SIGNED_IN,
  'rows.read': SIGNED_IN,
  'rows.write': SIGNED_IN,
  'views.read': SIGNED_IN,
  'views.write': ['editor', 'administrator'],
  'views.share': ['administrator'],
  'sources.display': ['administrator'],
}

export function may(actor: Actor | null, surface: Surface): boolean {
  const allowed = ALLOWED[surface]
  return allowed === 'anyone' || (actor !== null && allowed.includes(actor.role))
}

export function forbid(message: string): never {
  throw new ApiError(403, 'forbidden', message)
}

export type Scope = { column: string; id: number } | 'all' | 'none'

const ownerColumn = (source: Source): string | undefined => source.owners?.owner

// An owner reads only sources that declare an owner column; any other source does not exist for it.
export function readable(actor: Actor, source: Source): boolean {
  return actor.role !== 'owner' || ownerColumn(source) !== undefined
}

export function visibleSource(domain: Domain, name: string, actor: Actor): Source {
  const source = sourceOf(domain, name)
  if (!source || !readable(actor, source)) throw new ApiError(404, 'unknown_source', `unknown source "${name}"`)
  return source
}

function pointsAt(source: Source, column: string, dataset: string): boolean {
  if (column === 'id' && source.kind === 'dataset') return source.name === dataset
  return source.columns[column]?.relation === dataset
}

export function scopeOf(actor: Actor, source: Source): Scope {
  if (actor.role !== 'owner') return 'all'
  const column = ownerColumn(source)
  const { subject } = actor
  if (!column || !subject || !pointsAt(source, column, subject.dataset)) return 'none'
  return { column, id: subject.id }
}

export function inScope(scope: Scope, row: Record<string, unknown>): boolean {
  return scope === 'all' || (scope !== 'none' && row[scope.column] === scope.id)
}
