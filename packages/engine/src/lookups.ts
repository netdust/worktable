import { type SQL, sql } from 'drizzle-orm'
import type { ColumnDecl, DatasetDecl, Domain, LookupDecl } from './declare'
import { ApiError } from './params'
import { type Source, sourceOf } from './registry'

export function lookupOf(source: Source, key: string): LookupDecl | undefined {
  if (source.kind !== 'dataset' || !source.lookups || !Object.hasOwn(source.lookups, key)) return undefined
  return source.lookups[key]
}

function declaredLookup(source: DatasetDecl, name: string): LookupDecl {
  const lookup = lookupOf(source, name)
  if (!lookup) throw new Error(`${source.name} declares no lookup "${name}"`)
  return lookup
}

export const targetOf = (source: DatasetDecl, lookup: LookupDecl): string =>
  source.columns[lookup.via]?.relation as string

export function lookupColumn(domain: Domain, source: DatasetDecl, name: string): ColumnDecl {
  const lookup = declaredLookup(source, name)
  const field = sourceOf(domain, targetOf(source, lookup))?.columns[lookup.field]
  if (!field) throw new Error(`lookup ${source.name}.${name} reads no column`)
  const { type, options, tones, relation } = field
  return {
    type,
    label: lookup.label,
    nullable: true,
    ...(options ? { options } : {}),
    ...(tones ? { tones } : {}),
    ...(relation ? { relation } : {}),
    ...(lookup.own ? {} : { readonly: true }),
  }
}

// Qualified by hand: drizzle prints a column in a select field without its table, which a self-relation's inner alias would capture.
const outer = (source: DatasetDecl, column: string): SQL =>
  sql`${sql.identifier(source.name)}.${sql.identifier(column)}`

// `_lookup` cannot be a dataset name (names start with a letter), so the alias never shadows the outer table.
function related(source: DatasetDecl, lookup: LookupDecl): SQL {
  const alias = sql.identifier('_lookup')
  return sql`(SELECT ${alias}.${sql.identifier(lookup.field)} FROM ${sql.identifier(targetOf(source, lookup))} AS ${alias} WHERE ${alias}."id" = ${outer(source, lookup.via)} AND ${alias}."deleted_at" IS NULL)`
}

export function lookupValue(source: DatasetDecl, name: string): SQL {
  const lookup = declaredLookup(source, name)
  return lookup.own ? sql`COALESCE(${outer(source, lookup.own)}, ${related(source, lookup)})` : related(source, lookup)
}

export function lookupInherited(source: DatasetDecl, name: string): SQL {
  const lookup = declaredLookup(source, name)
  if (!lookup.own) throw new Error(`lookup ${source.name}.${name} is not inherited`)
  return sql`(${outer(source, lookup.own)} IS NULL AND ${related(source, lookup)} IS NOT NULL)`
}

export const INHERITED = 'inherited:'

export function lookupSelect(source: Source): Record<string, SQL> {
  if (source.kind !== 'dataset') return {}
  const select: Record<string, SQL> = {}
  for (const [name, lookup] of Object.entries(source.lookups ?? {})) {
    select[name] = lookupValue(source, name)
    if (lookup.own) select[INHERITED + name] = lookupInherited(source, name)
  }
  return select
}

type Values = Record<string, unknown>

/** A write names an inherited lookup by its own column; a plain lookup has nothing to write. */
export function ownBody(dataset: DatasetDecl, body: Values): Values {
  const out: Values = {}
  for (const [key, value] of Object.entries(body)) {
    const lookup = lookupOf(dataset, key)
    if (!lookup) out[key] = value
    else if (lookup.own) {
      if (Object.hasOwn(body, lookup.own))
        throw new ApiError(400, 'bad_value', `"${key}" and "${lookup.own}" name one value`)
      out[lookup.own] = value
    }
  }
  return out
}
