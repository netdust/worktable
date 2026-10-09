import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { migrate, seedDomain, validateDomain } from '@worktable/engine'
import { signIn, testEngine } from '@worktable/engine/test/sign-in'
import theatre from '../src'

// biome-ignore lint/suspicious/noExplicitAny: response bodies are asserted structurally
type Schema = Record<string, any>

const LOTTE = { dataset: 'persoon', id: 1 }

async function schemaAs(role: 'owner' | 'editor'): Promise<Schema> {
  const sqlite = new Database(':memory:')
  migrate(sqlite, theatre)
  seedDomain(sqlite, theatre)
  const app = testEngine(sqlite, theatre)
  const cookie = await signIn(app, role, role === 'owner' ? LOTTE : null)
  const res = await app.request('/api/schema', { headers: { host: '127.0.0.1:4310', cookie } })
  expect(res.status).toBe(200)
  return (await res.json()) as Schema
}

const FACTS = [
  { kind: 'first', column: 'start_at', where: { soort: 'voorstelling' }, label: 'voorstelling' },
  { kind: 'empty', column: 'start_at', label: 'zonder tijd' },
]

describe('theatre declares its space, sections, facts and inherited venue', () => {
  test('the domain passes validateDomain', () => expect(() => validateDomain(theatre)).not.toThrow())

  test('an editor gets productie as the space, and the scoped sources', async () => {
    const body = await schemaAs('editor')
    expect(body.space).toEqual({ model: 'productie', field: 'productie_id' })
    const scoped = Object.entries(body.sources)
      .filter(([, s]) => (s as Schema).space === 'scoped')
      .map(([name]) => name)
      .sort()
    expect(scoped).toEqual(['activiteit', 'dagplanning', 'productie_dag', 'speelreeks'])
    for (const s of Object.values(body.sources) as Schema[]) expect(['scoped', 'global']).toContain(s.space)
  })

  test('an editor gets the sections in their draft order, with no query in them', async () => {
    const body = await schemaAs('editor')
    expect(body.sections).toEqual([
      { label: 'Planning', sources: ['speelreeks', 'activiteit', 'toewijzing', 'beschikbaarheid'] },
      { label: 'Gegevens', sources: ['productie', 'persoon', 'organisatie'] },
      { label: 'Instellingen', sources: ['rol', 'sjabloon'] },
    ])
    expect(body.sources.beschikbaarheid.label).toBe('Beschikbaarheden')
  })

  test('the planning queries read activiteit and the person page reads toewijzing, in the order the tree shows them', async () => {
    const body = await schemaAs('editor')
    const queries = Object.entries(body.sources).filter(([, s]) => (s as Schema).kind === 'query')
    expect(queries.map(([name, s]) => [name, (s as Schema).of])).toEqual([
      ['dagplanning', 'activiteit'],
      ['productie_dag', 'activiteit'],
      ['voorstellingen', 'activiteit'],
      ['mijn_producties', 'toewijzing'],
    ])
  })

  test('dagplanning and activiteit carry the two facts; the venue is inherited from locatie_bron', async () => {
    const body = await schemaAs('editor')
    expect(body.sources.dagplanning.group_facts).toEqual(FACTS)
    expect(body.sources.activiteit.group_facts).toEqual(FACTS)
    expect(body.sources.dagplanning.columns.locatie_id.inherited).toEqual({ flag: 'locatie_bron', own: 'eigen' })
  })

  test('an owner gets no space and only the sections it can read', async () => {
    const body = await schemaAs('owner')
    expect(body.space).toBeUndefined()
    expect(body.sections).toEqual([
      { label: 'Planning', sources: ['toewijzing', 'beschikbaarheid'] },
      { label: 'Gegevens', sources: ['persoon'] },
    ])
    for (const s of Object.values(body.sources) as Schema[]) expect(s.space).toBeUndefined()
  })
})

const SOORT_TONES = {
  voorstelling: 'rose',
  repetitie: 'violet',
  opbouw: 'amber',
  afbouw: 'amber',
  reis: 'sky',
  overnachting: 'slate',
  maaltijd: 'green',
  vergadering: 'teal',
  andere: 'grey',
}
const STATUS_TONES = { optie: 'warn', bevestigd: 'ok', geannuleerd: 'bad' }

describe('theatre declares the details: icons, colours, an end time and create-from-query', () => {
  test('every source declares a default icon, as in the prototype', async () => {
    const icons = Object.fromEntries(
      Object.entries((await schemaAs('editor')).sources).map(([name, s]) => [name, (s as Schema).icon]),
    )
    expect(icons).toEqual({
      organisatie: 'pin',
      productie: 'tag',
      speelreeks: 'film',
      activiteit: 'calendar',
      persoon: 'user',
      toewijzing: 'users',
      beschikbaarheid: 'clock',
      rol: 'check',
      sjabloon: 'list',
      productie_dag: 'table',
      dagplanning: 'query',
      voorstellingen: 'table',
      mijn_producties: 'star',
    })
  })

  test('soort carries a colour per option on activiteit and dagplanning, with the same labels', async () => {
    const { sources } = await schemaAs('editor')
    expect(sources.activiteit.columns.soort.tones).toEqual(SOORT_TONES)
    expect(sources.dagplanning.columns.soort.tones).toEqual(SOORT_TONES)
    expect(sources.dagplanning.columns.soort.options).toEqual(sources.activiteit.columns.soort.options)
  })

  test('speelreeks status is coloured like activiteit status, and dagplanning status carries them through writes', async () => {
    const { sources } = await schemaAs('editor')
    expect(sources.speelreeks.columns.status.tones).toEqual(STATUS_TONES)
    expect(sources.activiteit.columns.status.tones).toEqual(STATUS_TONES)
    expect(sources.dagplanning.columns.status.tones).toEqual(STATUS_TONES)
    expect(sources.dagplanning.columns.status.options).toEqual(sources.activiteit.columns.status.options)
  })

  test('dagplanning serves its end time and creates an activiteit', async () => {
    const { sources } = await schemaAs('editor')
    expect(sources.dagplanning.columns.eind_at).toMatchObject({ type: 'datetime', nullable: true })
    expect(sources.dagplanning.creates).toBe('activiteit')
    const sqlite = new Database(':memory:')
    migrate(sqlite, theatre)
    seedDomain(sqlite, theatre)
    const rows = sqlite
      .query(
        'SELECT d.eind_at AS got, a.eind_at AS want FROM dagplanning d JOIN activiteit a ON a.id = d.activiteit_id',
      )
      .all() as { got: unknown; want: unknown }[]
    expect(rows.length).toBeGreaterThan(0)
    for (const { got, want } of rows) expect(got).toBe(want)
    expect(rows.some((r) => r.got !== null)).toBe(true)
  })

  test('the Dagplanning view shows time, omschrijving, soort, locatie and status', () => {
    const view = theatre.views.find((v) => v.name === 'Dagplanning')
    expect(view?.visible_fields).toEqual(['start_at', 'omschrijving', 'soort', 'locatie_id', 'mensen', 'status'])
  })

  test('the Dagplanning view starts on this week: its period is a condition on plandag', () => {
    expect(theatre.views.find((v) => v.name === 'Dagplanning')?.filters).toEqual({ plandag: { $period: 'week' } })
  })

  test('an owner sees no dagplanning, so none of its colours or its create', async () => {
    const { sources } = await schemaAs('owner')
    expect(sources.dagplanning).toBeUndefined()
    expect(sources.activiteit).toBeUndefined()
    expect(sources.persoon.icon).toBe('user')
  })
})
