import type { DatasetDecl, Domain, QueryDecl, Writer } from './declare'

export type Source = DatasetDecl | QueryDecl

export function sourcesOf(domain: Domain): Source[] {
  return [...domain.datasets, ...domain.queries]
}

export function sourceOf(domain: Domain, name: string): Source | null {
  return sourcesOf(domain).find((s) => s.name === name) ?? null
}

export function writerOf(domain: Domain, dataset: string): Writer | undefined {
  return domain.writers && Object.hasOwn(domain.writers, dataset) ? domain.writers[dataset] : undefined
}
