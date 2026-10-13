import { Database } from 'bun:sqlite'
import { beforeEach, expect, test } from 'bun:test'
import { migrate, seedDomain } from '@worktable/engine'
import { signIn, testEngine } from '@worktable/engine/test/sign-in'
import theatre from '../src'

type Body = Record<string, unknown>
type Request = (method: string, path: string) => Promise<{ status: number; body: Body }>

let admin: Request
let owner: Request

function requester(app: ReturnType<typeof testEngine>, cookie: string): Request {
  return async (method, path) => {
    const res = await app.request(path, { method, headers: { host: '127.0.0.1:4310', cookie } })
    return { status: res.status, body: (await res.json()) as Body }
  }
}

beforeEach(async () => {
  const sqlite = new Database(':memory:')
  migrate(sqlite, theatre)
  seedDomain(sqlite, theatre)
  const app = testEngine(sqlite, theatre)
  admin = requester(app, await signIn(app, 'administrator'))
  owner = requester(app, await signIn(app, 'owner', { dataset: 'persoon', id: 1 }))
})

type View = { id: number; name: string; skin: string; layout?: { sections: { tiles: Body[] }[] } | null }
const viewsOf = async (who: Request) => ((await who('GET', '/api/views')).body.views as View[]) ?? []

test('the schema serves every need', async () => {
  const sources = (await admin('GET', '/api/schema')).body.sources as Record<string, Body>
  expect(sources.activiteit?.calendar).toMatchObject({ day: 'plandag', lanes: ['productie_id', 'speelreeks_id'] })
  expect(sources.activiteit?.board).toEqual({ column: 'status' })
  expect(sources.activiteit?.gallery).toEqual({ kind: 'foto' })
  expect(sources.toewijzing?.board).toEqual({ column: 'state' })
  expect(sources.beschikbaarheid?.calendar).toMatchObject({ day: 'start_at', spans: true, lanes: ['persoon_id'] })
  expect(sources.speelreeks?.calendar).toMatchObject({ day: 'start_datum', end: 'eind_datum', spans: true })
  expect(sources.speelreeks?.date).toBe('start_datum')
})

test('a view per skin is seeded, and the Overzicht dashboard names a live view in every tile', async () => {
  const views = await viewsOf(admin)
  const skins = new Set(views.map((v) => v.skin))
  for (const skin of ['table', 'calendar', 'board', 'timeline', 'gallery', 'dashboard']) expect(skins).toContain(skin)
  const dashboard = views.find((v) => v.skin === 'dashboard' && v.name === 'Overzicht')
  const ids = new Set(views.map((v) => v.id))
  const named = (dashboard?.layout?.sections ?? []).flatMap((s) =>
    s.tiles.flatMap((t) => [t.view, t.done, t.total].filter((v) => v !== undefined)),
  )
  expect(named.length).toBe(8)
  for (const id of named) expect(ids.has(id as number)).toBe(true)
})

test('an owner lists no dashboard', async () => {
  expect((await viewsOf(owner)).some((v) => v.skin === 'dashboard')).toBe(false)
  expect((await viewsOf(admin)).some((v) => v.skin === 'dashboard')).toBe(true)
})
