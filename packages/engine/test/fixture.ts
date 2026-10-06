import { Database } from 'bun:sqlite'
import {
  type Domain,
  defineDataset,
  defineQuery,
  migrate,
  refuse,
  seedDomain,
  type WriteContext,
  type Writer,
} from '../src'

const project = defineDataset({
  name: 'project',
  label: 'Projecten',
  title: 'name',
  custom: true,
  columns: { name: { type: 'text', label: 'Name' } },
})

const taak = defineDataset({
  name: 'taak',
  label: 'Taken',
  title: 'description',
  date: 'day',
  custom: true,
  columns: {
    project_id: { type: 'integer', label: 'Project', relation: 'project' },
    description: { type: 'text', label: 'Description' },
    status: { type: 'text', label: 'Status', options: { open: 'Open', klaar: 'Klaar' } },
    prio: { type: 'integer', label: 'Prio', nullable: true },
    start_at: { type: 'datetime', label: 'Start' },
    day: { type: 'date', label: 'Day' },
    afgerond: { type: 'boolean', label: 'Afgerond', default: false },
  },
})

const plat = defineDataset({
  name: 'plat',
  label: 'Plat',
  title: 'name',
  custom: false,
  columns: { name: { type: 'text', label: 'Name' } },
})

const perProject = defineQuery({
  name: 'per_project',
  label: 'Per project',
  title: 'name',
  date: 'day',
  sql: `SELECT MIN(t.id) AS id, t.project_id, p.name, t.day, COUNT(*) AS aantal
        FROM taak t JOIN project p ON p.id = t.project_id WHERE t.deleted_at IS NULL GROUP BY t.project_id, t.day`,
  columns: {
    id: { type: 'integer', label: 'Id' },
    project_id: { type: 'integer', label: 'Project', relation: 'project' },
    name: { type: 'text', label: 'Name' },
    day: { type: 'date', label: 'Day' },
    aantal: { type: 'integer', label: 'Aantal' },
  },
})

const note = defineDataset({
  name: 'note',
  label: 'Notes',
  title: 'tekst',
  custom: true,
  columns: {
    project_id: { type: 'integer', label: 'Project', relation: 'project' },
    tekst: { type: 'text', label: 'Tekst' },
    lengte: { type: 'integer', label: 'Lengte', readonly: true },
    klaar: { type: 'boolean', label: 'Klaar', default: false },
    kind: { type: 'text', label: 'Kind', options: { kort: 'Kort', lang: 'Lang' }, default: 'kort' },
    day: { type: 'date', label: 'Day', nullable: true },
    start_at: { type: 'datetime', label: 'Start', nullable: true },
    extra: { type: 'json', label: 'Extra', nullable: true },
  },
})

const noteLijst = defineQuery({
  name: 'note_lijst',
  label: 'Notitielijst',
  title: 'tekst',
  sql: 'SELECT n.id, n.tekst, p.name FROM note n JOIN project p ON p.id = n.project_id WHERE n.deleted_at IS NULL',
  columns: {
    id: { type: 'integer', label: 'Id' },
    tekst: { type: 'text', label: 'Tekst', writes: { dataset: 'note', field: 'tekst', key: 'id' } },
    name: { type: 'text', label: 'Name' },
  },
})

// Test-only: a tekst naming a probe makes the writer ask ctx.exists something it must not.
export const probes: Record<string, [string, Record<string, unknown>]> = {
  'probe undeclared': ['note', { onbekend: 1 }],
  'probe id': ['note', { id: 1 }],
  'probe null': ['note', { day: null }],
  'probe undefined': ['note', { day: undefined }],
  'probe empty': ['note', {}],
  'probe array': ['note', { tekst: ['x'] }],
  'probe revision': ['revision', { entity: 'note' }],
  'probe saved_view': ['saved_view', { name: 'Open' }],
  'probe query': ['per_project', { name: 'Alfa' }],
}

