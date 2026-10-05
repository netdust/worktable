import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { type Domain, defineDataset, defineQuery, MigrationError, migrate, seedDomain } from '../src'

const klant = defineDataset({
  name: 'klant',
  label: 'Klant',
  title: 'naam',
  custom: true,
  columns: { naam: { type: 'text', label: 'Naam' } },
})

const order = defineDataset({
  name: 'bestelling',
  label: 'Bestelling',
  title: 'omschrijving',
  date: 'datum',
  custom: false,
  columns: {
    omschrijving: { type: 'text', label: 'Omschrijving' },
    datum: { type: 'date', label: 'Datum', nullable: true },
    klant_id: { type: 'integer', label: 'Klant', relation: 'klant' },
  },
  indexes: [['datum']],
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
    insert('klant', [{ naam: 'Anna' }])
    insert('bestelling', [{ omschrijving: 'een', datum: '2026-10-12', klant_id: 1 }])
  },
  views: [
    {
      name: 'Alles',
      source_type: 'dataset',
      source: 'bestelling',
      skin: 'table',
      filters: { omschrijving: 'een' },
      sort: ['datum'],
      group_by: null,
      visible_fields: ['omschrijving'],
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
    expect(columns('klant')).toEqual(['id', 'naam', 'custom', 'created_at', 'updated_at', 'deleted_at'])
    expect(columns('bestelling')).toEqual([
      'id',
      'omschrijving',
      'datum',
      'klant_id',
      'created_at',
      'updated_at',
      'deleted_at',
    ])
  })

  test('creates declared indexes and foreign keys', () => {
    const sqlite = fresh()
    expect(names(sqlite.query('PRAGMA index_list(bestelling)').all())).toContain('bestelling_datum_idx')
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
    expect(rows.map((r) => r.source)).toEqual(['bestelling', 'klant', 'per_klant', 'revision', 'saved_view'])
    for (const r of rows) expect(r.hash).toMatch(/^[0-9a-f]{64}$/)
  })

  test('a second run with the same declarations changes nothing', () => {
    const sqlite = fresh()
    const before = sqlite.query('SELECT * FROM _migrations ORDER BY source').all()
    migrate(sqlite, domain())
    expect(sqlite.query('SELECT * FROM _migrations ORDER BY source').all()).toEqual(before)
  })

  test('a changed dataset declaration throws MigrationError naming it and leaves the table as it was', () => {
    const sqlite = fresh()
    const changed = defineDataset({
      ...klant,
      columns: { naam: { type: 'text', label: 'Naam' }, tel: { type: 'text', label: 'Tel' } },
    })
    const attempt = () => migrate(sqlite, domain({ datasets: [changed, order] }))
    expect(attempt).toThrow(MigrationError)
    try {
      attempt()
    } catch (e) {
      expect((e as MigrationError).source).toBe('klant')
    }
    expect(names(sqlite.query('PRAGMA table_info(klant)').all())).not.toContain('tel')
  })

  test('a changed query SQL recreates the view', () => {
    const sqlite = fresh()
    const sql = 'SELECT klant_id AS id, COUNT(*) + 100 AS aantal FROM bestelling GROUP BY klant_id'
    sqlite.run("INSERT INTO klant (naam) VALUES ('A')")
    sqlite.run("INSERT INTO bestelling (omschrijving, klant_id) VALUES ('x', 1)")
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
    expect(sqlite.query('SELECT naam, custom FROM klant').get()).toEqual({ naam: 'Anna', custom: '{}' })
    expect(sqlite.query('SELECT COUNT(*) AS n FROM bestelling').get()).toEqual({ n: 1 })
    expect(sqlite.query('SELECT name, filters, sort, group_by FROM saved_view').get()).toEqual({
      name: 'Alles',
      filters: '{"omschrijving":"een"}',
      sort: '["datum"]',
      group_by: null,
    })
  })
})
