import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrate, seedDomain } from '@worktable/engine'
import { recordLinkFor } from '@worktable/engine/src/record-link'
import { signIn, TEST_LINK_SECRET, testEngine } from '@worktable/engine/test/sign-in'
import theatre from '../src'

const HOST = '127.0.0.1:4310'

let sqlite: Database
let app: ReturnType<typeof testEngine>

// date('now') in SQLite is UTC, so the test counts days in UTC too.
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

const insert = (sql: string, ...values: (string | number | null)[]) =>
  Number(sqlite.query(sql).run(...values).lastInsertRowid)

const production = (titel: string) => insert('INSERT INTO productie (titel) VALUES (?)', titel)
const activity = (productie: number, datum: string) =>
  insert(
    "INSERT INTO activiteit (productie_id, soort, datum, plandag, status) VALUES (?, 'repetitie', ?, ?, 'bevestigd')",
    productie,
    datum,
    datum,
  )
const person = (naam: string) =>
  insert("INSERT INTO persoon (voornaam, achternaam, weergavenaam) VALUES (?, 'Proef', ?)", naam, `${naam} Proef`)
const assign = (activiteit: number, persoon: number, state: string) =>
  insert(
    'INSERT INTO toewijzing (activiteit_id, persoon_id, rol_id, state) VALUES (?, ?, 1, ?)',
    activiteit,
    persoon,
    state,
  )

const productionsOf = (persoon: number) =>
  (
    sqlite.query('SELECT productie FROM mijn_producties WHERE persoon_id = ? ORDER BY productie').all(persoon) as {
      productie: string
    }[]
  ).map((row) => row.productie)

function setDays(value: number | null): void {
  const parameters = value === null ? { dag_grens_uur: 5 } : { dag_grens_uur: 5, toegang_dagen: value }
  sqlite.run("UPDATE organisatie SET parameters = ? WHERE soort = 'eigen'", [JSON.stringify(parameters)])
}

beforeEach(() => {
  sqlite = new Database(':memory:')
  migrate(sqlite, theatre)
  seedDomain(sqlite, theatre)
  app = testEngine(sqlite, theatre)
})

describe('mijn_producties', () => {
  test('a bevestigd Toewijzing opens the production until toegang_dagen after its last activity', () => {
    const tine = person('Tine')
    for (const [titel, last] of [
      ['Twintig', 20],
      ['Dertig', 30],
      ['Eenendertig', 31],
    ] as const) {
      const p = production(titel)
      assign(activity(p, daysAgo(last + 5)), tine, 'bevestigd')
      // The production's last activity counts, not the person's own.
      activity(p, daysAgo(last))
    }
    expect(productionsOf(tine)).toEqual(['Dertig', 'Twintig'])
  })

  test('geweigerd, geannuleerd, uitgenodigd and open do not open a production', () => {
    const tine = person('Tine')
    for (const state of ['geweigerd', 'geannuleerd', 'uitgenodigd', 'open']) {
      assign(activity(production(`Proef ${state}`), daysAgo(-3)), tine, state)
    }
    expect(productionsOf(tine)).toEqual([])
  })

  test("the own organisation's toegang_dagen is read, and 30 when it is not set", () => {
    const tine = person('Tine')
    assign(activity(production('Twintig'), daysAgo(20)), tine, 'bevestigd')
    assign(activity(production('Veertig'), daysAgo(40)), tine, 'bevestigd')

    setDays(null)
    expect(productionsOf(tine)).toEqual(['Twintig'])
    setDays(10)
    expect(productionsOf(tine)).toEqual([])
    setDays(45)
    expect(productionsOf(tine)).toEqual(['Twintig', 'Veertig'])
  })

  test('one row per production, its role names as text, never relation ids to read', () => {
    const tine = person('Tine')
    const p = production('Proef')
    assign(activity(p, daysAgo(-1)), tine, 'bevestigd')
    insert(
      "INSERT INTO toewijzing (activiteit_id, persoon_id, rol_id, state) VALUES (?, ?, 2, 'bevestigd')",
      activity(p, daysAgo(-2)),
      tine,
    )
    const rows = sqlite.query('SELECT * FROM mijn_producties WHERE persoon_id = ?').all(tine) as Record<
      string,
      unknown
    >[]
    expect(rows.length).toBe(1)
    expect(rows[0]).toMatchObject({
      productie: 'Proef',
      rollen: 'Lichttechnicus, Speler',
      vanaf: daysAgo(-1),
      laatste_dag: daysAgo(-2),
    })
  })
})

