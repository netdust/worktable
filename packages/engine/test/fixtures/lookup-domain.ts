import { type Domain, defineDataset, refuse } from '../../src'

// Plain, inherited and self-relation lookups, in generic words.
const phase = { open: 'Open', done: 'Done' }

const team = defineDataset({
  name: 'team',
  label: 'Teams',
  title: 'name',
  custom: false,
  columns: { name: { type: 'text', label: 'Name' } },
})

const item = defineDataset({
  name: 'item',
  label: 'Items',
  title: 'name',
  custom: false,
  columns: {
    name: { type: 'text', label: 'Name' },
    team_id: { type: 'integer', label: 'Team', relation: 'team' },
    phase: { type: 'text', label: 'Phase', default: 'open', options: phase, tones: { open: 'sky', done: 'ok' } },
  },
  lookups: { team_name: { label: 'Team name', via: 'team_id', field: 'name' } },
})

const line = defineDataset({
  name: 'line',
  label: 'Lines',
  title: 'name',
  custom: false,
  columns: {
    name: { type: 'text', label: 'Name' },
    item_id: { type: 'integer', label: 'Item', relation: 'item' },
    team_id: { type: 'integer', label: 'Own team', relation: 'team', nullable: true, hidden: true },
    phase: { type: 'text', label: 'Own phase', nullable: true, options: phase },
  },
  lifecycle: { column: 'phase', transitions: [{ from: ['open'], to: 'done', roles: ['editor'] }] },
  lookups: {
    team: { label: 'Team', via: 'item_id', field: 'team_id', own: 'team_id', from: 'Item' },
  },
})

const node = defineDataset({
  name: 'node',
  label: 'Nodes',
  title: 'name',
  custom: false,
  columns: {
    name: { type: 'text', label: 'Name' },
    parent_id: { type: 'integer', label: 'Parent id', relation: 'node', nullable: true },
  },
  lookups: { parent_name: { label: 'Parent', via: 'parent_id', field: 'name' } },
})

type Values = Record<string, unknown>
const accept = { create: (values: Values) => values, update: (values: Values) => values }
const lineWrite = (values: Values) => (values.team_id === 99 ? refuse('team 99 is closed') : values)

const domain: Domain = {
  datasets: [team, item, line, node],
  queries: [],
  writers: {
    team: accept,
    item: accept,
    node: accept,
    line: { create: lineWrite, update: lineWrite },
  },
  seed: (insert) => {
    insert('team', [{ name: 'One' }, { name: 'Two' }])
    insert('item', [{ name: 'First', team_id: 1, phase: 'open' }])
    insert('line', [
      { name: 'Own team', item_id: 1, team_id: 2 },
      { name: 'Inherits', item_id: 1 },
      { name: 'Own phase', item_id: 1, phase: 'done' },
    ])
    insert('node', [{ name: 'Root' }, { name: 'Leaf', parent_id: 1 }])
  },
  views: [],
}

export default domain
