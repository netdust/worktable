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
    expect(scoped).toEqual(['activiteit', 'productie_dag', 'speelreeks'])
    for (const s of Object.values(body.sources) as Schema[]) expect(['scoped', 'global']).toContain(s.space)
  })

  test('an editor gets the sections in their draft order, the queries last under Overzichten', async () => {
    const body = await schemaAs('editor')
    expect(body.sections).toEqual([
      { label: 'Planning', sources: ['speelreeks', 'activiteit', 'toewijzing', 'beschikbaarheid', 'taak'] },
      { label: 'Gegevens', sources: ['productie', 'persoon', 'persoon_rol', 'organisatie'] },
      { label: 'Instellingen', sources: ['rol', 'sjabloon'] },
      { label: 'Overzichten', sources: ['productie_dag', 'voorstellingen', 'mijn_producties'] },
    ])
    expect(body.sources.beschikbaarheid.label).toBe('Beschikbaarheden')
  })

  test('every query is its own node, under no dataset', async () => {
    const body = await schemaAs('editor')
    const queries = Object.entries(body.sources).filter(([, s]) => (s as Schema).kind === 'query')
    expect(queries.map(([name, s]) => [name, (s as Schema).of])).toEqual([
      ['productie_dag', undefined],
      ['voorstellingen', undefined],
      ['mijn_producties', undefined],
    ])
  })

  test('activiteit carries the two facts, and the venue inherited through its tourstop', async () => {
    const body = await schemaAs('editor')
    expect(body.sources.activiteit.group_facts).toEqual(FACTS)
    expect(body.sources.activiteit.lookups.locatie).toMatchObject({ inherited: true, from: 'Tourstop' })
  })

  test('an owner gets no space and only the sections it can read', async () => {
    const body = await schemaAs('owner')
    expect(body.space).toBeUndefined()
    expect(body.sections).toEqual([
      { label: 'Planning', sources: ['toewijzing', 'beschikbaarheid'] },
      { label: 'Gegevens', sources: ['persoon'] },
      { label: 'Overzichten', sources: ['mijn_producties'] },
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
      persoon_rol: 'users',
      toewijzing: 'users',
      beschikbaarheid: 'clock',
      rol: 'check',
      sjabloon: 'list',
      taak: 'check',
      productie_dag: 'table',
      voorstellingen: 'table',
      mijn_producties: 'star',
    })
  })

  test('soort carries a colour per option on activiteit', async () => {
    const { sources } = await schemaAs('editor')
    expect(sources.activiteit.columns.soort.tones).toEqual(SOORT_TONES)
  })

  test('speelreeks status is coloured like activiteit status', async () => {
    const { sources } = await schemaAs('editor')
    expect(sources.speelreeks.columns.status.tones).toEqual(STATUS_TONES)
    expect(sources.activiteit.columns.status.tones).toEqual(STATUS_TONES)
  })

  test('Eigen locatie and Plaats stay stored but are served hidden', async () => {
    const { sources } = await schemaAs('editor')
    expect(sources.activiteit.columns.locatie_id).toMatchObject({ label: 'Eigen locatie', hidden: true })
    expect(sources.activiteit.columns.plaats).toMatchObject({ hidden: true })
  })

  test('activiteit serves its end time', async () => {
    const { sources } = await schemaAs('editor')
    expect(sources.activiteit.columns.eind_at).toMatchObject({ type: 'datetime', nullable: true })
  })

  test('the Planning view, on activiteit, shows time, omschrijving, soort, tourstop, locatie, mensen and status', () => {
    const view = theatre.views.find((v) => v.name === 'Planning')
    expect(view?.source).toBe('activiteit')
    expect(view?.visible_fields).toEqual([
      'start_at',
      'omschrijving',
      'soort',
      'speelreeks_id',
      'locatie',
      'mensen',
      'status',
    ])
  })

  test('the Planning view starts on this week: its period is a condition on plandag', () => {
    expect(theatre.views.find((v) => v.name === 'Planning')?.filters).toEqual({ plandag: { $period: 'week' } })
  })

  test('an owner sees no activiteit, so none of its colours', async () => {
    const { sources } = await schemaAs('owner')
    expect(sources.activiteit).toBeUndefined()
    expect(sources.persoon.icon).toBe('user')
  })
})
