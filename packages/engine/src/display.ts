import type { Database } from 'bun:sqlite'
import type { Hono } from 'hono'
import { forbid, may, visibleSource } from './access'
import type { AuthEnv } from './auth'
import { type Actor, ICONS } from './declare'
import { sourceDisplay } from './engine-tables'
import { ApiError } from './params'
import { bodyOf, create, recordBatch, revise, type Store } from './writes'

export interface Display {
  label: string | null
  icon: string | null
}

type Stored = { id: number; label: string | null; icon: string | null }
type Change = [field: string, old: string | null, value: string | null]

const MAX_LABEL = 60
const KEYS = ['label', 'icon']

const bad = (message: string) => new ApiError(400, 'bad_display', message)

function labelOf(value: unknown): string | null {
  if (value === null) return null
  const label = typeof value === 'string' ? value.trim() : ''
  if (label.length < 1 || label.length > MAX_LABEL) throw bad(`label must be 1 to ${MAX_LABEL} characters`)
  if (/[\p{Cc}\p{Cf}]/u.test(label)) throw bad('label must not hold control or format characters')
  return label
}

function iconOf(value: unknown): string | null {
  if (value === null) return null
  if (typeof value !== 'string' || !(ICONS as readonly string[]).includes(value))
    throw bad(`icon must be one of ${ICONS.join(', ')}`)
  return value
}

function patchOf(body: Record<string, unknown>): Partial<Display> {
  const extra = Object.keys(body).find((key) => !KEYS.includes(key))
  if (extra) throw bad(`"${extra}" is not a display setting`)
  if (!KEYS.some((key) => Object.hasOwn(body, key))) throw bad('give a label, an icon or both')
  return {
    ...(Object.hasOwn(body, 'label') ? { label: labelOf(body.label) } : {}),
    ...(Object.hasOwn(body, 'icon') ? { icon: iconOf(body.icon) } : {}),
  }
}

export function displaysOf(sqlite: Database): Map<string, Display> {
  const rows = sqlite.query('SELECT source, label, icon FROM source_display WHERE deleted_at IS NULL').all() as ({
    source: string
  } & Display)[]
  return new Map(rows.map(({ source, label, icon }) => [source, { label, icon }]))
}

// One transaction and one batch, revised like any write.
function save(sqlite: Database, source: string, patch: Partial<Display>, actor: Actor): string | null {
  const sql = 'SELECT id, label, icon FROM source_display WHERE source = ? AND deleted_at IS NULL'
  const current = sqlite.query(sql).get(source) as Stored | null
  const now = new Date().toISOString()
  const key = crypto.randomUUID()
  if (!current) {
    create(sqlite, sourceDisplay, { source, ...patch }, now, actor.id, key)
    recordBatch(sqlite, key, actor.id, 'write', now)
    return key
  }
  const changes = Object.entries(patch)
    .map(([field, value]): Change => [field, current[field as keyof Display], value])
    .filter(([, old, value]) => old !== value)
  if (changes.length === 0) return null
  const sets = [...changes.map(([field]) => `"${field}" = ?`), 'updated_at = ?']
  sqlite
    .query(`UPDATE source_display SET ${sets.join(', ')} WHERE id = ?`)
    .run(...changes.map(([, , value]) => value), now, current.id)
  revise(sqlite, sourceDisplay, current.id, changes, now, actor.id, key)
  recordBatch(sqlite, key, actor.id, 'write', now)
  return key
}

// The role is checked before the source is looked up, so a refused caller learns nothing of the sources.
export function displayRoutes(app: Hono<AuthEnv>, { sqlite, domain }: Store): void {
  app.put('/sources/:name/display', async (c) => {
    const actor = c.get('actor')
    if (!may(actor, 'sources.display')) forbid('only an administrator may change how a source is shown')
    const source = visibleSource(domain, c.req.param('name'), actor)
    const patch = patchOf(await bodyOf(c))
    const batch_id = sqlite.transaction(() => save(sqlite, source.name, patch, actor)).immediate()
    const shown = displaysOf(sqlite).get(source.name)
    return c.json({
      source: source.name,
      label: shown?.label ?? source.label,
      icon: shown?.icon ?? source.icon ?? null,
      batch_id,
    })
  })
}
