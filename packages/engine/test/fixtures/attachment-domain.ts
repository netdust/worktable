import { Database } from 'bun:sqlite'
import { type DatasetDecl, type Domain, defineDataset, migrate, seedDomain } from '../../src'

const box = defineDataset({
  name: 'box',
  label: 'Boxes',
  title: 'name',
  custom: false,
  owners: { owner: 'id' },
  attachments: { kinds: { doc: 'Doc', photo: 'Photo' }, max_mb: 1, owner_visible: true },
  columns: { name: { type: 'text', label: 'Name' } },
})

const named = (name: string, label: string, attachments: DatasetDecl['attachments']) =>
  defineDataset({
    name,
    label,
    title: 'name',
    custom: false,
    owners: { owner: 'id' },
    attachments,
    columns: { name: { type: 'text', label: 'Name' } },
  })

// Its owner reads and adds files.
const bin = named('bin', 'Bins', { kinds: { doc: 'Doc' }, owner_visible: true, owner_writable: true })
// Its owner reads the record, never its files.
const shelf = named('shelf', 'Shelves', { kinds: { doc: 'Doc' } })
// No writer: read-only, so no file is added or removed.
const crate = named('crate', 'Crates', { kinds: { doc: 'Doc' } })

export const domain: Domain = {
  datasets: [box, bin, shelf, crate],
  queries: [],
  writers: { box: { update: (values) => values }, bin: { update: (v) => v }, shelf: { update: (v) => v } },
  seed: (insert) => {
    insert('box', [{ name: 'one' }, { name: 'two' }])
    for (const name of ['bin', 'shelf', 'crate']) insert(name, [{ name: 'one' }])
  },
  views: [],
}

export function freshDb(): Database {
  const sqlite = new Database(':memory:')
  migrate(sqlite, domain)
  seedDomain(sqlite, domain)
  return sqlite
}
