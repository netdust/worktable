import { Database } from 'bun:sqlite'
import { beforeAll, describe, expect, test } from 'bun:test'
import { migrate, seedDomain } from '@worktable/engine'
import { signIn, testEngine } from '@worktable/engine/test/sign-in'
import studio from '../src'

type Body = Record<string, unknown>
type Source = { space?: string; calendar?: Body; columns: Record<string, { nullable?: boolean; default?: unknown }> }
type View = { id: number; name: string; source: string | null; skin: string; layout?: Layout }
type Tile = { kind: string; view?: number; done?: number; total?: number }
type Layout = { sections: { label: string; tiles: Tile[] }[]; actions: { create: string; label: string }[] }

let schema: Record<string, Source>
let views: View[]

beforeAll(async () => {
  const sqlite = new Database(':memory:')
  migrate(sqlite, studio)
  seedDomain(sqlite, studio)
  const app = testEngine(sqlite, studio)
  const cookie = await signIn(app, 'administrator')
  const get = async (path: string) =>
    (await (await app.request(path, { headers: { host: '127.0.0.1:4310', cookie } })).json()) as Body
  schema = (await get('/api/schema')).sources as Record<string, Source>
  views = (await get('/api/views')).views as View[]
})

const dashboard = () => views.find((v) => v.name === 'Overzicht' && v.skin === 'dashboard') as View
const tileViews = (tile: Tile) => [tile.view, tile.done, tile.total].filter((id) => id !== undefined)
const tiles = () => (dashboard().layout as Layout).sections.flatMap((s) => s.tiles)

describe('the studio dashboard', () => {
  test('answers the Monday questions in its four sections', () => {
    expect((dashboard().layout as Layout).sections.map((s) => s.label)).toEqual([
      'Nu',
      'Waar we stopten',
      'Deze week',
      'Op tafel',
    ])
  })

  test('every dashboard tile names a live view', () => {
    const ids = new Set(views.map((v) => v.id))
    for (const id of tiles().flatMap(tileViews)) expect(ids.has(id as number)).toBe(true)
  })

  test('the agenda serves the calendar need', () => {
    expect(schema.agenda?.calendar).toMatchObject({ day: 'datum' })
  })

  // Actie and groep span clients through a group (plan ruling), so they stay fleet-wide under the switcher.
  test('every list a tile reads is scoped or ruled unscoped', () => {
    const byId = new Map(views.map((v) => [v.id, v]))
    const sources = tiles()
      .flatMap(tileViews)
      .map((id) => byId.get(id as number)?.source as string)
    for (const source of sources) {
      const ruled = source === 'actie' || source === 'groep'
      expect({ source, scoped: ruled || schema[source]?.space === 'scoped' }).toEqual({ source, scoped: true })
    }
  })

  test('Nieuwe actie asks soort and groep only', () => {
    const asked = Object.entries(schema.actie?.columns ?? {})
      .filter(([, c]) => !c.nullable && c.default === undefined)
      .map(([key]) => key)
    expect(asked.sort()).toEqual(['groep_id', 'soort'])
  })

  test('its quick actions create an actie, a taak and an agendapunt', () => {
    expect((dashboard().layout as Layout).actions).toEqual([
      { create: 'actie', label: 'Nieuwe actie' },
      { create: 'taak', label: 'Nieuwe taak' },
      { create: 'agendapunt', label: 'Nieuw agendapunt' },
    ])
  })
})
