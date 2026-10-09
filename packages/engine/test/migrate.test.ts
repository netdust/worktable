import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type Domain, defineDataset, defineQuery, MigrationError, migrate, seedDomain } from '../src'

const klant = defineDataset({
  name: 'klant',
  label: 'Klant',
  title: 'name',
  custom: true,
  columns: { name: { type: 'text', label: 'Name' } },
})

const order = defineDataset({
  name: 'bestelling',
  label: 'Bestelling',
  title: 'description',
  date: 'date',
  custom: false,
  columns: {
    description: { type: 'text', label: 'Description' },
    date: { type: 'date', label: 'Date', nullable: true },
    klant_id: { type: 'integer', label: 'Klant', relation: 'klant' },
  },
  indexes: [['date']],
})

const perKlant = (sql = 'SELECT klant_id AS id, COUNT(*) AS aantal FROM bestelling GROUP BY klant_id') =>
  defineQuery({
    name: 'per_klant',
    label: 'Per klant',
    title: 'id',
    sql,
    columns: { id: { type: 'integer', label: 'Id' }, aantal: { type: 'integer', label: 'Aantal' } },
  })

const domain = (overrides: Partial<Domain> = {}): Domain => ({
  datasets: [klant, order],
  queries: [perKlant()],
  seed: (insert) => {
    insert('klant', [{ name: 'Anna' }])
    insert('bestelling', [{ description: 'een', date: '2026-10-12', klant_id: 1 }])
  },
  views: [
    {
      name: 'Alles',
      source_type: 'dataset',
      source: 'bestelling',
      skin: 'table',
      filters: { description: 'een' },
      sort: ['date'],
      group_by: null,
      visible_fields: ['description'],
    },
  ],
  ...overrides,
})

const fresh = (d = domain()) => {
  const sqlite = new Database(':memory:')
  migrate(sqlite, d)
  return sqlite
}

const names = (rows: unknown) => (rows as { name: string }[]).map((r) => r.name)

describe('migrate', () => {
  test('creates each dataset table with id, custom, created_at, updated_at, deleted_at and its declared columns', () => {
    const sqlite = fresh()
    const columns = (t: string) => names(sqlite.query(`PRAGMA table_info(${t})`).all())
    expect(columns('klant')).toEqual(['id', 'name', 'custom', 'created_at', 'updated_at', 'deleted_at'])
    expect(columns('bestelling')).toEqual([
      'id',
      'description',
      'date',
      'klant_id',
      'created_at',
      'updated_at',
      'deleted_at',
    ])
  })

  test('creates declared indexes and foreign keys', () => {
    const sqlite = fresh()
    expect(names(sqlite.query('PRAGMA index_list(bestelling)').all())).toContain('bestelling_date_idx')
    const keys = sqlite.query('PRAGMA foreign_key_list(bestelling)').all() as { table: string; from: string }[]
    expect(keys).toMatchObject([{ table: 'klant', from: 'klant_id' }])
  })

  test('creates the query as a view', () => {
    const sqlite = fresh()
    const row = sqlite.query("SELECT type FROM sqlite_master WHERE name = 'per_klant'").get()
    expect(row).toEqual({ type: 'view' })
  })

  test('records each source and its hash in _migrations', () => {
    const rows = fresh().query('SELECT source, hash FROM _migrations ORDER BY source').all() as {
      source: string
      hash: string
    }[]
    expect(rows.map((r) => r.source)).toEqual([
      'account',
      'action_token',
      'auth_session',
      'batch',
      'bestelling',
      'klant',
      'magic_link',
      'per_klant',
      'rate_limit',
      'record_link',
      'revision',
      'saved_view',
      'source_display',
    ])
    for (const r of rows) expect(r.hash).toMatch(/^[0-9a-f]{64}$/)
  })

  test('a second run with the same declarations changes nothing', () => {
    const sqlite = fresh()
    const before = sqlite.query('SELECT * FROM _migrations ORDER BY source').all()
    migrate(sqlite, domain())
    expect(sqlite.query('SELECT * FROM _migrations ORDER BY source').all()).toEqual(before)
  })

  test('a changed query SQL recreates the view', () => {
    const sqlite = fresh()
    const sql = 'SELECT klant_id AS id, COUNT(*) + 100 AS aantal FROM bestelling GROUP BY klant_id'
    sqlite.run("INSERT INTO klant (name) VALUES ('A')")
    sqlite.run("INSERT INTO bestelling (description, klant_id) VALUES ('x', 1)")
    migrate(sqlite, domain({ queries: [perKlant(sql)] }))
    expect(sqlite.query('SELECT aantal FROM per_klant').get()).toEqual({ aantal: 101 })
  })

  test('creates saved_view', () => {
    const columns = names(fresh().query('PRAGMA table_info(saved_view)').all())
    expect(columns).toEqual(
      expect.arrayContaining([
        'name',
        'source_type',
        'source',
        'skin',
        'filters',
        'sort',
        'group_by',
        'visible_fields',
      ]),
    )
    expect(columns).toEqual(expect.arrayContaining(['shared', 'owner_id', 'share_token', 'format', 'public']))
  })

  test("seedDomain inserts the domain's rows and its saved views", () => {
    const sqlite = fresh()
    seedDomain(sqlite, domain())
    expect(sqlite.query('SELECT name, custom FROM klant').get()).toEqual({ name: 'Anna', custom: '{}' })
    expect(sqlite.query('SELECT COUNT(*) AS n FROM bestelling').get()).toEqual({ n: 1 })
    expect(sqlite.query('SELECT name, filters, sort, group_by FROM saved_view').get()).toEqual({
      name: 'Alles',
      filters: '{"description":"een"}',
      sort: '["date"]',
      group_by: null,
    })
  })
})

