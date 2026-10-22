import {
  type ActionDecl,
  type Domain,
  defineDataset,
  defineQuery,
  refuse,
  type SelectionActionDecl,
  type Writer,
} from '../../src'

type Values = Record<string, unknown>

/** What each selection run's `run` received, for a test to read. */
export const seen: Values[][] = []

const bundle = defineDataset({
  name: 'bundle',
  label: 'Bundles',
  title: 'name',
  custom: false,
  owners: { owner: 'id' },
  columns: {
    name: { type: 'text', label: 'Name' },
    phase: { type: 'text', label: 'Phase', default: 'open', options: { open: 'Open', closed: 'Closed' } },
  },
  links: {
    members: { label: 'Members', item: 'Tie', dataset: 'tie', key: 'bundle_id', target: 'member_id' },
    entries: {
      label: 'Entries',
      item: 'Entry',
      dataset: 'entry',
      key: 'bundle_id',
      target: 'member_id',
      state: 'status',
      detail: 'note',
    },
    memos: { label: 'Memos', item: 'Entry', dataset: 'entry', key: 'bundle_id', target: 'member_id', detail: 'memo' },
  },
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
    stage: {
      type: 'text',
      label: 'Stage',
      default: 'new',
      options: { new: 'New', active: 'Active', done: 'Done', parked: 'Parked' },
    },
  },
  lookups: { bundle_phase: { label: 'Bundle phase', via: 'bundle_id', field: 'phase' } },
  lifecycle: {
    column: 'stage',
    live: ['active'],
    transitions: [
      { from: ['new'], to: 'active', roles: ['administrator', 'editor', 'owner'], button: 'Start' },
      {
        from: ['active'],
        to: 'done',
        roles: ['administrator', 'editor'],
        button: 'Finish',
        when: { bundle_phase: 'open' },
      },
      { from: ['active'], to: 'new', roles: ['administrator'], button: 'Back' },
      { from: '*', to: 'parked', roles: ['administrator', 'editor'], button: 'Park' },
      { from: ['done'], to: 'new', roles: ['administrator', 'editor'], label: 'Reopen' },
      {
        from: ['new'],
        to: 'done',
        roles: ['administrator', 'editor', 'owner'],
        button: 'Skip',
        when: { bundle_phase: null },
      },
    ],
  },
})

// A bundle's entry for a member: the link dataset with its own lifecycle, buttons and detail text.
const entry = defineDataset({
  name: 'entry',
  label: 'Entries',
  title: 'note',
  custom: false,
  listed: false,
  owners: { owner: 'bundle_id' },
  columns: {
    bundle_id: { type: 'integer', label: 'Bundle', relation: 'bundle' },
    member_id: { type: 'integer', label: 'Member', relation: 'member' },
    status: {
      type: 'text',
      label: 'Status',
      default: 'pending',
      options: { pending: 'Pending', confirmed: 'Confirmed', declined: 'Declined' },
    },
    note: { type: 'text', label: 'Note', nullable: true, owner_visible: true },
    memo: { type: 'text', label: 'Memo', nullable: true },
  },
  lookups: { bundle_phase: { label: 'Bundle phase', via: 'bundle_id', field: 'phase' } },
  lifecycle: {
    column: 'status',
    transitions: [
      {
        from: ['pending'],
        to: 'confirmed',
        roles: ['administrator', 'editor', 'owner'],
        button: 'Confirm',
        when: { bundle_phase: 'open' },
      },
      { from: ['pending'], to: 'declined', roles: ['administrator', 'editor'], button: 'Decline' },
    ],
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

// A dated record a query creates: its day is filled in from the calendar it is added on.
const slot = defineDataset({
  name: 'slot',
  label: 'Slots',
  title: 'name',
  custom: false,
  columns: {
    name: { type: 'text', label: 'Name' },
    day: { type: 'date', label: 'Day' },
    bundle_id: { type: 'integer', label: 'Bundle', relation: 'bundle', nullable: true },
  },
})

const roster = defineQuery({
  name: 'roster',
  label: 'Roster',
  title: 'name',
  date: 'day',
  calendar: { day: 'day', lanes: ['bundle_id'] },
  creates: 'slot',
  sql: 'SELECT s.id, s.name, s.day, s.bundle_id FROM slot s WHERE s.deleted_at IS NULL',
  columns: {
    id: { type: 'integer', label: 'Id' },
    name: { type: 'text', label: 'Name' },
    day: { type: 'date', label: 'Day' },
    bundle_id: { type: 'integer', label: 'Bundle', relation: 'bundle' },
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

// Opens the record it ran on, and runs only while that record's bundle is open.
const settle: ActionDecl = {
  label: 'Settle',
  on: 'member',
  input: {},
  when: { bundle_phase: 'open' },
  opens: true,
  run: (record) => {
    seen.push([record])
    return []
  },
}

const sweep: SelectionActionDecl = {
  label: 'Sweep',
  on: 'member',
  many: true,
  input: {},
  when: { bundle_phase: 'open' },
  opens: true,
  run: (records) => {
    seen.push(records)
    return []
  },
}

const domain: Domain = {
  datasets: [bundle, member, tie, slot, entry],
  queries: [roster],
  writers: {
    bundle: { create: accept, update: accept, delete: () => {} },
    member: { create: accept, update: accept, delete: () => {} },
    tie: tieWriter,
    slot: { create: accept, update: accept, delete: () => {} },
    entry: { create: accept, update: accept, delete: () => {} },
  },
  actions: {
    settle,
    sweep,
    gather,
    touch,
    // On a dataset an owner cannot read.
    tidy: { label: 'Tidy', on: 'tie', many: true, input: {}, run: () => [] } satisfies SelectionActionDecl,
    // A picked record the caller must be able to read.
    pair: {
      label: 'Pair',
      on: 'member',
      many: true,
      input: { bundle: { relation: 'bundle', label: 'Bundle' } },
      run: (records) => {
        seen.push(records)
        return []
      },
    } satisfies SelectionActionDecl,
    rename: {
      label: 'Rename',
      on: 'member',
      input: {},
      run: (record) => ({ updates: [{ dataset: 'member', id: Number(record.id), values: { name: 'renamed' } }] }),
    },
  },
  seed: (insert) => {
    insert('bundle', [{ name: 'Alpha' }, { name: 'Beta', phase: 'closed' }])
    insert('member', [
      { name: 'Ann', bundle_id: 1 },
      { name: 'Bob', bundle_id: 1 },
      { name: 'Cy', bundle_id: 2 },
      { name: 'Di', bundle_id: 1 },
      ...Array.from({ length: 110 }, (_, n) => ({ name: `Extra ${String(n + 1).padStart(3, '0')}`, bundle_id: 2 })),
    ])
    insert('entry', [
      { bundle_id: 1, member_id: 1, note: 'Bring a pen', memo: 'Kept inside' },
      { bundle_id: 2, member_id: 3, note: 'Late', memo: 'Also inside' },
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
      name: 'Beta members',
      source_type: 'dataset',
      source: 'member',
      skin: 'table',
      filters: { bundle_id: 2 },
      sort: ['name'],
      group_by: null,
      visible_fields: ['bundle_id'],
    },
    {
      name: 'Calendar',
      source_type: 'query',
      source: 'roster',
      skin: 'calendar',
      filters: {},
      sort: ['day'],
      group_by: null,
      visible_fields: [],
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
