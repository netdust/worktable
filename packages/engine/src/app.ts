import type { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { Hono } from 'hono'
import type { Domain } from './declare'
import { ApiError, parseRowsParams } from './params'
import { type Source, sourceOf, sourcesOf, writerOf } from './registry'
import { cellsOf, matrixOf, readRows } from './rows'
import { viewRoutes } from './views'
import { writeGuard } from './write-guard'
import { bodyOf, parseId, readRevisions, rowOf, runWrite, type Store, writableOf } from './writes'

function isWritable(domain: Domain, source: Source): boolean {
  if (source.kind === 'dataset') return Boolean(writerOf(domain, source.name)?.update)
  return Object.values(source.columns).some((c) => c.writes)
}

function writeRoutes(app: Hono, store: Store): void {
  const { domain } = store
  app.on(['POST', 'PUT', 'PATCH', 'DELETE'], '/*', writeGuard())

  app.post('/rows/:dataset', async (c) => {
    const target = writableOf(domain, c.req.param('dataset'), 'create')
    const id = runWrite(store, target, 'create', null, await bodyOf(c))
    return c.json(rowOf(store, target.dataset, id), 201)
  })

  app.patch('/rows/:dataset/:id', async (c) => {
    const target = writableOf(domain, c.req.param('dataset'), 'update')
    const id = runWrite(store, target, 'update', parseId(c.req.param('id')), await bodyOf(c))
    return c.json(rowOf(store, target.dataset, id))
  })

  app.delete('/rows/:dataset/:id', (c) => {
    const target = writableOf(domain, c.req.param('dataset'), 'delete')
    return c.json({ id: runWrite(store, target, 'delete', parseId(c.req.param('id')), {}) })
  })

  app.get('/revisions/:dataset/:id', (c) =>
    c.json({ revisions: readRevisions(store, c.req.param('dataset'), parseId(c.req.param('id'))) }),
  )
}

export interface EngineOptions {
  port: number
}

export function createEngine(sqlite: Database, domain: Domain, { port }: EngineOptions): Hono {
  sqlite.run('PRAGMA foreign_keys = ON')
  const db = drizzle(sqlite)
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`])
  const root = new Hono()

  // A page whose name rebinds to 127.0.0.1 still sends its own Host, so only the loopback names pass.
  root.use(async (c, next) => {
    c.header('X-Content-Type-Options', 'nosniff')
    if (!hosts.has(c.req.header('host') ?? ''))
      return c.json({ code: 'forbidden_host', message: 'Host not allowed' }, 403)
    await next()
  })

  const app = root.basePath('/api')

  app.get('/schema', (c) => {
    const sources = Object.fromEntries(
      sourcesOf(domain).map((s) => [
        s.name,
        {
          kind: s.kind,
          label: s.label,
          title: typeof s.title === 'string' ? s.title : s.title.else,
          ...(typeof s.title === 'string' ? {} : { title_via: s.title.via }),
          date: s.date ?? null,
          ...(s.kind === 'dataset' && s.matrix ? { matrix: s.matrix } : {}),
          ...(matrixOf(domain, s) ? { matrix_join: matrixOf(domain, s)?.join.name } : {}),
          columns: s.columns,
          writable: isWritable(domain, s),
          deletable: s.kind === 'dataset' && Boolean(writerOf(domain, s.name)?.delete),
        },
      ]),
    )
    return c.json({ sources })
  })

  app.get('/rows/:source', (c) => {
    const name = c.req.param('source')
    const source = sourceOf(domain, name)
    if (!source) throw new ApiError(404, 'unknown_source', `unknown source "${name}"`)
    const params = parseRowsParams(source, c.req.query())
    const found = params.cells ? matrixOf(domain, source) : null
    if (params.cells && !found) throw new ApiError(400, 'no_matrix', `"${name}" is not the down source of a matrix`)
    const read = readRows(db, domain, source, params)
    if (!found) return c.json(read)
    const cells = cellsOf(
      db,
      domain,
      found,
      read.rows.map((r) => r.id),
    )
    return c.json({ ...read, rows: read.rows.map((r) => ({ ...r, cells: cells.get(r.id) })) })
  })

  writeRoutes(app, { sqlite, db, domain })
  viewRoutes(app, { sqlite, db, domain })

  root.onError((err, c) => {
    if (err instanceof ApiError) return c.json({ ...err.details, code: err.code, message: err.message }, err.status)
    console.error(err)
    return c.json({ code: 'internal', message: 'Internal error' }, 500)
  })

  return root
}
