import type { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { Hono } from 'hono'
import type { Domain, SavedViewSeed } from './declare'
import { ApiError, parseRowsParams } from './params'
import { sourceOf, sourcesOf } from './registry'
import { readRows } from './rows'

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

export function createEngine(sqlite: Database, domain: Domain): Hono {
  const db = drizzle(sqlite)
  const app = new Hono().basePath('/api')

  app.get('/schema', (c) => {
    const sources = Object.fromEntries(
      sourcesOf(domain).map((s) => [
        s.name,
        { kind: s.kind, label: s.label, title: s.title, date: s.date ?? null, columns: s.columns },
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

  app.onError((err, c) => {
    if (err instanceof ApiError) return c.json({ code: err.code, message: err.message }, err.status)
    console.error(err)
    return c.json({ code: 'internal', message: 'Internal error' }, 500)
  })

  return app
}
