import type { ColumnDecl, DatasetDecl, Domain, QueryDecl } from './declare'
import { reservedNames } from './engine-tables'
import { sourcesOf, writerOf } from './registry'

export class DomainError extends Error {
  constructor(
    readonly declaration: string,
    readonly bad: string,
    message: string,
  ) {
    super(`${declaration}: ${message}`)
    this.name = 'DomainError'
  }
}

const declared = (source: DatasetDecl | QueryDecl, column: string): boolean =>
  Object.hasOwn(source.columns, column) || (source.kind === 'dataset' && column === 'id')

function checkColumn(source: DatasetDecl | QueryDecl, what: string, column: string | undefined): void {
  if (column !== undefined && !declared(source, column)) {
    throw new DomainError(source.name, column, `${what} "${column}" is not a declared column`)
  }
}

function checkTitle(source: DatasetDecl | QueryDecl): void {
  if (typeof source.title === 'string') {
    checkColumn(source, 'title', source.title)
    return
  }
  const { via, else: fallback } = source.title
  checkColumn(source, 'title else', fallback)
  const target = source.columns[via]?.relation
  if (!target) throw new DomainError(source.name, via, `title via "${via}" is not a relation column`)
}

function checkOwners(source: DatasetDecl | QueryDecl): void {
  const column = source.owners?.owner
  if (column === undefined || column === 'id' || source.columns[column]?.relation) return
  throw new DomainError(source.name, column, `owner column "${column}" is not id or a relation column`)
}

// Keys the engine adds to every row it answers.
const OVERWRITTEN = [
  ['title', 'the computed row title'],
  ['revision', 'the write reply'],
] as const

function checkRelations(domain: Domain, source: DatasetDecl | QueryDecl): void {
  for (const [column, by] of OVERWRITTEN) {
    if (Object.hasOwn(source.columns, column)) {
      throw new DomainError(source.name, column, `a column named "${column}" would be overwritten by ${by}`)
    }
  }
  const names = new Set(domain.datasets.map((d) => d.name))
  for (const [column, decl] of Object.entries(source.columns)) {
    if (decl.relation && !names.has(decl.relation)) {
      throw new DomainError(source.name, decl.relation, `${column} relates to undeclared dataset "${decl.relation}"`)
    }
    const target = domain.datasets.find((d) => d.name === decl.relation)
    if (target && typeof target.title !== 'string') {
      throw new DomainError(
        source.name,
        column,
        `${column} relates to "${target.name}", whose title is through a relation`,
      )
    }
  }
}

function checkWrites(
  domain: Domain,
  query: QueryDecl,
  column: string,
  writes: NonNullable<ColumnDecl['writes']>,
): void {
  const target = domain.datasets.find((d) => d.name === writes.dataset)
  const at = (name: string, message: string): DomainError => new DomainError(query.name, name, `${column} ${message}`)
  if (!target) throw at(writes.dataset, `writes to undeclared dataset "${writes.dataset}"`)
  if (!Object.hasOwn(target.columns, writes.field))
    throw at(writes.field, `writes to undeclared field "${writes.field}"`)
  if (target.columns[writes.field]?.readonly) throw at(writes.field, `writes to readonly field "${writes.field}"`)
  if (!declared(query, writes.key)) throw at(writes.key, `has key "${writes.key}", not a column of the query`)
  if (!writerOf(domain, writes.dataset)?.update) {
    throw at(writes.dataset, `writes to "${writes.dataset}", which has no writer with update`)
  }
}

function checkMatrix(domain: Domain, join: DatasetDecl, downs: Set<string>): void {
  const m = join.matrix
  if (!m) return
  const at = (bad: string, message: string): DomainError => new DomainError(join.name, bad, `matrix ${message}`)
  const relation = (what: string, column: string): string => {
    const target = join.columns[column]?.relation
    if (!target) throw at(column, `${what} "${column}" is not a relation column of "${join.name}"`)
    return target
  }
  const downTarget = relation('down', m.down)
  relation('across', m.across)
  for (const [what, column] of [
    ['label', m.label],
    ['note', m.note],
  ] as const) {
    if (column !== undefined && join.columns[column]?.type !== 'text') {
      throw at(column, `${what} "${column}" is not a text column`)
    }
  }
  const options = join.columns[m.cell]?.options
  if (!options) throw at(m.cell, `cell "${m.cell}" is not an options column`)
  const option = (what: string, key: string): void => {
    if (!Object.hasOwn(options, key)) throw at(key, `${what} "${key}" is not an option of "${m.cell}"`)
  }
  for (const key of Object.values(m.keys)) option('key', key)
  for (const key of Object.keys(m.marks)) option('mark', key)
  option('count', m.count)
  if (downs.has(downTarget)) throw at(m.down, `down source "${downTarget}" already has a matrix`)
  downs.add(downTarget)
  if (m.away) checkAway(domain, join, m, m.away, at)
}

function checkAway(
  domain: Domain,
  join: DatasetDecl,
  m: NonNullable<DatasetDecl['matrix']>,
  away: NonNullable<NonNullable<DatasetDecl['matrix']>['away']>,
  at: (bad: string, message: string) => DomainError,
): void {
  const target = domain.datasets.find((d) => d.name === away.dataset)
  if (!target) throw at(away.dataset, `away dataset "${away.dataset}" is not declared`)
  if (!target.date) throw at(away.dataset, `away dataset "${away.dataset}" declares no date`)
  const across = join.columns[m.across]?.relation
  if (target.columns[away.across]?.relation !== across) {
    throw at(away.across, `away across "${away.across}" is not a relation to "${across}"`)
  }
  for (const [what, column] of [
    ['label', away.label],
    ['end', away.end],
  ] as const) {
    if (!Object.hasOwn(target.columns, column)) throw at(column, `away ${what} "${column}" is not a declared column`)
  }
}

export function validateDomain(domain: Domain): void {
  for (const source of sourcesOf(domain)) {
    if (reservedNames.has(source.name)) {
      throw new DomainError(source.name, source.name, `"${source.name}" is an engine table name`)
    }
    checkTitle(source)
    checkColumn(source, 'date', source.date)
    checkRelations(domain, source)
    checkOwners(source)
  }
  const downs = new Set<string>()
  for (const dataset of domain.datasets) {
    if (dataset.checks) throw new DomainError(dataset.name, 'checks', 'checks are for engine tables only')
    checkMatrix(domain, dataset, downs)
    for (const index of dataset.indexes ?? []) for (const column of index) checkColumn(dataset, 'index column', column)
  }
  for (const query of domain.queries) {
    for (const [column, decl] of Object.entries(query.columns)) {
      if (decl.writes) checkWrites(domain, query, column, decl.writes)
    }
  }
}
