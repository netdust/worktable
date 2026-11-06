import type { DatasetDecl, Domain, QueryDecl, Writer } from './declare'

export type Source = DatasetDecl | QueryDecl

export function sourcesOf(domain: Domain): Source[] {
  return [...domain.datasets, ...domain.queries]
}

export function sourceOf(domain: Domain, name: string | null): Source | null {
  return sourcesOf(domain).find((s) => s.name === name) ?? null
}

/** The rail node a source sits under: a query under the dataset its `of` names, anything else under itself. */
export function nodeOf(domain: Domain, source: string): string {
  const found = sourceOf(domain, source)
  return (found?.kind === 'query' && found.of) || source
}

export function writerOf(domain: Domain, dataset: string): Writer | undefined {
  return domain.writers && Object.hasOwn(domain.writers, dataset) ? domain.writers[dataset] : undefined
}
