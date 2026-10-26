import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { migrate, seedDomain } from '@worktable/engine'
import { signIn, testEngine } from '@worktable/engine/test/sign-in'
import studio from '../src'
import { localDay, localTime } from '../src/time'

type Body = Record<string, unknown>
type Row = Record<string, unknown>

const DAY = 86_400_000
const TESTMANS_WINKEL = 1
const VOORBEELD_SITE = 3
const OUD_ARCHIEF = 5

let sqlite: Database
let admin: (method: string, path: string, body?: unknown) => Promise<{ status: number; body: Body }>

beforeEach(async () => {
  sqlite = new Database(':memory:')
  migrate(sqlite, studio)
  seedDomain(sqlite, studio)
  const app = testEngine(sqlite, studio)
  const cookie = await signIn(app, 'administrator')
  admin = async (method, path, body) => {
    const headers: Record<string, string> = { host: '127.0.0.1:4310', cookie }
    if (body !== undefined) headers['content-type'] = 'application/json'
    const res = await app.request(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: res.status, body: (await res.json()) as Body }
  }
})

async function rows(source: string): Promise<Row[]> {
  const res = await admin('GET', `/api/rows/${source}?limit=500`)
  expect(res.status).toBe(200)
  return res.body.rows as Row[]
}

const checked = (site: number, at: string | null, gezondheid = 'ok') =>
  sqlite.query('UPDATE site SET laatste_check = ?, gezondheid = ? WHERE id = ?').run(at, gezondheid, site)
const daysAgo = (days: number) => localTime(new Date(Date.now() - days * DAY))
const reden = async (site: number) => (await rows('sites_aandacht')).find((r) => r.id === site)?.reden ?? null
const inOrde = async () => (await rows('sites_in_orde')).map((r) => r.id)

function insert(table: string, values: Row): number {
  const columns = Object.keys(values)
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
  return Number(sqlite.query(sql).run(...(Object.values(values) as (string | number | null)[])).lastInsertRowid)
}

describe('sites met aandacht', () => {
  test('an old check is attention, even when ok', async () => {
    checked(VOORBEELD_SITE, daysAgo(9))
    expect(await reden(VOORBEELD_SITE)).toBe('oud')
    checked(VOORBEELD_SITE, daysAgo(7))
    expect(await reden(VOORBEELD_SITE)).toBeNull()
    checked(VOORBEELD_SITE, null)
    expect(await reden(VOORBEELD_SITE)).toBe('nooit')
  })

  test('not in the registry is attention, and leaves Sites in orde', async () => {
    checked(OUD_ARCHIEF, daysAgo(1))
    expect(await reden(OUD_ARCHIEF)).toBe('weg')
    expect(await inOrde()).not.toContain(OUD_ARCHIEF)
  })

  test('an old check leaves Sites in orde', async () => {
    checked(VOORBEELD_SITE, daysAgo(1))
    expect(await inOrde()).toContain(VOORBEELD_SITE)
    checked(VOORBEELD_SITE, daysAgo(9))
    expect(await inOrde()).not.toContain(VOORBEELD_SITE)
  })

  // A tile shows its first five rows: a broken site must never sit below a retired one.
  test('the worst comes first: storing, let op, never checked, old, gone', async () => {
    checked(TESTMANS_WINKEL, null)
    checked(VOORBEELD_SITE, daysAgo(9))
    const lines = await rows('sites_aandacht')
    const ernst = Object.fromEntries(lines.map((r) => [r.reden, r.ernst]))
    expect(ernst).toEqual({ storing: 1, let_op: 2, nooit: 3, oud: 4, weg: 5 })
    const views = (await admin('GET', '/api/views')).body.views as Row[]
    expect(views.find((v) => v.name === 'Sites met aandacht')?.sort).toEqual(['ernst', 'naam'])
  })

  test('never checked means no check at all', async () => {
    checked(VOORBEELD_SITE, daysAgo(1), 'onbekend')
    expect(await reden(VOORBEELD_SITE)).toBe('onbekend')
    checked(VOORBEELD_SITE, daysAgo(9), 'onbekend')
    expect(await reden(VOORBEELD_SITE)).toBe('oud')
    checked(VOORBEELD_SITE, null, 'onbekend')
    expect(await reden(VOORBEELD_SITE)).toBe('nooit')
  })

  test('the Sites in orde view and the progress tile read sites_in_orde, unfiltered', async () => {
    const views = (await admin('GET', '/api/views')).body.views as Row[]
    expect(views.find((v) => v.name === 'Sites in orde')).toMatchObject({ source: 'sites_in_orde', filters: {} })
  })
})

