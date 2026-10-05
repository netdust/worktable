import type { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { type Context, Hono } from 'hono'
import type { Domain, SavedViewSeed } from './declare'
import { ApiError, parseRowsParams } from './params'
import { type Source, sourceOf, sourcesOf, writerOf } from './registry'
import { readRows } from './rows'
import { writeGuard } from './write-guard'
import { parseBody, parseId, readRevisions, rowOf, runWrite, type Store, writableOf } from './writes'

type SavedViewRow = SavedViewSeed & { id: number }

function readViews(sqlite: Database): SavedViewRow[] {
  const raws = sqlite.query('SELECT * FROM saved_view ORDER BY id').all() as Record<string, string | number | null>[]
  return raws.map((r) => ({
    id: r.id as number,
    name: r.name as string,
    source_type: r.source_type as SavedViewRow['source_type'],
    source: r.source as string,
    skin: r.skin as SavedViewRow['skin'],
    filters: JSON.parse(r.filters as string),
    sort: JSON.parse(r.sort as string),
    group_by: r.group_by as string | null,
    visible_fields: JSON.parse(r.visible_fields as string),
  }))
}

function isWritable(domain: Domain, source: Source): boolean {
  if (source.kind === 'dataset') return Boolean(writerOf(domain, source.name)?.update)
  return Object.values(source.columns).some((c) => c.writes)
}

async function bodyOf(c: Context): Promise<Record<string, unknown>> {
  try {
    return parseBody(await c.req.json())
  } catch (err) {
    if (err instanceof ApiError) throw err
    throw new ApiError(400, 'bad_body', 'body is not valid JSON')
  }
}

function writeRoutes(app: Hono, store: Store): void {
  const { domain } = store
  app.on(['POST', 'PATCH', 'DELETE'], '/rows/*', writeGuard())

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
          title: s.title,
          date: s.date ?? null,
          columns: s.columns,
          writable: isWritable(domain, s),
        },
      ]),
    )
    return c.json({ sources, views: readViews(sqlite) })
  })

  app.get('/rows/:source', (c) => {
    const name = c.req.param('source')
    const source = sourceOf(domain, name)
    if (!source) throw new ApiError(404, 'unknown_source', `unknown source "${name}"`)
    return c.json(readRows(db, domain, source, parseRowsParams(source, c.req.query())))
  })

  writeRoutes(app, { sqlite, db, domain })

  root.onError((err, c) => {
    if (err instanceof ApiError) return c.json({ code: err.code, message: err.message }, err.status)
    console.error(err)
    return c.json({ code: 'internal', message: 'Internal error' }, 500)
  })

  return root
}
