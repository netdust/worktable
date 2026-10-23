import { Database } from 'bun:sqlite'
import { beforeAll, describe, expect, test } from 'bun:test'
import { migrate, seedDomain } from '@worktable/engine'
import { signIn, testEngine } from '@worktable/engine/test/sign-in'
import studio from '../src'

type Body = Record<string, unknown>
type Source = {
  label: string
  new_label?: string
  space?: string
  calendar?: Body
  board?: Body
  gallery?: Body
  attachments?: { kinds: Record<string, string> }
  listed?: false
  of?: string
  creates?: string
}
type View = { id: number; name: string; source: string | null; skin: string; filters: Body; layout?: Layout }
type Tile = { kind: string; view?: number; done?: number; total?: number; set?: Body }
type Layout = { sections: { label: string; tiles: Tile[] }[]; actions: { create: string; label: string }[] }

let schema: Record<string, Source>
let sections: { label: string; sources: string[] }[]
let views: View[]

beforeAll(async () => {
  const sqlite = new Database(':memory:')
  migrate(sqlite, studio)
  seedDomain(sqlite, studio)
  const app = testEngine(sqlite, studio)
  const cookie = await signIn(app, 'administrator')
  const get = async (path: string) =>
    (await (await app.request(path, { headers: { host: '127.0.0.1:4310', cookie } })).json()) as Body
  const served = await get('/api/schema')
  schema = served.sources as Record<string, Source>
  sections = served.sections as typeof sections
  views = (await get('/api/views')).views as View[]
})

const dashboard = () => views.find((v) => v.name === 'Overzicht' && v.skin === 'dashboard') as View
const tileViews = (tile: Tile) => [tile.view, tile.done, tile.total].filter((id) => id !== undefined)
const tiles = () => (dashboard().layout as Layout).sections.flatMap((s) => s.tiles)
const viewNamed = (name: string) => views.find((v) => v.name === name) as View

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

  // A request spans clients through its sites (plan ruling), so it stays fleet-wide under the switcher.
  test('every list a tile reads is scoped or ruled unscoped', () => {
    const byId = new Map(views.map((v) => [v.id, v]))
    const sources = tiles()
      .flatMap(tileViews)
      .map((id) => byId.get(id as number)?.source as string)
    for (const source of sources) {
      const ruled = source === 'actie'
      expect({ source, scoped: ruled || schema[source]?.space === 'scoped' }).toEqual({ source, scoped: true })
    }
  })

  // A request starts from the sites it acts on (spec S9), so the header makes none.
  test('the header has Nieuwe taak and Nieuw agendapunt, and no Nieuwe actie', () => {
    expect((dashboard().layout as Layout).actions).toEqual([
      { create: 'taak', label: 'Nieuwe taak' },
      { create: 'agendapunt', label: 'Nieuw agendapunt' },
    ])
  })

  // Stefan confirms in the opdracht's drawer, beside its preview ("ok, remove it").
  test('the Te bevestigen tile has no set button', () => {
    const tile = tiles().find((t) => t.view === viewNamed('Te bevestigen').id) as Tile
    expect(tile.kind).toBe('list')
    expect(tile.set).toBeUndefined()
  })
})

describe('the tree', () => {
  test('the tree has five sections in order, and actie_site is not in it', () => {
    expect(sections).toEqual([
      { label: 'Vloot', sources: ['site'] },
      { label: 'Werk', sources: ['project', 'werkpakket', 'taak'] },
      { label: 'Planning', sources: ['agendapunt'] },
      { label: 'Logboek', sources: ['actie', 'onderhoud'] },
      { label: 'Klanten', sources: ['organisatie'] },
    ])
    expect(schema.actie_site?.listed).toBe(false)
  })

  test('the labels read Opdrachten, Onderhoudslog, Features, Agenda', () => {
    const labels = ['actie', 'onderhoud', 'werkpakket', 'agendapunt'].map((name) => schema[name]?.label)
    expect(labels).toEqual(['Opdrachten', 'Onderhoudslog', 'Features', 'Agenda'])
  })

  // The grid's + Nieuw reads "Nieuw <label>" without one; a site and a log line still refuse a person's create.
  test('+ Nieuw names one site and one log line', () => {
    expect([schema.site?.new_label, schema.onderhoud?.new_label]).toEqual(['Nieuwe site', 'Nieuwe logregel'])
  })

  test('op tafel sits under Taken, and the agenda under Agenda, where it creates', () => {
    expect(schema.op_tafel?.of).toBe('taak')
    expect(schema.agenda).toMatchObject({ of: 'agendapunt', creates: 'agendapunt' })
  })

  test('groups are gone', () => {
    expect(Object.keys(schema).filter((name) => name.startsWith('groep'))).toEqual([])
    expect(views.filter((v) => v.name === 'Groepen')).toEqual([])
  })
})

describe('the sites', () => {
  test('Sites has a board on risico and a gallery of screenshots', () => {
    expect(schema.site).toMatchObject({
      board: { column: 'risico' },
      gallery: { kind: 'screenshot' },
      attachments: { kinds: { screenshot: 'Screenshot' } },
    })
    expect(viewNamed('Sites per risico')).toMatchObject({ source: 'site', skin: 'board' })
    expect(viewNamed('Sites in beeld')).toMatchObject({ source: 'site', skin: 'gallery' })
  })

  test('SLA-sites names the SLA sites still in the registry', () => {
    expect(viewNamed('SLA-sites')).toMatchObject({ source: 'site', filters: { sla: true, in_registry: true } })
  })
})