describe('op tafel', () => {
  // Asked of SQLite, whose local day the query uses: bun test runs JavaScript in UTC, so near midnight the two differ.
  const sqliteDay = (day: string, modifier: string) =>
    (sqlite.query('SELECT date(?, ?) AS day').get(day, modifier) as { day: string }).day
  // Sunday of this week: the last day op tafel reaches.
  const sunday = () => sqliteDay(sqliteDay('now', 'localtime'), 'weekday 0')
  const dayAfter = (day: string) => sqliteDay(day, '+1 day')
  const titles = async () => (await rows('op_tafel')).map((r) => r.titel)

  test('op_tafel holds open tasks due this week or earlier, and no task without a deadline', async () => {
    insert('taak', { titel: 'Achterstallig', deadline: localDay(new Date(Date.now() - 9 * DAY)) })
    insert('taak', { titel: 'Zondag', deadline: sunday() })
    insert('taak', { titel: 'Volgende week', deadline: dayAfter(sunday()) })
    insert('taak', { titel: 'Zonder deadline' })
    insert('taak', { titel: 'Al gedaan', deadline: localDay(), status: 'gedaan' })
    const listed = await titles()
    expect(listed).toEqual(expect.arrayContaining(['Achterstallig', 'Zondag']))
    for (const absent of ['Volgende week', 'Zonder deadline', 'Al gedaan', 'Dashboard-plan nalezen'])
      expect(listed).not.toContain(absent)
  })

  // The worker's task per failure carries it, and Gedaan clears it (spec S11).
  test('a failed request is not on the table', async () => {
    const before = await titles()
    insert('actie', { titel: 'Smoketest · 2 sites', soort: 'smoketest', status: 'mislukt' })
    insert('actie', { titel: 'Bijwerken · 2 sites', soort: 'bijwerken', status: 'deels' })
    expect(await titles()).toEqual(before)
  })

  test('a taak line writes its status back to the taak, and leaves the table', async () => {
    const sources = (await admin('GET', '/api/schema')).body.sources as Record<
      string,
      { columns: Record<string, Body> }
    >
    expect(sources.op_tafel?.columns.status?.writes).toEqual({
      dataset: 'taak',
      field: 'status',
      key: 'taak_id',
    })
    const line = (await rows('op_tafel'))[0] as Row
    expect((await admin('PATCH', `/api/rows/taak/${line.taak_id}`, { status: 'gedaan' })).status).toBe(200)
    expect((await rows('op_tafel')).some((r) => r.id === line.id)).toBe(false)
  })
})

describe('the agenda', () => {
  test('the agenda holds agendapunten, requests by gepland_op and open tasks by deadline', async () => {
    const morgen = localDay(new Date(Date.now() + DAY))
    const gepland = insert('actie', {
      titel: 'Gezondheidscheck · 4 sites',
      soort: 'gezondheidscheck',
      gepland_op: `${morgen}T07:00:00`,
    })
    const open = insert('taak', { titel: 'Open taak', deadline: morgen })
    const gedaan = insert('taak', { titel: 'Gedane taak', deadline: morgen, status: 'gedaan' })
    const lines = await rows('agenda')
    const on = (match: (r: Row) => boolean) => lines.find(match)?.datum ?? null
    expect(on((r) => r.agendapunt_id === 1)).not.toBeNull()
    expect(on((r) => r.actie_id === gepland)).toBe(morgen)
    expect(lines.find((r) => r.actie_id === gepland)?.soort).toBe('opdracht')
    expect(on((r) => r.taak_id === open)).toBe(morgen)
    expect(on((r) => r.taak_id === gedaan)).toBeNull()
  })
})
