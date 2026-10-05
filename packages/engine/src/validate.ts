import type { ColumnDecl, DatasetDecl, Domain, QueryDecl } from './declare'
import { sourcesOf } from './registry'

export class DomainError extends Error {
  readonly declaration: string

  constructor(declaration: string, name: string, message: string) {
    super(`${declaration}: ${message}`)
    this.declaration = declaration
    this.name = name
  }
}

const declared = (source: DatasetDecl | QueryDecl, column: string): boolean => Object.hasOwn(source.columns, column)

function checkColumn(source: DatasetDecl | QueryDecl, what: string, column: string | undefined): void {
  if (column !== undefined && !declared(source, column)) {
    throw new DomainError(source.name, column, `${what} "${column}" is not a declared column`)
  }
}

function checkRelations(domain: Domain, source: DatasetDecl | QueryDecl): void {
  const names = new Set(domain.datasets.map((d) => d.name))
  for (const [column, decl] of Object.entries(source.columns)) {
    if (decl.relation && !names.has(decl.relation)) {
      throw new DomainError(source.name, decl.relation, `${column} relates to undeclared dataset "${decl.relation}"`)
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
  if (!declared(target, writes.field)) throw at(writes.field, `writes to undeclared field "${writes.field}"`)
  if (target.columns[writes.field]?.readonly) throw at(writes.field, `writes to readonly field "${writes.field}"`)
  if (!declared(query, writes.key)) throw at(writes.key, `has key "${writes.key}", not a column of the query`)
}

export function validateDomain(domain: Domain): void {
  for (const source of sourcesOf(domain)) {
    checkColumn(source, 'title', source.title)
    checkColumn(source, 'date', source.date)
    checkRelations(domain, source)
  }
  for (const dataset of domain.datasets) {
    for (const index of dataset.indexes ?? []) for (const column of index) checkColumn(dataset, 'index column', column)
  }
  for (const query of domain.queries) {
    for (const [column, decl] of Object.entries(query.columns)) {
      if (decl.writes) checkWrites(domain, query, column, decl.writes)
    }
  }
}
