import { Database } from 'bun:sqlite'
import { beforeEach, expect, test } from 'bun:test'
import { type Actor, createAccount, importExport, migrate } from '@worktable/engine'
import { signIn, testEngine } from '@worktable/engine/test/sign-in'
import theatre from '../src'
import invented from './fixtures/invented-export.json'

type Row = Record<string, unknown>

let sqlite: Database
let admin: Actor

beforeEach(() => {
  sqlite = new Database(':memory:')
  migrate(sqlite, theatre)
  admin = {
    id: createAccount(sqlite, theatre, 'boss@example.test', 'administrator'),
    role: 'administrator',
    subject: null,
  }
})

const run = (data: unknown, acceptReport = false) => importExport(sqlite, theatre, data, admin, { acceptReport })
const copy = (): typeof invented => structuredClone(invented)
const one = (sql: string, ...args: (string | number)[]) => sqlite.query(sql).get(...args) as Row

test('the invented export imports with zero refusals', async () => {
  const result = run(invented)
  expect(result).toEqual({
    counts: { organisatie: 2, productie: 3, activiteit: 5, persoon: 3, toewijzing: 7, beschikbaarheid: 2 },
    refused: [],
    committed: true,
  })

  const app = testEngine(sqlite, theatre)
  const res = await app.request('/api/rows/toewijzing', {
    headers: { host: '127.0.0.1:4310', cookie: await signIn(app, 'editor') },
  })
  const body = (await res.json()) as { total: number; rows: Row[] }
  expect({ status: res.status, total: body.total }).toEqual({ status: 200, total: 7 })
  expect(body.rows.find((r) => r.legacy_post_id === 502)?.notitie).toBe('Laika: maybe')
  // Imported rows are filled assignments: no role, one place each, their state as exported.
  expect(sqlite.query('SELECT DISTINCT rol_id, aantal FROM toewijzing').all()).toEqual([{ rol_id: null, aantal: 1 }])
  expect(sqlite.query("SELECT COUNT(*) AS n FROM toewijzing WHERE state = 'open'").get()).toEqual({ n: 0 })
})

test('derived columns, relations, legacy ids and custom land as the writers make them', () => {
  run(invented)
  const nacht = one('SELECT plandag, productie_id, locatie_id FROM activiteit WHERE legacy_post_id = 302')
  const productie = one('SELECT id FROM productie WHERE legacy_post_id = 201')
  const zaal = one('SELECT id, custom FROM organisatie WHERE legacy_post_id = 102')
  expect(nacht).toEqual({ plandag: '2026-12-31', productie_id: productie.id, locatie_id: zaal.id })
  expect(zaal.custom).toBe('{"capaciteit":120}')

  const placeholder = one('SELECT id FROM productie WHERE legacy_post_id = 0')
  expect(one('SELECT productie_id FROM activiteit WHERE legacy_post_id = 304').productie_id).toBe(placeholder.id)
  expect(one('SELECT weergavenaam FROM persoon WHERE legacy_post_id = 401').weergavenaam).toBe('Ada Voorbeeld')

  const days = sqlite.query('SELECT datum AS day FROM activiteit ORDER BY datum, start_at').all()
  expect(days.map((d) => (d as Row).day)).toEqual([
    '2026-12-31',
    '2027-01-01',
    '2027-01-01',
    '2027-01-04',
    '2027-01-04',
  ])
  expect(one('SELECT start_at, plandag FROM activiteit WHERE legacy_post_id = 305')).toEqual({
    start_at: null,
    plandag: '2027-01-04',
  })
})

test('a plandag in the export is refused: derived values come from the writer', () => {
  const data = copy()
  ;(data.datasets.activiteit[0] as Row).plandag = '2026-12-30'
  expect(() => run(data)).toThrow(expect.objectContaining({ code: 'bad_import' }))
  expect(one('SELECT COUNT(*) AS n FROM organisatie').n).toBe(0)
})

test('a Toewijzing with both persoon and naam is in the report, and nothing is committed', () => {
  const data = copy()
  data.datasets.toewijzing.push({ legacy_id: 508, activiteit_id: 303, persoon_id: 402, naam: 'Ook Verzonnen' } as never)
  const result = run(data)
  expect(result.refused).toEqual([
    { dataset: 'toewijzing', legacy_id: 508, message: 'Kies een persoon of een naam, niet allebei.' },
  ])
  expect(result.committed).toBe(false)
  expect(one('SELECT COUNT(*) AS n FROM toewijzing').n).toBe(0)
})

test('an uncleaned duplicate pair is refused by the writer, and --accept-report keeps the first', () => {
  const data = copy()
  data.datasets.toewijzing.push({ legacy_id: 509, activiteit_id: 301, persoon_id: 401, state: 'uitgenodigd' } as never)
  const result = run(data, true)
  expect(result.refused).toEqual([
    { dataset: 'toewijzing', legacy_id: 509, message: 'Deze persoon is al toegewezen aan deze activiteit.' },
  ])
  expect(result.counts.toewijzing).toBe(7)
})
