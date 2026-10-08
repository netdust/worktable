import type { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { domain, freshDb, send } from './fixture'
import { signIn, testEngine } from './sign-in'

let sqlite: Database
let app: ReturnType<typeof testEngine>

beforeEach(() => {
  sqlite = freshDb()
  app = testEngine(sqlite, domain)
})

const put = (cookie: string | undefined, source: string, body: unknown) =>
  send(app, cookie)('PUT', `/api/sources/${source}/display`, { body: JSON.stringify(body) })

const schemaAs = async (cookie: string) => (await send(app, cookie)('GET', '/api/schema')).body.sources

const stored = () => sqlite.query('SELECT source, label, icon FROM source_display').all()

describe('only an administrator changes a source display name or icon', () => {
  test('an editor gets 403 and nothing changes', async () => {
    const editor = await signIn(app, 'editor')
    const res = await put(editor, 'taak', { label: 'Werk', icon: 'star' })
    expect(res.status).toBe(403)
    expect(stored()).toEqual([])
    expect((await schemaAs(editor)).taak.label).toBe('Taken')
  })

  test('an owner gets 403 and nothing changes, on a source it reads or one it cannot', async () => {
    const owner = await signIn(app, 'owner', { dataset: 'project', id: 1 })
    expect((await put(owner, 'taak', { label: 'Werk' })).status).toBe(403)
    const hidden = await put(owner, 'plat', { label: 'Werk' })
    expect(hidden.status).toBe(403)
    expect(hidden.body.message).not.toContain('plat')
    expect((await put(owner, 'nowhere', { label: 'Werk' })).status).toBe(403)
    expect(stored()).toEqual([])
  })

  test('a caller without a session gets 401', async () => {
    expect((await put(undefined, 'taak', { label: 'Werk' })).status).toBe(401)
    expect(stored()).toEqual([])
  })

  test('the write guard refuses a body that is not JSON', async () => {
    const admin = await signIn(app, 'administrator')
    const res = await send(app, admin)('PUT', '/api/sources/taak/display', {
      body: 'label=Werk',
      type: 'application/x-www-form-urlencoded',
    })
    expect(res.status).toBe(415)
    const foreign = await send(app, admin)('PUT', '/api/sources/taak/display', {
      body: JSON.stringify({ label: 'Werk' }),
      site: 'cross-site',
    })
    expect(foreign.status).toBe(403)
    expect(stored()).toEqual([])
  })
})

describe('an administrator sets a display name and icon', () => {
  test('/schema serves them to every reader; the declared label is the default', async () => {
    const admin = await signIn(app, 'administrator')
    const editor = await signIn(app, 'editor')
    expect((await schemaAs(editor)).taak.icon).toBeNull()

    const res = await put(admin, 'taak', { label: '  Werk  ', icon: 'star' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ source: 'taak', label: 'Werk', icon: 'star' })

    const taak = (await schemaAs(editor)).taak
    expect([taak.label, taak.icon]).toEqual(['Werk', 'star'])
    expect((await schemaAs(editor)).plat).toMatchObject({ label: 'Plat', icon: null })

    expect((await put(admin, 'taak', { icon: 'flag' })).status).toBe(200)
    expect((await schemaAs(editor)).taak).toMatchObject({ label: 'Werk', icon: 'flag' })

    expect((await put(admin, 'taak', { label: null, icon: null })).status).toBe(200)
    expect((await schemaAs(editor)).taak).toMatchObject({ label: 'Taken', icon: null })
  })

  test('an owner sees the display of a source it reads', async () => {
    const admin = await signIn(app, 'administrator')
    const owner = await signIn(app, 'owner', { dataset: 'project', id: 1 })
    await put(admin, 'taak', { label: 'Werk', icon: 'clock' })
    await put(admin, 'plat', { label: 'Anders' })
    const sources = await schemaAs(owner)
    expect(sources.taak).toMatchObject({ label: 'Werk', icon: 'clock' })
    expect(sources.plat).toBeUndefined()
  })

  test('the write is revised in one batch', async () => {
    const admin = await signIn(app, 'administrator')
    const first = await put(admin, 'taak', { label: 'Werk', icon: 'star' })
    const second = await put(admin, 'taak', { label: 'Klussen' })
    const revised = sqlite
      .query("SELECT field, old, new, batch_id FROM revision WHERE entity = 'source_display' ORDER BY id")
      .all() as { field: string; old: string | null; new: string | null; batch_id: string }[]
    expect(revised.map(({ field, old, new: value }) => [field, old, value])).toEqual([
      ['id', null, '1'],
      ['source', null, '"taak"'],
      ['label', null, '"Werk"'],
      ['icon', null, '"star"'],
      ['label', '"Werk"', '"Klussen"'],
    ])
    expect(first.body.batch_id).toBe(revised[0]?.batch_id)
    expect(second.body.batch_id).toBe(revised[4]?.batch_id)
    const batches = sqlite.query("SELECT key, kind FROM batch WHERE kind = 'write'").all()
    expect(batches).toEqual([
      { key: first.body.batch_id, kind: 'write' },
      { key: second.body.batch_id, kind: 'write' },
    ])
  })

  test('an unchanged display writes no revision', async () => {
    const admin = await signIn(app, 'administrator')
    await put(admin, 'taak', { label: 'Werk' })
    const again = await put(admin, 'taak', { label: 'Werk' })
    expect(again.status).toBe(200)
    expect(again.body.batch_id).toBeNull()
    expect(sqlite.query("SELECT COUNT(*) AS n FROM revision WHERE entity = 'source_display'").get()).toEqual({ n: 3 })
  })
})

describe('a bad display is refused with nothing changed', () => {
  const cases: [string, unknown][] = [
    ['an unknown icon', { icon: 'rocket' }],
    ['an icon that is not text', { icon: 3 }],
    ['an empty label', { label: '   ' }],
    ['an over-long label', { label: 'x'.repeat(61) }],
    ['a label with a control character', { label: 'Werk\u0007' }],
    ['a label that is not text', { label: 7 }],
    ['an unknown key', { label: 'Werk', colour: 'red' }],
    ['no key at all', {}],
    ['a body that is not an object', ['Werk']],
  ]
  for (const [what, body] of cases) {
    test(`${what} is 400`, async () => {
      const admin = await signIn(app, 'administrator')
      expect((await put(admin, 'taak', body)).status).toBe(400)
      expect(stored()).toEqual([])
    })
  }

  test('a label of 60 characters is taken', async () => {
    const admin = await signIn(app, 'administrator')
    expect((await put(admin, 'taak', { label: 'x'.repeat(60) })).status).toBe(200)
  })

  test('an unknown source, or an engine table, is 404', async () => {
    const admin = await signIn(app, 'administrator')
    expect((await put(admin, 'nowhere', { label: 'Werk' })).status).toBe(404)
    expect((await put(admin, 'saved_view', { label: 'Werk' })).status).toBe(404)
    expect((await put(admin, 'source_display', { label: 'Werk' })).status).toBe(404)
    expect(stored()).toEqual([])
  })
})
