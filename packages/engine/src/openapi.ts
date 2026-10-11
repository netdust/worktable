import { type ActionDecl, type ActionInput, type ColumnDecl, type Domain, MAX_INPUT_TEXT } from './declare'
import { writerOf } from './registry'

type Schema = Record<string, unknown>

/** A source as /schema serves it to the caller: already cut to what that caller reads (attack 19). */
export interface ServedSource {
  kind: 'dataset' | 'query'
  label: string
  columns: Record<string, ColumnDecl>
  actions: ({ name: string } & Pick<ActionDecl, 'label' | 'input'>)[]
}

const TYPES: Record<ColumnDecl['type'], string | null> = {
  text: 'string',
  integer: 'integer',
  real: 'number',
  boolean: 'boolean',
  date: 'string',
  datetime: 'string',
  json: null,
}

// As writes.ts accepts it: no zone, seconds optional.
const DATETIME = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(:\\d{2})?$'

const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` })
const json = (schema: Schema): Schema => ({ content: { 'application/json': { schema } } })
const ok = (description: string, schema: Schema = { type: 'object' }): Schema => ({ description, ...json(schema) })
const ERRORS = { default: ok('An error', ref('Error')) }
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } }

function columnSchema(column: ColumnDecl): Schema {
  const type = TYPES[column.type]
  const options = column.options ? Object.keys(column.options) : null
  return {
    ...(type ? { type: column.nullable ? [type, 'null'] : type } : {}),
    ...(column.type === 'date' ? { format: 'date' } : {}),
    ...(column.type === 'datetime' ? { pattern: DATETIME } : {}),
    ...(options ? { enum: column.nullable ? [...options, null] : options } : {}),
    title: column.label,
    ...(column.default !== undefined ? { default: column.default } : {}),
    ...(column.readonly ? { readOnly: true } : {}),
    ...(column.relation ? { description: `The id of a ${column.relation} record` } : {}),
  }
}

const objectOf = (properties: Record<string, Schema>): Schema => ({ type: 'object', properties })

function sourceSchemas(name: string, source: ServedSource, writable: boolean): Record<string, Schema> {
  const columns = Object.entries(source.columns)
  const properties = Object.fromEntries(columns.map(([key, column]) => [key, columnSchema(column)]))
  const own = objectOf({ id: { type: 'integer', readOnly: true }, ...properties })
  const served = objectOf({ title: { type: 'string' }, lookups: { type: 'object' }, custom: { type: 'object' } })
  const write = Object.fromEntries(columns.filter(([, c]) => !c.readonly).map(([key, c]) => [key, columnSchema(c)]))
  return {
    [name]: own,
    [`${name}Row`]: { allOf: [ref(name), served] },
    ...(writable ? { [`${name}Write`]: objectOf(write) } : {}),
  }
}

const ROWS_QUERY = ['filter', 'sort', 'group', 'from', 'to', 'limit', 'offset', 'cells'].map((name) => ({
  name,
  in: 'query',
  required: false,
  schema: { type: 'string' },
}))

function rowPaths(domain: Domain, name: string): Record<string, Schema> {
  const writer = writerOf(domain, name)
  const rows = objectOf({ rows: { type: 'array', items: ref(`${name}Row`) }, total: { type: 'integer' } })
  const collection: Schema = {
    get: { operationId: `read_${name}`, parameters: ROWS_QUERY, responses: { 200: ok('The rows', rows), ...ERRORS } },
    ...(writer?.create
      ? {
          post: {
            operationId: `create_${name}`,
            requestBody: { required: true, ...json(ref(`${name}Write`)) },
            responses: { 201: ok('The created row', ref(`${name}Row`)), ...ERRORS },
          },
        }
      : {}),
  }
  const update = {
    operationId: `update_${name}`,
    parameters: [idParam],
    requestBody: { required: true, ...json(ref(`${name}Write`)) },
    responses: { 200: ok('The changed row', ref(`${name}Row`)), ...ERRORS },
  }
  const remove = { operationId: `delete_${name}`, parameters: [idParam], responses: { 200: ok('Deleted'), ...ERRORS } }
  const item = { ...(writer?.update ? { patch: update } : {}), ...(writer?.delete ? { delete: remove } : {}) }
  return {
    [`/rows/${name}`]: collection,
    ...(Object.keys(item).length > 0 ? { [`/rows/${name}/{id}`]: item } : {}),
  }
}

function inputSchema(decl: ActionInput): Schema {
  if ('relation' in decl)
    return { type: 'integer', title: decl.label, description: `The id of a ${decl.relation} record` }
  if (decl.type === 'date') return { type: 'string', format: 'date', title: decl.label }
  if (decl.type === 'text') return { type: 'string', maxLength: MAX_INPUT_TEXT, title: decl.label }
  if (decl.type === 'boolean') return { type: 'boolean', title: decl.label }
  return {
    type: 'integer',
    title: decl.label,
    ...(decl.min !== undefined ? { minimum: decl.min } : {}),
    ...(decl.max !== undefined ? { maximum: decl.max } : {}),
  }
}

function actionPath({ name, label, input }: ServedSource['actions'][number], on: string): Schema {
  const inputs = Object.entries(input).map(([key, decl]) => [key, inputSchema(decl)])
  const required = Object.entries(input)
    .filter(([, decl]) => 'relation' in decl || decl.required !== false)
    .map(([key]) => key)
  const body = {
    type: 'object',
    required: ['id', 'input'],
    properties: {
      id: { type: 'integer', description: `The id of the ${on} record` },
      input: { type: 'object', required, properties: Object.fromEntries(inputs) },
    },
  }
  return {
    post: {
      operationId: `action_${name}`,
      summary: label,
      requestBody: { required: true, ...json(body) },
      responses: { 201: ok('The batch and what it created'), ...ERRORS },
    },
  }
}

const pathParam = (name: string, names: string[]): Schema => ({
  name,
  in: 'path',
  required: true,
  schema: { type: 'string', enum: names },
})

function enginePaths(sources: Record<string, ServedSource>): Record<string, Schema> {
  const datasets = Object.keys(sources).filter((name) => sources[name]?.kind === 'dataset')
  const get = (operationId: string, parameters: Schema[] = []) => ({
    get: { operationId, parameters, responses: { 200: ok('OK'), ...ERRORS } },
  })
  const batch = { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
  return {
    '/schema': get('schema'),
    '/auth/me': get('me'),
    '/views': get('views'),
    '/history/{source}': get('history', [pathParam('source', Object.keys(sources))]),
    '/revisions/{dataset}/{id}': get('revisions', [pathParam('dataset', datasets), idParam]),
    '/batches/{id}/undo': {
      post: { operationId: 'undo', parameters: [batch], responses: { 200: ok('The undo batch'), ...ERRORS } },
    },
  }
}

/** An OpenAPI 3.1 description of what this caller may call, built from its own /schema. */
export function openApiOf(domain: Domain, sources: Record<string, ServedSource>, cookieName: string): Schema {
  const entries = Object.entries(sources)
  const schemas = entries.flatMap(([name, source]) => {
    const writer = source.kind === 'dataset' ? writerOf(domain, name) : undefined
    return Object.entries(sourceSchemas(name, source, Boolean(writer?.create || writer?.update)))
  })
  const actions = entries.flatMap(([on, source]) =>
    source.actions.map((action) => [`/actions/${action.name}`, actionPath(action, on)] as const),
  )
  const error = objectOf({ code: { type: 'string' }, message: { type: 'string' } })
  return {
    openapi: '3.1.0',
    info: { title: 'Worktable', version: '0.0.0' },
    servers: [{ url: '/api' }],
    security: [{ bearer: [] }, { cookie: [] }],
    paths: {
      ...Object.fromEntries(entries.flatMap(([name]) => Object.entries(rowPaths(domain, name)))),
      ...Object.fromEntries(actions),
      ...enginePaths(sources),
    },
    components: {
      schemas: { ...Object.fromEntries(schemas), Error: { ...error, required: ['code', 'message'] } },
      securitySchemes: {
        bearer: { type: 'http', scheme: 'bearer' },
        cookie: { type: 'apiKey', in: 'cookie', name: cookieName },
      },
    },
  }
}
