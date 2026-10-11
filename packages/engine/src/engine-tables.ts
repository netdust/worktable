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

// A single-purpose token: one record, one owner subject, the states it may move the record to, used once.
export const actionToken = defineDataset({
  name: 'action_token',
  label: 'Action token',
  title: 'hash',
  custom: false,
  columns: {
    hash: { type: 'text', label: 'Hash' },
    dataset: { type: 'text', label: 'Dataset' },
    record_id: { type: 'integer', label: 'Record' },
    subject_dataset: { type: 'text', label: 'Subject dataset' },
    subject_id: { type: 'integer', label: 'Subject id' },
    from_state: { type: 'text', label: 'From' },
    to_states: { type: 'json', label: 'To' },
    expires_at: { type: 'datetime', label: 'Expires at' },
    used_at: { type: 'datetime', label: 'Used at', nullable: true },
    minted_batch: { type: 'text', label: 'Minted by batch' },
  },
  checks: ['UNIQUE (hash)'],
  indexes: [['dataset', 'record_id'], ['minted_batch']],
})

// A record's link version; no row is version 0. Outside every batch, so a rotation is never undone.
export const recordLink = defineDataset({
  name: 'record_link',
  label: 'Record link',
  title: 'dataset',
  custom: false,
  columns: {
    dataset: { type: 'text', label: 'Dataset' },
    record_id: { type: 'integer', label: 'Record' },
    version: { type: 'integer', label: 'Version' },
    rotated_at: { type: 'datetime', label: 'Rotated at' },
    rotated_by: { type: 'integer', label: 'Rotated by' },
  },
  checks: ['UNIQUE (dataset, record_id)'],
})

// A file on a record; the bytes sit in the files directory under their sha256.
export const attachment = defineDataset({
  name: 'attachment',
  label: 'Attachment',
  title: 'name',
  custom: false,
  columns: {
    entity: { type: 'text', label: 'Entity' },
    record_id: { type: 'integer', label: 'Record' },
    kind: { type: 'text', label: 'Kind' },
    name: { type: 'text', label: 'Name' },
    mime: { type: 'text', label: 'Type' },
    size: { type: 'integer', label: 'Size' },
    sha256: { type: 'text', label: 'Hash' },
    uploaded_by: { type: 'integer', label: 'Uploaded by' },
  },
  indexes: [['entity', 'record_id']],
})

export const engineTables = [
  savedView,
  revision,
  batch,
  sourceDisplay,
  ...authTables,
  actionToken,
  recordLink,
  attachment,
]

export const reservedNames = new Set([MIGRATIONS, ...engineTables.map((t) => t.name)])
