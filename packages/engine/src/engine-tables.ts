import { authTables } from './auth-tables'
import { defineDataset, ICONS } from './declare'
import { revision } from './revision'
import { savedView } from './saved-view'

export const MIGRATIONS = '_migrations'

export const BATCH_KINDS = { write: 'write', action: 'action', undo: 'undo', import: 'import', seed: 'seed' } as const
export type BatchKind = keyof typeof BATCH_KINDS

// Keyed by the UUID that revision.batch_id holds; undone_by is the key of the batch that undid it.
export const batch = defineDataset({
  name: 'batch',
  label: 'Batch',
  title: 'key',
  custom: false,
  columns: {
    key: { type: 'text', label: 'Key' },
    actor_id: { type: 'integer', label: 'Actor' },
    kind: { type: 'text', label: 'Kind', options: BATCH_KINDS },
    at: { type: 'datetime', label: 'At' },
    undone_by: { type: 'text', label: 'Undone by', nullable: true },
  },
  checks: ['UNIQUE (key)'],
})

// An administrator's display name and icon for a source, laid over its declaration by /schema.
export const sourceDisplay = defineDataset({
  name: 'source_display',
  label: 'Source display',
  title: 'source',
  custom: false,
  columns: {
    source: { type: 'text', label: 'Source' },
    label: { type: 'text', label: 'Label', nullable: true },
    icon: { type: 'text', label: 'Icon', nullable: true, options: Object.fromEntries(ICONS.map((i) => [i, i])) },
  },
  checks: ['UNIQUE (source)'],
})

export const engineTables = [savedView, revision, batch, sourceDisplay, ...authTables]

export const reservedNames = new Set([MIGRATIONS, ...engineTables.map((t) => t.name)])
