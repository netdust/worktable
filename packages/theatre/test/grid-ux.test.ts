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

  test('an editor gets the sections in their draft order', async () => {
    const body = await schemaAs('editor')
    expect(body.sections).toEqual([
      { label: 'Planning', sources: ['dagplanning', 'activiteit', 'speelreeks', 'toewijzing', 'beschikbaarheid'] },
      { label: 'Gegevens', sources: ['productie', 'persoon', 'organisatie'] },
      { label: 'Instellingen', sources: ['rol', 'sjabloon'] },
    ])
    expect(body.sources.beschikbaarheid.label).toBe('Beschikbaarheden')
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
