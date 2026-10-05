import type { DatasetDecl, Domain, QueryDecl } from './declare'

export type Source = DatasetDecl | QueryDecl

export function sourcesOf(domain: Domain): Source[] {
  return [...domain.datasets, ...domain.queries]
}

export function sourceOf(domain: Domain, name: string): Source | null {
  return sourcesOf(domain).find((s) => s.name === name) ?? null
}
