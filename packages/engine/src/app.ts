import type { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { type Context, Hono } from 'hono'
import { getConnInfo } from 'hono/bun'
import { readable, scopeOf, visibleSource } from './access'
import { actionsOn, runAction } from './actions'
import { type AuthEnv, authRoutes } from './auth'
import type { Actor, ColumnDecl, DatasetDecl, Domain } from './declare'
import { displayRoutes, displaysOf } from './display'
import { ApiError, parseRowsParams } from './params'
import { type Source, sourceOf, sourcesOf, writerOf } from './registry'
import { cellsOf, matrixOf, readRows } from './rows'
import { publicRoutes, shareRoutes, viewRoutes } from './views'
import { writeGuard } from './write-guard'
import {
  bodyOf,
  parseId,
  readRevisions,
  rowOf,
  runWrite,
  type Store,
  undoBatch,
  type Written,
  writableOf,
} from './writes'

function isWritable(domain: Domain, source: Source): boolean {
  if (source.kind === 'dataset') return Boolean(writerOf(domain, source.name)?.update)
  return Object.values(source.columns).some((c) => c.writes)
}

function writeRoutes(app: Hono<AuthEnv>, store: Store): void {
  const { domain } = store

  const reply = (dataset: DatasetDecl, { id, batch_id, changed }: Written) => ({
    ...rowOf(store, dataset, id),
    revision: { batch_id, changed },
  })

  app.post('/rows/:dataset', async (c) => {
    const target = writableOf(domain, c.req.param('dataset'), 'create', c.get('actor'))
    const written = runWrite(store, target, 'create', null, await bodyOf(c), c.get('actor'))
    return c.json(reply(target.dataset, written), 201)
  })

  app.patch('/rows/:dataset/:id', async (c) => {
    const target = writableOf(domain, c.req.param('dataset'), 'update', c.get('actor'))
    const written = runWrite(store, target, 'update', parseId(c.req.param('id')), await bodyOf(c), c.get('actor'))
    return c.json(reply(target.dataset, written))
  })

  app.delete('/rows/:dataset/:id', (c) => {
    const target = writableOf(domain, c.req.param('dataset'), 'delete', c.get('actor'))
    return c.json({ id: runWrite(store, target, 'delete', parseId(c.req.param('id')), {}, c.get('actor')).id })
  })

  app.post('/actions/:name', async (c) =>
    c.json(runAction(store, c.req.param('name'), await bodyOf(c), c.get('actor')), 201),
  )

  app.post('/batches/:id/undo', (c) => c.json(undoBatch(store, c.req.param('id'), c.get('actor'))))

  app.get('/revisions/:dataset/:id', (c) =>
    c.json({ revisions: readRevisions(store, c.req.param('dataset'), parseId(c.req.param('id')), c.get('actor')) }),
  )
}

// A space narrows what a planner sees and never limits what they may read: only a reader of its dataset gets it.
function spaceOf(domain: Domain, actor: Actor): { model: string; field: string } | undefined {
  const model = domain.space?.dataset
  const space = model ? sourceOf(domain, model) : null
  const field = sourcesOf(domain).find((s) => s.scoped)?.scoped
  return model && space && field && readable(actor, space) ? { model, field } : undefined
}

function sectionsOf(domain: Domain, actor: Actor): { label: string; sources: string[] }[] | undefined {
  const visible = (name: string): boolean => {
    const source = sourceOf(domain, name)
    return source !== null && readable(actor, source)
  }
  return domain.sections
    ?.map(({ label, sources }) => ({ label, sources: sources.filter(visible) }))
    .filter((section) => section.sources.length > 0)
}

// A column that writes to a dataset reads with that column's options and tones, unless it declares its own options.
function servedColumn(domain: Domain, column: ColumnDecl, actor: Actor): ColumnDecl {
  if (!column.writes || column.options) return column
  const target = sourceOf(domain, column.writes.dataset)
  const decl = target?.columns[column.writes.field]
  if (!target || !decl?.options || !readable(actor, target)) return column
  return { ...column, options: decl.options, ...(decl.tones ? { tones: decl.tones } : {}) }
}

const servedColumns = (domain: Domain, source: Source, actor: Actor): Record<string, ColumnDecl> =>
  Object.fromEntries(Object.entries(source.columns).map(([name, c]) => [name, servedColumn(domain, c, actor)]))

function createsOf(domain: Domain, source: Source, actor: Actor): { creates?: string } {
  const target = source.kind === 'query' && source.creates ? sourceOf(domain, source.creates) : null
  return target && readable(actor, target) ? { creates: target.name } : {}
}

export interface EngineOptions {
  port: number
  appUrl?: string
  outbox?: string
  cookieName?: string
  clientIp?: (req: Request) => string
}

// Bun's own peer address; proxy headers are never read.
function peerAddress(c: Context): string {
  const address = getConnInfo(c).remote.address
  if (!address) throw new Error('no client address')
  return address
}

export function createEngine(sqlite: Database, domain: Domain, options: EngineOptions): Hono<AuthEnv> {
  const { port, appUrl = 'http://127.0.0.1:5173', outbox, cookieName = 'wt_session', clientIp } = options
  sqlite.run('PRAGMA foreign_keys = ON')
  const db = drizzle(sqlite)
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`])
  const root = new Hono<AuthEnv>()

  // A page whose name rebinds to 127.0.0.1 still sends its own Host, so only the loopback names pass.
  root.use(async (c, next) => {
    c.header('X-Content-Type-Options', 'nosniff')
    if (!hosts.has(c.req.header('host') ?? ''))
      return c.json({ code: 'forbidden_host', message: 'Host not allowed' }, 403)
    await next()
  })

  const app = root.basePath('/api')
  const store: Store = { sqlite, db, domain }
  const ipOf = clientIp ? (c: Context) => clientIp(c.req.raw) : peerAddress
  app.on(['POST', 'PUT', 'PATCH', 'DELETE'], '/*', writeGuard())
  publicRoutes(app, store, ipOf)
  authRoutes(app, sqlite, { appUrl, outbox, cookieName, clientIp: ipOf })

  app.get('/schema', (c) => {
    const actor = c.get('actor')
    const space = spaceOf(domain, actor)
    const sections = sectionsOf(domain, actor)
    const displays = displaysOf(sqlite)
    const joinOf = (s: Source): string | undefined => {
      const join = matrixOf(domain, s)?.join
      return join && readable(actor, join) ? join.name : undefined
    }
    const sources = Object.fromEntries(
      sourcesOf(domain)
        .filter((s) => readable(actor, s))
        .map((s) => [
          s.name,
          {
            kind: s.kind,
            label: displays.get(s.name)?.label ?? s.label,
            icon: displays.get(s.name)?.icon ?? s.icon ?? null,
            title: typeof s.title === 'string' ? s.title : s.title.else,
            ...(typeof s.title === 'string' ? {} : { title_via: s.title.via }),
            date: s.date ?? null,
            ...(s.kind === 'dataset' && s.matrix ? { matrix: s.matrix } : {}),
            ...(joinOf(s) ? { matrix_join: joinOf(s) } : {}),
            columns: servedColumns(domain, s, actor),
            ...createsOf(domain, s, actor),
            writable: isWritable(domain, s),
            deletable: s.kind === 'dataset' && Boolean(writerOf(domain, s.name)?.delete),
            actions: actionsOn(domain, s.name),
            ...(space ? { space: s.scoped ? 'scoped' : 'global' } : {}),
            ...(s.group_facts ? { group_facts: s.group_facts } : {}),
          },
        ]),
    )
    return c.json({ sources, ...(space ? { space } : {}), ...(sections ? { sections } : {}) })
  })

  app.get('/rows/:source', (c) => {
    const name = c.req.param('source')
    const actor = c.get('actor')
    const source = visibleSource(domain, name, actor)
    const params = parseRowsParams(source, c.req.query())
    const found = params.cells ? matrixOf(domain, source) : null
    if (params.cells && !found) throw new ApiError(400, 'no_matrix', `"${name}" is not the down source of a matrix`)
    const read = readRows(db, domain, source, params, scopeOf(actor, source))
    if (!found) return c.json(read)
    const cells = cellsOf(
      db,
      domain,
      found,
      read.rows.map((r) => r.id),
      scopeOf(actor, found.join),
    )
    return c.json({ ...read, rows: read.rows.map((r) => ({ ...r, cells: cells.get(r.id) })) })
  })

  writeRoutes(app, store)
  displayRoutes(app, store)
  viewRoutes(app, store)
  shareRoutes(app, store)

  root.onError((err, c) => {
    if (err instanceof ApiError) return c.json({ ...err.details, code: err.code, message: err.message }, err.status)
    console.error(err)
    return c.json({ code: 'internal', message: 'Internal error' }, 500)
  })

  return root
}
