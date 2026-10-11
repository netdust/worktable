import { existsSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Context, Hono } from 'hono'
import { forbid, inScope, readable as readableSource, scopeOf } from './access'
import type { AuthEnv } from './auth'
import type { Actor, AttachmentsDecl, DatasetDecl } from './declare'
import { attachment } from './engine-tables'
import { ApiError } from './params'
import { checkLimits, type Limit } from './rate-limit'
import { sourceOf, writerOf } from './registry'
import { StripError, type StrippedMime, strip } from './strip'
import { CREATED, create, parseId, recordBatch, revise, type Store } from './writes'

type Declared = DatasetDecl & { attachments: AttachmentsDecl }

interface AttachmentRow {
  id: number
  entity: string
  record_id: number
  kind: string
  name: string
  mime: string
  size: number
  sha256: string
  uploaded_by: number
  created_at: string
  deleted_at: string | null
}

const MB = 1024 * 1024
export const DEFAULT_MAX_MB = 10
export const DEFAULT_FILES_MAX_BYTES = 5 * 1024 ** 3
const MAX_NAME = 200
// Control characters and direction controls; a bidi override would let x.pdf read as another name.
const UNSAFE = /[\p{Cc}\u200e\u200f\u202a-\u202e\u2066-\u2069]/u
const INLINE = new Set(['image/jpeg', 'image/png', 'image/webp'])
const EXTENSIONS: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
}

const uploadLimit = (actor: Actor): Limit => ({ key: `upload:${actor.id}`, max: 30, windowMs: 60_000 })

const unknownAttachment = () => new ApiError(404, 'unknown_attachment', 'unknown attachment')
const unknownSource = (name: string) => new ApiError(404, 'unknown_source', `unknown source "${name}"`)
const unknownRecord = (id: number) => new ApiError(404, 'unknown_record', `unknown record ${id}`)

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0))
const startsWith = (bytes: Uint8Array, signature: number[], at = 0): boolean =>
  bytes.length >= at + signature.length && signature.every((b, i) => bytes[at + i] === b)

type SniffedMime = 'application/pdf' | StrippedMime

/** The type the first bytes prove, from the allowlist; null for anything else. */
export function sniff(bytes: Uint8Array): SniffedMime | null {
  if (startsWith(bytes, ascii('%PDF-'))) return 'application/pdf'
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'image/webp'
  return null
}

// The saved file opens as what it is: a pdf named x.html saves as x.html.pdf.
function savedName(mime: string, name: string): string {
  const extensions = EXTENSIONS[mime] ?? []
  const fits = extensions.some((extension) => name.toLowerCase().endsWith(extension))
  return fits || !extensions[0] ? name : `${name}${extensions[0]}`
}

// RFC 5987: encodeURIComponent leaves ' ( ) * unescaped, which the header grammar does not allow.
export function dispositionOf(mime: string, name: string): string {
  const encoded = encodeURIComponent(savedName(mime, name)).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return `${INLINE.has(mime) ? 'inline' : 'attachment'}; filename*=UTF-8''${encoded}`
}

const maxBytes = (dataset: Declared): number => (dataset.attachments.max_mb ?? DEFAULT_MAX_MB) * MB

// A dataset whose files the actor may not read does not exist for it.
function declaredOf(store: Store, name: string, actor: Actor): Declared | null {
  const source = sourceOf(store.domain, name)
  if (source?.kind !== 'dataset' || !source.attachments || !readableSource(actor, source)) return null
  if (actor.role === 'owner' && !source.attachments.owner_visible) return null
  return source as Declared
}

function liveRecord(store: Store, dataset: Declared, id: number, actor: Actor): Record<string, unknown> | null {
  const row = store.sqlite.query(`SELECT * FROM "${dataset.name}" WHERE id = ? AND deleted_at IS NULL`).get(id)
  return row && inScope(scopeOf(actor, dataset), row as Record<string, unknown>)
    ? (row as Record<string, unknown>)
    : null
}

function recordOf(store: Store, name: string, raw: string, actor: Actor): { dataset: Declared; id: number } {
  const dataset = declaredOf(store, name, actor)
  if (!dataset) throw unknownSource(name)
  const id = parseId(raw)
  if (!liveRecord(store, dataset, id, actor)) throw unknownRecord(id)
  return { dataset, id }
}

