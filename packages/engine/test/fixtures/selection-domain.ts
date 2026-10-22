import { type Domain, defineDataset, refuse, type SelectionActionDecl, type Writer } from '../../src'

type Values = Record<string, unknown>

/** What each selection run's `run` received, for a test to read. */
export const seen: Values[][] = []

const bundle = defineDataset({
  name: 'bundle',
  label: 'Bundles',
  title: 'name',
  custom: false,
  owners: { owner: 'id' },
  columns: { name: { type: 'text', label: 'Name' } },
  links: { members: { label: 'Members', item: 'Tie', dataset: 'tie', key: 'bundle_id', target: 'member_id' } },
})

const member = defineDataset({
  name: 'member',
  label: 'Members',
  title: 'name',
  custom: false,
  owners: { owner: 'bundle_id' },
  columns: {
    name: { type: 'text', label: 'Name' },
    bundle_id: { type: 'integer', label: 'Bundle', relation: 'bundle' },
  },
})

// Out of the tree: a bundle's members are tied to it here, and opened from the bundle.
const tie = defineDataset({
  name: 'tie',
  label: 'Ties',
  title: 'note',
  custom: false,
  listed: false,
  columns: {
    bundle_id: { type: 'integer', label: 'Bundle', relation: 'bundle' },
    member_id: { type: 'integer', label: 'Member', relation: 'member' },
    note: { type: 'text', label: 'Note', nullable: true, long: true },
  },
})

const accept = (values: Record<string, unknown>) => values

const tieWriter: Writer = {
  create: (values) => {
    if (values.note === 'refused') refuse('that note is refused')
    return values
  },
  delete: () => {},
}

const gather: SelectionActionDecl = {
  label: 'Gather',
  on: 'member',
  many: true,
  input: { name: { type: 'text', label: 'Name' } },
  run: (records, input) => {
    seen.push(records)
    return [
      {
        dataset: 'bundle',
        values: { name: input.name },
        children: (id) =>
          records.map((record) => ({
            dataset: 'tie',
            values: { bundle_id: id, member_id: record.id, note: input.name },
          })),
      },
    ]
  },
}

// Counts the call and writes nothing, so 500 ids stay cheap.
const touch: SelectionActionDecl = {
  label: 'Touch',
  on: 'member',
  many: true,
  input: {},
  run: (records) => {
    seen.push(records)
    return []
  },
}

const domain: Domain = {
  datasets: [bundle, member, tie],
  queries: [],
  writers: {
    bundle: { create: accept, update: accept, delete: () => {} },
    member: { create: accept, update: accept, delete: () => {} },
    tie: tieWriter,
  },
  actions: {
    gather,
    touch,
    rename: {
      label: 'Rename',
      on: 'member',
      input: {},
      run: (record) => ({ updates: [{ dataset: 'member', id: Number(record.id), values: { name: 'renamed' } }] }),
    },
  },
  seed: (insert) => {
    insert('bundle', [{ name: 'Alpha' }, { name: 'Beta' }])
    insert('member', [
      { name: 'Ann', bundle_id: 1 },
      { name: 'Bob', bundle_id: 1 },
      { name: 'Cy', bundle_id: 2 },
      { name: 'Di', bundle_id: 1 },
    ])
  },
  views: [
    {
      name: 'All members',
      source_type: 'dataset',
      source: 'member',
      skin: 'table',
      filters: {},
      sort: ['name'],
      group_by: null,
      visible_fields: ['bundle_id'],
    },
    {
      name: 'Alpha members',
      source_type: 'dataset',
      source: 'member',
      skin: 'table',
      filters: { bundle_id: 1 },
      sort: ['name'],
      group_by: null,
      visible_fields: ['bundle_id'],
    },
    {
      name: 'All bundles',
      source_type: 'dataset',
      source: 'bundle',
      skin: 'table',
      filters: {},
      sort: ['name'],
      group_by: null,
      visible_fields: ['members'],
    },
  ],
}

export default domain