describe('migrate a changed dataset', () => {
  const client = defineDataset({
    name: 'client',
    label: 'Client',
    title: 'name',
    custom: false,
    columns: { name: { type: 'text', label: 'Name' } },
  })
  const orderCols = {
    label: { type: 'text', label: 'Label' },
    qty: { type: 'integer', label: 'Qty', nullable: true },
    client_id: { type: 'integer', label: 'Client', nullable: true },
  } as const
  const order = (columns: Record<string, object> = orderCols, indexes?: string[][]) =>
    defineDataset({
      name: 'orders',
      label: 'Orders',
      title: 'label',
      custom: false,
      columns: columns as never,
      indexes,
    })
  const byClient = defineQuery({
    name: 'by_client',
    label: 'By client',
    title: 'id',
    sql: 'SELECT client_id AS id, COUNT(*) AS n FROM orders WHERE deleted_at IS NULL GROUP BY client_id',
    columns: { id: { type: 'integer', label: 'Id' }, n: { type: 'integer', label: 'N' } },
  })
  const domainOf = (o = order()): Domain => ({
    datasets: [client, o],
    queries: [byClient],
    seed: () => {},
    views: [],
  })

  const dir = () => mkdtempSync(join(tmpdir(), 'wt-migrate-'))
  const seeded = (rows = true) => {
    const file = join(dir(), 'db.sqlite')
    const sqlite = new Database(file, { create: true })
    migrate(sqlite, domainOf())
    if (rows) {
      sqlite.run("INSERT INTO client (name) VALUES ('Ann'), ('Bo')")
      sqlite.run("INSERT INTO orders (label, qty, client_id) VALUES ('a', 1, 1), ('b', 2, 2), ('c', NULL, 2)")
    }
    return { file, sqlite }
  }
  const all = (sqlite: Database, t: string) => sqlite.query(`SELECT * FROM ${t} ORDER BY id`).all()
  const without = (rows: unknown[], key: string) =>
    (rows as Record<string, unknown>[]).map(({ [key]: _drop, ...rest }) => rest)
  const fkCheck = (sqlite: Database) => sqlite.query('PRAGMA foreign_key_check').all()

  test('a new nullable column is added by ALTER and reads NULL', () => {
    const { file, sqlite } = seeded()
    const before = all(sqlite, 'orders')
    migrate(sqlite, domainOf(order({ ...orderCols, note: { type: 'text', label: 'Note', nullable: true } })))
    const after = all(sqlite, 'orders') as Record<string, unknown>[]
    expect(without(after, 'note')).toEqual(before)
    expect(after.every((r) => r.note === null)).toBe(true)
    expect(existsSync(`${file}.pre-migrate`)).toBe(false)
  })

  test('a new column with a default is filled with it', () => {
    const { sqlite } = seeded()
    migrate(sqlite, domainOf(order({ ...orderCols, done: { type: 'boolean', label: 'Done', default: false } })))
    expect(sqlite.query('SELECT DISTINCT done FROM orders').all()).toEqual([{ done: 0 }])
  })

  test('a new index is created', () => {
    const { sqlite } = seeded()
    migrate(sqlite, domainOf(order(orderCols, [['qty']])))
    expect(names(sqlite.query('PRAGMA index_list(orders)').all())).toContain('orders_qty_idx')
  })

  test('a relation added to an existing column rebuilds the table and keeps rows and ids', () => {
    const { sqlite } = seeded()
    const before = all(sqlite, 'orders')
    migrate(sqlite, domainOf(order({ ...orderCols, client_id: { ...orderCols.client_id, relation: 'client' } })))
    expect(all(sqlite, 'orders')).toEqual(before)
    const keys = sqlite.query('PRAGMA foreign_key_list(orders)').all() as { table: string; from: string }[]
    expect(keys).toMatchObject([{ table: 'client', from: 'client_id' }])
    expect(fkCheck(sqlite)).toEqual([])
    expect(sqlite.query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 })
  })

  test('a dropped column is rebuilt away', () => {
    const { sqlite } = seeded()
    const { qty: _qty, ...rest } = orderCols
    migrate(sqlite, domainOf(order(rest)))
    expect(names(sqlite.query('PRAGMA table_info(orders)').all())).not.toContain('qty')
    expect(all(sqlite, 'orders')).toHaveLength(3)
  })

  test('integer to text rebuilds and reads the values back as text', () => {
    const { sqlite } = seeded()
    migrate(sqlite, domainOf(order({ ...orderCols, qty: { type: 'text', label: 'Qty', nullable: true } })))
    expect(sqlite.query('SELECT qty FROM orders ORDER BY id').all()).toEqual([
      { qty: '1' },
      { qty: '2' },
      { qty: null },
    ])
  })

  test('ids continue after a rebuild', () => {
    const { sqlite } = seeded()
    sqlite.run('DELETE FROM orders WHERE id = 3')
    migrate(sqlite, domainOf(order({ ...orderCols, client_id: { ...orderCols.client_id, relation: 'client' } })))
    sqlite.run("INSERT INTO orders (label) VALUES ('d')")
    expect(sqlite.query("SELECT id FROM orders WHERE label = 'd'").get()).toEqual({ id: 4 })
  })

  test('a query reading the rebuilt table returns the same rows', () => {
    const { sqlite } = seeded()
    const before = sqlite.query('SELECT * FROM by_client ORDER BY id').all()
    migrate(sqlite, domainOf(order({ ...orderCols, client_id: { ...orderCols.client_id, relation: 'client' } })))
    expect(sqlite.query('SELECT * FROM by_client ORDER BY id').all()).toEqual(before)
  })

  const refused = (next: ReturnType<typeof order>, column: string) => {
    const { file, sqlite } = seeded()
    sqlite.close()
    const bytes = readFileSync(file)
    const again = new Database(file)
    let error: unknown
    try {
      migrate(again, domainOf(next))
    } catch (e) {
      error = e
    }
    again.close()
    expect(error).toBeInstanceOf(MigrationError)
    expect((error as MigrationError).source).toBe('orders')
    expect((error as Error).message).toContain(`column "${column}"`)
    expect(readFileSync(file).equals(bytes)).toBe(true)
    expect(existsSync(`${file}.pre-migrate`)).toBe(false)
  }

  test('a new NOT NULL column without a default on a non-empty table is refused untouched', () => {
    refused(order({ ...orderCols, code: { type: 'text', label: 'Code' } }), 'code')
  })

  test('a lossy retype on a non-empty table is refused untouched', () => {
    refused(order({ ...orderCols, label: { type: 'integer', label: 'Label' } }), 'label')
  })

  test('nullable to NOT NULL while a NULL is stored is refused untouched', () => {
    refused(order({ ...orderCols, qty: { type: 'integer', label: 'Qty' } }), 'qty')
  })

  test('nullable to NOT NULL with a default while a NULL is stored is refused untouched', () => {
    refused(order({ ...orderCols, qty: { type: 'integer', label: 'Qty', default: 0 } }), 'qty')
  })

  test('a view left from a removed query does not break a later rebuild, and is dropped', () => {
    const { sqlite } = seeded()
    const stale = defineQuery({ ...byClient, name: 'stale_view', sql: 'SELECT id, label FROM orders' })
    migrate(sqlite, { ...domainOf(), queries: [byClient, stale] })
    migrate(sqlite, domainOf(order({ ...orderCols, client_id: { ...orderCols.client_id, relation: 'client' } })))
    expect(sqlite.query("SELECT name FROM sqlite_master WHERE type = 'view' ORDER BY name").all()).toEqual([
      { name: 'by_client' },
    ])
  })

  test('an orphan already stored neither stops a no-op start nor a rebuild', () => {
    const { sqlite } = seeded()
    const related = { ...orderCols, client_id: { ...orderCols.client_id, relation: 'client' } }
    migrate(sqlite, domainOf(order(related)))
    sqlite.run('PRAGMA foreign_keys = OFF')
    sqlite.run("INSERT INTO orders (label, client_id) VALUES ('orphan', 99)")
    sqlite.run('PRAGMA foreign_keys = ON')
    expect(() => migrate(sqlite, domainOf(order(related)))).not.toThrow()
    const { qty: _qty, ...rest } = related
    expect(() => migrate(sqlite, domainOf(order(rest)))).not.toThrow()
    expect(sqlite.query("SELECT COUNT(*) AS n FROM orders WHERE label = 'orphan'").get()).toEqual({ n: 1 })
  })

  test('a new NOT NULL column without a default is fine on an empty table', () => {
    const { sqlite } = seeded(false)
    migrate(sqlite, domainOf(order({ ...orderCols, code: { type: 'text', label: 'Code' } })))
    expect(names(sqlite.query('PRAGMA table_info(orders)').all())).toContain('code')
  })

  test('a rebuild leaves <db>.pre-migrate holding the old schema and every old row', () => {
    const { file, sqlite } = seeded()
    const before = all(sqlite, 'orders')
    migrate(sqlite, domainOf(order({ ...orderCols, client_id: { ...orderCols.client_id, relation: 'client' } })))
    const copy = new Database(`${file}.pre-migrate`, { readonly: true })
    expect(all(copy, 'orders')).toEqual(before)
    expect(copy.query('PRAGMA foreign_key_list(orders)').all()).toEqual([])
    copy.close()
  })

  test('a second rebuild replaces the copy with the state just before it', () => {
    const { file, sqlite } = seeded()
    const related = { ...orderCols, client_id: { ...orderCols.client_id, relation: 'client' } }
    migrate(sqlite, domainOf(order(related)))
    sqlite.run("INSERT INTO orders (label) VALUES ('between')")
    const { qty: _qty, ...rest } = related
    migrate(sqlite, domainOf(order(rest)))
    const copy = new Database(`${file}.pre-migrate`, { readonly: true })
    expect(copy.query("SELECT COUNT(*) AS n FROM orders WHERE label = 'between'").get()).toEqual({ n: 1 })
    expect(names(copy.query('PRAGMA table_info(orders)').all())).toContain('qty')
    copy.close()
  })
})

describe('serve.ts on a refused migration', () => {
  const serve = join(import.meta.dir, '..', 'src', 'serve.ts')
  const domainFile = join(import.meta.dir, 'fixtures', 'refusal-domain.ts')

  test('exits 1 and names the dataset and column on stderr', async () => {
    const db = join(mkdtempSync(join(tmpdir(), 'wt-serve-')), 'db.sqlite')
    const first = new Database(db, { create: true })
    const { default: before } = await import(domainFile)
    migrate(first, before)
    first.run("INSERT INTO item (label) VALUES ('x')")
    first.close()

    const run = Bun.spawn(['bun', serve, '--domain', domainFile, '--db', db, '--port', '4399'], {
      env: { ...process.env, REFUSAL_STEP: '1' },
      stderr: 'pipe',
      stdout: 'pipe',
    })
    const code = await run.exited
    const stderr = await new Response(run.stderr).text()
    expect(code).toBe(1)
    expect(stderr).toContain('dataset "item" column "code"')
    expect(stderr).not.toContain('    at ')
  }, 20_000)
})