describe('mijn_producties, edge rows', () => {
  test('a role name holding a comma reads as written', () => {
    const tine = person('Tine')
    sqlite.run("UPDATE rol SET naam = 'Licht, geluid' WHERE id = 1")
    assign(activity(production('Proef'), daysAgo(-1)), tine, 'bevestigd')
    const row = sqlite.query('SELECT rollen FROM mijn_producties WHERE persoon_id = ?').get(tine) as { rollen: string }
    expect(row.rollen).toBe('Licht, geluid')
  })

  test('a soft-deleted person has no productions', () => {
    const tine = person('Tine')
    assign(activity(production('Proef'), daysAgo(-1)), tine, 'bevestigd')
    sqlite.run("UPDATE persoon SET deleted_at = '2026-01-01T00:00:00Z' WHERE id = ?", [tine])
    expect(productionsOf(tine)).toEqual([])
  })
})

describe('Mijn producties for owners', () => {
  const request = async (method: string, path: string, headers: Record<string, string>, body?: unknown) => {
    const res = await app.request(path, {
      method,
      headers: { host: HOST, 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    // biome-ignore lint/suspicious/noExplicitAny: response bodies are asserted structurally
    return { status: res.status, body: (await res.json()) as Record<string, any> }
  }
  const seeded = () =>
    (sqlite.query("SELECT id, for_owners FROM saved_view WHERE name = 'Mijn producties'").get() as {
      id: number
      for_owners: number
    }) ?? null

  test('the seed leaves it unpublished; an administrator publishes it and a person reads only their own productions', async () => {
    expect(seeded()).toMatchObject({ for_owners: 0 })
    const admin = { cookie: await signIn(app, 'administrator') }
    expect((await request('PUT', `/api/views/${seeded().id}/for-owners`, admin, {})).status).toBe(200)

    const tine = person('Tine')
    assign(activity(production('Proef'), daysAgo(-3)), tine, 'bevestigd')
    const asTine = { authorization: `RecordLink ${recordLinkFor(sqlite, TEST_LINK_SECRET, 'persoon', tine)}` }
    const listed = await request('GET', '/api/owner/views', asTine)
    expect(listed.status).toBe(200)
    expect(listed.body.views.map((v: { name: string }) => v.name)).toEqual(['Mijn producties'])

    const read = await request('GET', `/api/owner/views/${seeded().id}/rows`, asTine)
    expect(read.status).toBe(200)
    expect(read.body.rows.map((row: { productie: string }) => row.productie)).toEqual(['Proef'])
    for (const row of read.body.rows) {
      expect(Object.keys(row).sort()).toEqual(['laatste_dag', 'productie', 'rollen', 'toegang_vervalt', 'vanaf'])
    }
  })

  const published = async (admin: { cookie: string }) => {
    expect((await request('PUT', `/api/views/${seeded().id}/for-owners`, admin, {})).status).toBe(200)
    return seeded().id
  }

  test('a declined or merely invited person reads no production through their link; the confirmed one on it does', async () => {
    const id = await published({ cookie: await signIn(app, 'administrator') })
    const day = activity(production('Proef'), daysAgo(-3))
    const [fien, gijs, tine] = [person('Fien'), person('Gijs'), person('Tine')]
    assign(day, fien, 'geweigerd')
    assign(day, gijs, 'uitgenodigd')
    assign(day, tine, 'bevestigd')
    const titlesOf = async (persoon: number) => {
      const asLink = { authorization: `RecordLink ${recordLinkFor(sqlite, TEST_LINK_SECRET, 'persoon', persoon)}` }
      const read = await request('GET', `/api/owner/views/${id}/rows`, asLink)
      expect(read.status).toBe(200)
      return read.body.rows.map((row: { productie: string }) => row.productie)
    }
    expect(await titlesOf(fien)).toEqual([])
    expect(await titlesOf(gijs)).toEqual([])
    expect(await titlesOf(tine)).toEqual(['Proef'])
  })

  test("from and to narrow a person's productions on the production's last day", async () => {
    const id = await published({ cookie: await signIn(app, 'administrator') })
    const tine = person('Tine')
    assign(activity(production('Kort'), daysAgo(-3)), tine, 'bevestigd')
    assign(activity(production('Lang'), daysAgo(-60)), tine, 'bevestigd')
    const asTine = { authorization: `RecordLink ${recordLinkFor(sqlite, TEST_LINK_SECRET, 'persoon', tine)}` }
    const titles = async (query: string) =>
      (await request('GET', `/api/owner/views/${id}/rows${query}`, asTine)).body.rows.map(
        (row: { productie: string }) => row.productie,
      )

    expect((await titles('')).sort()).toEqual(['Kort', 'Lang'])
    expect(await titles(`?from=${daysAgo(0)}&to=${daysAgo(-10)}`)).toEqual(['Kort'])
    expect(await titles(`?from=${daysAgo(-50)}&to=${daysAgo(-70)}`)).toEqual(['Lang'])
  })

  for (const hidden of ['productie_id', 'persoon_id']) {
    test(`a view listing the hidden ${hidden} is refused for owners, naming it`, async () => {
      const admin = { cookie: await signIn(app, 'administrator') }
      const made = await request('POST', '/api/views', admin, {
        name: `Met ${hidden}`,
        source: 'mijn_producties',
        visible_fields: ['productie', hidden],
      })
      expect(made.status).toBe(201)
      const refused = await request('PUT', `/api/views/${made.body.id}/for-owners`, admin, {})
      expect(refused).toMatchObject({ status: 400, body: { code: 'column_not_owner_visible', key: hidden } })
    })
  }

  test('a stored view naming a column the query does not have, such as notitie, is refused for owners too', async () => {
    const admin = { cookie: await signIn(app, 'administrator') }
    const sql = `INSERT INTO saved_view (name, source_type, source, owner_id, shared, filters, sort, group_by, visible_fields)
                 VALUES ('Rauw', 'query', 'mijn_producties', -1, 1, '{}', '[]', NULL, '["productie","notitie"]')`
    const id = Number(sqlite.query(sql).run().lastInsertRowid)
    const refused = await request('PUT', `/api/views/${id}/for-owners`, admin, {})
    expect(refused).toMatchObject({ status: 400, body: { code: 'column_not_owner_visible', key: 'notitie' } })
  })
})

describe('the link request', () => {
  test("a person's address, in any case, gets their own link; an unknown one the same answer and no mail", async () => {
    const outbox = mkdtempSync(join(tmpdir(), 'wt-person-link-'))
    app = testEngine(sqlite, theatre, { outbox })
    const ask = async (email: string) => {
      const res = await app.request('/api/record-links/request', {
        method: 'POST',
        headers: { host: HOST, 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      return { status: res.status, headers: [...res.headers], body: await res.text() }
    }
    const known = await ask('lotte@lantaarn.test')
    expect(known.status).toBe(200)
    expect(await ask('niemand@nergens.test')).toEqual(known)
    expect(await ask('LOTTE@lantaarn.test')).toEqual(known)

    await Bun.sleep(20)
    const lotte = sqlite.query("SELECT id FROM persoon WHERE email = 'lotte@lantaarn.test'").get() as { id: number }
    const link = `http://127.0.0.1:5173/#/link/${recordLinkFor(sqlite, TEST_LINK_SECRET, 'persoon', lotte.id)}`
    const mails = readdirSync(outbox).map((name) => readFileSync(join(outbox, name), 'utf8'))
    expect(mails).toEqual([`To: lotte@lantaarn.test\n\n${link}\n`, `To: lotte@lantaarn.test\n\n${link}\n`])
  })
})