/** A live attachment the actor may read; every failure is the same 404 (attack 3). */
export function readable(store: Store, raw: string | number, actor: Actor): { file: AttachmentRow; dataset: Declared } {
  const id = typeof raw === 'number' ? raw : /^[1-9]\d{0,14}$/.test(raw) ? Number(raw) : 0
  const file = store.sqlite
    .query('SELECT * FROM attachment WHERE id = ? AND deleted_at IS NULL')
    .get(id) as AttachmentRow | null
  const dataset = file ? declaredOf(store, file.entity, actor) : null
  if (!file || !dataset || !liveRecord(store, dataset, file.record_id, actor)) throw unknownAttachment()
  return { file, dataset }
}

// An owner writes only where the dataset allows it, and deletes only its own uploads.
function checkWrite(store: Store, dataset: Declared, actor: Actor, uploadedBy?: number): void {
  if (!writerOf(store.domain, dataset.name)) {
    throw new ApiError(405, 'read_only', `"${dataset.name}" does not accept attachments`)
  }
  if (actor.role !== 'owner') return
  if (!dataset.attachments.owner_writable) forbid('An owner may not add files here')
  if (uploadedBy !== undefined && uploadedBy !== actor.id) forbid('An owner deletes only its own files')
}

function checkName(name: string | undefined): string {
  if (name === undefined || name.length < 1 || name.length > MAX_NAME || UNSAFE.test(name)) {
    throw new ApiError(400, 'bad_name', `name must be 1 to ${MAX_NAME} characters without control or format characters`)
  }
  return name
}

function checkKind(dataset: Declared, kind: string | undefined): string {
  if (kind === undefined || !Object.hasOwn(dataset.attachments.kinds, kind)) {
    throw new ApiError(400, 'bad_kind', `kind must be one of ${Object.keys(dataset.attachments.kinds).join(', ')}`)
  }
  return kind
}

function filesDirOf(store: Store): string {
  if (!store.filesDir) throw new Error('attachments need a files directory')
  return store.filesDir
}

// Written under a temporary name and renamed, so a file at its hash is always whole.
// `written` is the path when this call made the file, so a failed insert can take it back.
// Bytes already stored add nothing, so a duplicate is never refused here.
function storeBytes(store: Store, bytes: Uint8Array): { sha256: string; written?: string } {
  const sha256 = new Bun.CryptoHasher('sha256').update(bytes).digest('hex')
  const known = store.sqlite.query('SELECT 1 FROM attachment WHERE sha256 = ? LIMIT 1').get(sha256)
  // The race backstop: overlapping uploads all pass checkUpload before either body is read.
  if (!known && !fits(store, bytes.length)) throw storageFull()
  const path = join(filesDirOf(store), sha256)
  if (existsSync(path)) return { sha256 }
  const temporary = `${path}.${crypto.randomUUID()}.tmp`
  try {
    writeFileSync(temporary, bytes, { mode: 0o600 })
    renameSync(temporary, path)
  } catch (error) {
    rmSync(temporary, { force: true })
    throw error
  }
  return { sha256, written: path }
}

const storageFull = () =>
  new ApiError(507, 'storage_full', 'The storage for attachments is full: an administrator must raise the limit')

// Soft-deleted files stay on disk for undo, so they count; the same bytes sit on disk once.
function storedTotal(store: Store): number {
  const sql = 'SELECT COALESCE(SUM(size), 0) AS total FROM (SELECT MAX(size) AS size FROM attachment GROUP BY sha256)'
  return (store.sqlite.query(sql).get() as { total: number }).total
}

const fits = (store: Store, bytes: number): boolean =>
  storedTotal(store) + bytes <= (store.filesMaxBytes ?? DEFAULT_FILES_MAX_BYTES)

const isOctetStream = (type: string | undefined): boolean =>
  type?.split(';')[0]?.trim().toLowerCase() === 'application/octet-stream'

// Bun's server holds a request to its Content-Length, so a declared length bounds what is read.
function declaredLength(c: Context<AuthEnv>, max: number): number {
  const length = c.req.header('content-length') ?? ''
  if (c.req.header('transfer-encoding') !== undefined || !/^\d{1,15}$/.test(length)) {
    throw new ApiError(411, 'length_required', 'An upload needs a Content-Length')
  }
  if (Number(length) > max) throw new ApiError(413, 'body_too_large', `A file is at most ${max / MB} MB`)
  return Number(length)
}