function refuseDuplicate(merged: Record<string, unknown>, ctx: WriteContext): void {
  const probe = typeof merged.tekst === 'string' && Object.hasOwn(probes, merged.tekst) ? probes[merged.tekst] : null
  if (probe) ctx.exists(...probe)
  const match = { project_id: merged.project_id, tekst: merged.tekst }
  if (typeof match.project_id !== 'number' || typeof match.tekst !== 'string') return
  if (ctx.exists('note', match, ctx.current?.id as number | undefined)) refuse('deze note bestaat al')
}

// Checks no relation and no option itself, so the engine's own backstops are what the tests reach.
function derive(values: Record<string, unknown>, ctx: WriteContext): Record<string, unknown> {
  const merged = { ...ctx.current, ...values }
  const project = typeof merged.project_id === 'number' ? ctx.find('project', merged.project_id) : null
  if (project?.name === 'Beta') refuse('project Beta is gesloten')
  refuseDuplicate(merged, ctx)
  return typeof merged.tekst === 'string' ? { ...values, lengte: merged.tekst.length } : values
}

const noteWriter: Writer = { create: derive, update: derive, delete: () => {} }

// Delete only, so project stays non-writable in /schema; records each delete that reached it.
export const projectDeletes: unknown[] = []
const projectWriter: Writer = { delete: (ctx) => void projectDeletes.push(ctx.current?.id) }

export const domain: Domain = {
  datasets: [project, taak, plat, note],
  queries: [perProject, noteLijst],
  writers: { project: projectWriter, note: noteWriter },
  seed: (insert) => {
    insert('project', [{ name: 'Alfa', custom: { kleur: 'rood', labels: ['a', 'b'] } }, { name: 'Beta' }])
    insert('taak', [
      {
        project_id: 1,
        description: 'een',
        status: 'open',
        prio: 2,
        start_at: '2026-10-12T09:00',
        day: '2026-10-12',
        custom: { kleur: 'rood', labels: ['a', 'b'] },
      },
      {
        project_id: 1,
        description: 'twee',
        status: 'klaar',
        prio: 1,
        start_at: '2026-10-12T08:00',
        day: '2026-10-12',
        afgerond: true,
        custom: { kleur: 'blauw', labels: 'a' },
      },
      {
        project_id: 2,
        description: 'drie',
        status: 'open',
        prio: null,
        start_at: '2026-10-14T10:00',
        day: '2026-10-14',
      },
      { project_id: 2, description: 'vier', status: 'open', prio: 5, start_at: '2026-10-15T10:00', day: '2026-10-15' },
    ])
    insert('plat', [{ name: 'x' }])
    insert('note', [{ project_id: 1, tekst: 'eerste', lengte: 6 }])
  },
  views: [
    {
      name: 'Open',
      source_type: 'dataset',
      source: 'taak',
      skin: 'table',
      filters: { status: 'open' },
      sort: ['start_at'],
      group_by: 'day',
      visible_fields: ['description'],
    },
  ],
}

export function freshDb(): Database {
  const sqlite = new Database(':memory:')
  migrate(sqlite, domain)
  seedDomain(sqlite, domain)
  return sqlite
}

export const contents = (sqlite: Database, table: string): unknown[] =>
  sqlite.query(`SELECT * FROM "${table}" ORDER BY id`).all()

export interface Sent {
  body?: string
  type?: string | null
  site?: string
  host?: string
  origin?: string
  cookie?: string
}

export function send(
  app: { request: (path: string, init: RequestInit) => Response | Promise<Response> },
  signedIn?: string,
) {
  return async (
    method: string,
    path: string,
    { body, type = 'application/json', site, host = '127.0.0.1:4310', origin, cookie = signedIn }: Sent = {},
  ) => {
    const headers: Record<string, string> = { host }
    if (type) headers['content-type'] = type
    if (site) headers['sec-fetch-site'] = site
    if (origin) headers.origin = origin
    if (cookie) headers.cookie = cookie
    const res = await app.request(path, { method, headers, body })
    // biome-ignore lint/suspicious/noExplicitAny: response bodies are asserted structurally
    return { status: res.status, body: (await res.json()) as Record<string, any> }
  }
}
