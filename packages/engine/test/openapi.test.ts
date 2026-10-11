import type { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import type { ActionDecl, Domain } from '../src'
import { recordLinkFor } from '../src/record-link'
import { domain, freshDb, send } from './fixture'
import { signIn, TEST_LINK_SECRET, testEngine } from './sign-in'

let sqlite: Database
let app: ReturnType<typeof testEngine>

beforeEach(() => {
  sqlite = freshDb()
  app = testEngine(sqlite, domain)
})

// biome-ignore lint/suspicious/noExplicitAny: an OpenAPI document is asserted structurally
const openapi = async (cookie: string): Promise<Record<string, any>> => {
  const res = await send(app, cookie)('GET', '/api/schema?format=openapi')
  expect(res.status).toBe(200)
  return res.body
}

describe('GET /schema?format=openapi', () => {
  test('an editor gets a 3.1 document whose paths follow the writers', async () => {
    const doc = await openapi(await signIn(app, 'editor'))
    expect(doc.openapi).toBe('3.1.0')
    expect(Object.keys(doc.paths['/rows/note']).sort()).toEqual(['get', 'post'])
    expect(Object.keys(doc.paths['/rows/note/{id}']).sort()).toEqual(['delete', 'patch'])
    expect(Object.keys(doc.paths['/rows/per_project'])).toEqual(['get'])
    expect(doc.paths['/rows/per_project/{id}']).toBeUndefined()
    expect(Object.keys(doc.paths['/rows/taak'])).toEqual(['get'])
    expect(Object.keys(doc.paths['/rows/project/{id}'])).toEqual(['delete'])
    expect(Object.keys(doc.paths['/rows/stempel'])).toEqual(['get', 'post'])
    expect(doc.paths['/actions/copy_notes'].post.requestBody.content['application/json'].schema).toMatchObject({
      properties: {
        input: { properties: { source: { type: 'integer', description: expect.stringContaining('note') } } },
      },
    })
    for (const path of ['/batches/{id}/undo', '/revisions/{dataset}/{id}', '/history/{source}', '/views', '/auth/me']) {
      expect(doc.paths[path], path).toBeDefined()
    }
  })

  test('column schemas and enums match the declaration', async () => {
    const { components } = await openapi(await signIn(app, 'editor'))
    const taak = components.schemas.taak.properties
    expect(taak.status).toEqual({ type: 'string', enum: ['open', 'klaar'], title: 'Status' })
    expect(taak.prio).toEqual({ type: ['integer', 'null'], title: 'Prio' })
    expect(taak.afgerond).toMatchObject({ type: 'boolean', default: false })
    expect(taak.day).toMatchObject({ type: 'string', format: 'date' })
    expect(taak.project_id).toMatchObject({ type: 'integer', description: expect.stringContaining('project') })
    const note = components.schemas.note.properties
    expect(note.lengte).toMatchObject({ type: 'integer', readOnly: true })
    expect(note.extra).toEqual({ title: 'Extra' })
    expect(components.schemas.noteWrite.properties.lengte).toBeUndefined()
    expect(components.schemas.noteWrite.properties.tekst).toEqual(note.tekst)
    expect(components.schemas.taakWrite).toBeUndefined()
    expect(components.securitySchemes).toEqual({
      bearer: { type: 'http', scheme: 'bearer' },
      cookie: { type: 'apiKey', in: 'cookie', name: 'wt_session' },
    })
  })

  test('typed action inputs: their schemas, no other keys, and required only when something is', async () => {
    const actions: Record<string, ActionDecl> = {
      typed: {
        label: 'Typed',
        on: 'project',
        input: {
          count: { type: 'integer', label: 'Count', min: 1, max: 3 },
          day: { type: 'date', label: 'Day' },
          word: { type: 'text', label: 'Word' },
          loud: { type: 'boolean', label: 'Loud', required: false },
        },
        run: () => [],
      },
      optional: {
        label: 'Optional',
        on: 'project',
        input: { loud: { type: 'boolean', label: 'Loud', required: false } },
        run: () => [],
      },
    }
    const typed: Domain = { ...domain, actions: { ...domain.actions, ...actions } }
    app = testEngine(sqlite, typed)
    const doc = await openapi(await signIn(app, 'editor'))
    const inputOf = (name: string) =>
      doc.paths[`/actions/${name}`].post.requestBody.content['application/json'].schema.properties.input
    expect(inputOf('typed')).toEqual({
      type: 'object',
      additionalProperties: false,
      required: ['count', 'day', 'word'],
      properties: {
        count: { type: 'integer', title: 'Count', minimum: 1, maximum: 3 },
        day: { type: 'string', format: 'date', title: 'Day' },
        word: { type: 'string', maxLength: 500, title: 'Word' },
        loud: { type: 'boolean', title: 'Loud' },
      },
    })
    expect(inputOf('optional')).toEqual({
      type: 'object',
      additionalProperties: false,
      properties: { loud: { type: 'boolean', title: 'Loud' } },
    })
  })

  test("an owner's document lists only the sources it reads", async () => {
    const doc = await openapi(await signIn(app, 'owner', { dataset: 'project', id: 1 }))
    const schema = (await send(app, await signIn(app, 'owner', { dataset: 'project', id: 1 }))('GET', '/api/schema'))
      .body
    const named = Object.keys(doc.components.schemas).filter((name) => !/(Row|Write|Error)$/.test(name))
    expect(named.sort()).toEqual(Object.keys(schema.sources).sort())
    expect(named).not.toContain('plat')
    expect(doc.paths['/rows/plat']).toBeUndefined()
    expect(JSON.stringify(doc)).not.toContain('"plat"')
  })

  test('a link actor gets 403, and an unknown format is 400', async () => {
    const res = await app.request('/api/schema?format=openapi', {
      headers: {
        host: '127.0.0.1:4310',
        authorization: `RecordLink ${recordLinkFor(sqlite, TEST_LINK_SECRET, 'project', 1)}`,
      },
    })
    expect(res.status).toBe(403)
    const odd = await send(app, await signIn(app, 'editor'))('GET', '/api/schema?format=yaml')
    expect(odd.status).toBe(400)
  })

  test('plain /schema carries no OpenAPI keys', async () => {
    const { body } = await send(app, await signIn(app, 'editor'))('GET', '/api/schema')
    expect(Object.keys(body).sort()).toEqual(['sources'])
    for (const key of ['openapi', 'paths', 'components', 'info']) expect(body[key]).toBeUndefined()
  })
})