// Every refusal is decided before the body is read, so a refused upload costs no bytes.
function checkUpload(store: Store, c: Context<AuthEnv>) {
  const actor = c.get('actor')
  const target = recordOf(store, c.req.param('dataset') ?? '', c.req.param('id') ?? '', actor)
  if (!isOctetStream(c.req.header('content-type'))) {
    throw new ApiError(415, 'bad_content_type', 'Content-Type must be application/octet-stream')
  }
  const file = { kind: checkKind(target.dataset, c.req.query('kind')), name: checkName(c.req.query('name')) }
  checkWrite(store, target.dataset, actor)
  checkLimits(store.sqlite, () => [uploadLimit(actor)], false)
  if (!fits(store, declaredLength(c, maxBytes(target.dataset)))) throw storageFull()
  return { target, file }
}

const badFileType = () => new ApiError(415, 'bad_file_type', 'Only pdf, jpeg, png and webp files are taken')

// A photo loses its location and camera data before it is hashed (attack 7); a pdf is kept byte for byte.
function withoutMetadata(bytes: Uint8Array, mime: SniffedMime): Uint8Array {
  try {
    switch (mime) {
      case 'application/pdf':
        return bytes
      case 'image/jpeg':
      case 'image/png':
      case 'image/webp':
        return strip(bytes, mime)
      default: {
        const unknown: never = mime
        throw new Error(`no metadata rule for ${unknown}`)
      }
    }
  } catch (error) {
    if (error instanceof StripError) throw badFileType()
    throw error
  }
}

function upload(
  store: Store,
  target: { dataset: Declared; id: number },
  file: { kind: string; name: string },
  bytes: Uint8Array,
  actor: Actor,
) {
  const mime = sniff(bytes)
  if (!mime) throw badFileType()
  const stored = withoutMetadata(bytes, mime)
  const { sha256, written } = storeBytes(store, stored)
  const now = new Date().toISOString()
  const batch = crypto.randomUUID()
  const { kind, name } = file
  const row = {
    entity: target.dataset.name,
    record_id: target.id,
    kind,
    name,
    mime,
    size: stored.length,
    sha256,
    uploaded_by: actor.id,
  }
  // Nothing awaits between the write and the insert, so no other upload can have claimed the new file.
  let made: number
  try {
    made = store.sqlite
      .transaction(() => {
        const { id: fileId } = create(store.sqlite, attachment, row, now, actor.id, batch)
        recordBatch(store.sqlite, batch, actor.id, 'write', now)
        return fileId
      })
      .immediate()
  } catch (error) {
    if (written) rmSync(written, { force: true })
    throw error
  }
  return { id: made, kind, name, mime, size: stored.length, revision: { batch_id: batch } }
}

function setDeleted(store: Store, file: AttachmentRow, value: string | null, now: string, actor: Actor, batch: string) {
  store.sqlite.query('UPDATE attachment SET deleted_at = ?, updated_at = ? WHERE id = ?').run(value, now, file.id)
  revise(store.sqlite, attachment, file.id, [['deleted_at', file.deleted_at, value]], now, actor.id, batch)
}

function remove(store: Store, raw: string, actor: Actor) {
  return store.sqlite
    .transaction(() => {
      const { file, dataset } = readable(store, raw, actor)
      checkWrite(store, dataset, actor, file.uploaded_by)
      const now = new Date().toISOString()
      const batch = crypto.randomUUID()
      setDeleted(store, file, now, now, actor, batch)
      recordBatch(store.sqlite, batch, actor.id, 'write', now)
      return { id: file.id, revision: { batch_id: batch } }
    })
    .immediate()
}

