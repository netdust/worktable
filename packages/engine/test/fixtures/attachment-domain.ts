import { Database } from 'bun:sqlite'
import { type Domain, defineDataset, migrate, seedDomain } from '../../src'

const box = defineDataset({
  name: 'box',
  label: 'Boxes',
  title: 'name',
  custom: false,
  owners: { owner: 'id' },
  attachments: { kinds: { doc: 'Doc', photo: 'Photo' }, max_mb: 1, owner_visible: true },
  columns: { name: { type: 'text', label: 'Name' } },
})

export const domain: Domain = {
  datasets: [box],
  queries: [],
  writers: { box: { update: (values) => values } },
  seed: (insert) => insert('box', [{ name: 'one' }, { name: 'two' }]),
  views: [],
}

export function freshDb(): Database {
  const sqlite = new Database(':memory:')
  migrate(sqlite, domain)
  seedDomain(sqlite, domain)
  return sqlite
}