export function attachmentRoutes(app: Hono<AuthEnv>, store: Store): void {
  // Before the :dataset routes, which would otherwise read "file" as a dataset.
  app.get('/attachments/file/:id', async (c) => {
    const { file } = readable(store, c.req.param('id'), c.get('actor'))
    const bytes = Bun.file(join(filesDirOf(store), file.sha256))
    if (!(await bytes.exists())) throw new Error(`attachment ${file.id}: its file ${file.sha256} is missing`)
    return c.body(bytes.stream(), 200, {
      'Content-Type': file.mime,
      'Content-Length': String(bytes.size),
      'Content-Disposition': dispositionOf(file.mime, file.name),
      'Content-Security-Policy': 'sandbox',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    })
  })

  app.delete('/attachments/file/:id', (c) => c.json(remove(store, c.req.param('id'), c.get('actor'))))

  app.get('/attachments/:dataset/:id', (c) => {
    const actor = c.get('actor')
    const { dataset, id } = recordOf(store, c.req.param('dataset'), c.req.param('id'), actor)
    const sql = `SELECT id, kind, name, mime, size, uploaded_by, created_at FROM attachment
                 WHERE entity = ? AND record_id = ? AND deleted_at IS NULL ORDER BY id`
    const rows = store.sqlite.query(sql).all(dataset.name, id) as AttachmentRow[]
    const attachments = rows.map(({ uploaded_by, ...row }) => ({ ...row, own: uploaded_by === actor.id }))
    return c.json({ attachments })
  })

  app.post('/attachments/:dataset/:id', async (c) => {
    const { target, file } = checkUpload(store, c)
    const bytes = new Uint8Array(await c.req.arrayBuffer())
    return c.json(upload(store, target, file, bytes, c.get('actor')), 201)
  })
}

/** What /schema serves of a dataset's attachments: to an owner only when it may read them. */
export function servedAttachments(source: { attachments?: AttachmentsDecl }, actor: Actor) {
  const declared = source.attachments
  if (!declared || (actor.role === 'owner' && !declared.owner_visible)) return {}
  const { kinds, max_mb = DEFAULT_MAX_MB, owner_visible, owner_writable } = declared
  return {
    attachments: {
      kinds,
      max_mb,
      ...(owner_visible ? { owner_visible } : {}),
      ...(owner_writable ? { owner_writable } : {}),
    },
  }
}

interface FileRevision {
  entity: string
  record_id: number
  field: string
  old: string | null
  new: string | null
}

// Per file: what deleted_at must hold now (the batch's last new) and what it goes back to.
interface FileUndo {
  id: number
  expect: string | null
  to: string | null
}

const parsed = (raw: string | null): string | null => (raw === null ? null : (JSON.parse(raw) as string))

function fileUndos(rows: FileRevision[], now: string): FileUndo[] {
  const files = new Map<number, { created: boolean; first?: string | null; last: string | null }>()
  for (const r of rows) {
    const file = files.get(r.record_id) ?? { created: false, last: null }
    files.set(r.record_id, file)
    if (r.field === CREATED) file.created = true
    if (r.field !== 'deleted_at') continue
    if (file.first === undefined) file.first = parsed(r.old)
    file.last = parsed(r.new)
  }
  return [...files].map(([id, file]) =>
    file.first === undefined ? { id, expect: null, to: now } : { id, expect: file.last, to: file.first },
  )
}

/** Undoes a batch of attachment rows only (an upload or a delete); null for any other batch, which the caller undoes. */
export function undoAttachments(
  store: Store,
  key: string,
  actor: Actor,
): { batch_id: string; affected: { dataset: string; id: number }[] } | null {
  const sql = 'SELECT entity, record_id, field, old, new FROM revision WHERE batch_id = ? ORDER BY id'
  const rows = store.sqlite.query(sql).all(key) as FileRevision[]
  if (rows.length === 0 || rows.some((r) => r.entity !== attachment.name)) return null
  const now = new Date().toISOString()
  const planned = fileUndos(rows, now).map((undo) => {
    const file = store.sqlite.query('SELECT * FROM attachment WHERE id = ?').get(undo.id) as AttachmentRow | null
    const dataset = file && declaredOf(store, file.entity, actor)
    if (!file || !dataset || !liveRecord(store, dataset, file.record_id, actor)) throw unknownAttachment()
    checkWrite(store, dataset, actor, file.uploaded_by)
    if (file.deleted_at !== undo.expect) {
      throw new ApiError(409, 'changed_since', '"deleted_at" changed since', {
        dataset: attachment.name,
        id: file.id,
        column: 'deleted_at',
        label: file.name,
      })
    }
    return { file, to: undo.to }
  })
  const undone = crypto.randomUUID()
  for (const { file, to } of planned) setDeleted(store, file, to, now, actor, undone)
  recordBatch(store.sqlite, undone, actor.id, 'undo', now)
  store.sqlite.query('UPDATE batch SET undone_by = ? WHERE key = ?').run(undone, key)
  const affected = new Map(planned.map(({ file }) => [`${file.entity}:${file.record_id}`, file]))
  return { batch_id: undone, affected: [...affected.values()].map((f) => ({ dataset: f.entity, id: f.record_id })) }
}
