import type { Database } from 'bun:sqlite'
import { beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Actor } from '../src'
import { createService } from '../src/auth'
import { recordLinkFor } from '../src/record-link'
import { UPLOAD } from '../src/write-guard'
import { domain, freshDb } from './fixture'
import { signIn, TEST_LINK_SECRET, testEngine } from './sign-in'

const OWN = { dataset: 'project', id: 1 }
const json = (value: unknown) => JSON.stringify(value)

// `link` is the link actor of project 1, authenticated by its RecordLink header; `service` an administrator
// service account, by its Bearer token.
type Role = 'none' | Actor['role'] | 'link' | 'service'

const PUBLIC_TOKEN = 'matrix-token'
const PUBLIC_HASH = new Bun.CryptoHasher('sha256').update(PUBLIC_TOKEN).digest('hex')
const FILE = '%PDF-1.4 matrix'
const FILE_HASH = new Bun.CryptoHasher('sha256').update(FILE).digest('hex')

// Written by hand from the Decisions table, never derived from may(), so a wrong cell cannot pass both sides.
// With `type`, the body is sent as it is, under that content type.
const EXPECTED: { method: string; path: string; body?: unknown; type?: string; status: Record<Role, number> }[] = [
  {
    method: 'POST',
    path: '/api/auth/request',
    body: { email: 'x@example.test' },
    status: { none: 200, owner: 200, editor: 200, administrator: 200, link: 200, service: 200 },
  },
  {
    method: 'POST',
    path: '/api/auth/consume',
    body: { token: 'not-a-link' },
    status: { none: 400, owner: 400, editor: 400, administrator: 400, link: 400, service: 400 },
  },
  {
    method: 'POST',
    path: '/api/act/view',
    body: { token: 'not-a-token' },
    status: { none: 401, owner: 401, editor: 401, administrator: 401, link: 401, service: 401 },
  },
  {
    method: 'POST',
    path: '/api/act',
    body: { token: 'not-a-token', to: 'klaar' },
    status: { none: 401, owner: 401, editor: 401, administrator: 401, link: 401, service: 401 },
  },
  {
    method: 'GET',
    path: '/api/auth/me',
    status: { none: 401, owner: 200, editor: 200, administrator: 200, link: 200, service: 200 },
  },
  {
    method: 'POST',
    path: '/api/auth/signout',
    body: {},
    status: { none: 401, owner: 200, editor: 200, administrator: 200, link: 403, service: 200 },
  },
  {
    method: 'GET',
    path: '/api/schema',
    status: { none: 401, owner: 200, editor: 200, administrator: 200, link: 403, service: 200 },
  },
  {
    method: 'GET',
    path: '/api/rows/taak',
    status: { none: 401, owner: 200, editor: 200, administrator: 200, link: 403, service: 200 },
  },
  {
    method: 'GET',
    path: '/api/rows/plat',
    status: { none: 401, owner: 404, editor: 200, administrator: 200, link: 403, service: 200 },
  },
  {
    method: 'GET',
    path: '/api/history/taak',
    status: { none: 401, owner: 200, editor: 200, administrator: 200, link: 403, service: 200 },
  },
  {
    method: 'GET',
    path: '/api/history/plat',
    status: { none: 401, owner: 404, editor: 200, administrator: 200, link: 403, service: 200 },
  },
  {
    method: 'GET',
    path: '/api/revisions/note/1',
    status: { none: 401, owner: 200, editor: 200, administrator: 200, link: 403, service: 200 },
  },
  {
    method: 'POST',
    path: '/api/rows/note',
    body: { project_id: 1, tekst: 'fresh' },
    status: { none: 401, owner: 201, editor: 201, administrator: 201, link: 403, service: 201 },
  },
  {
    method: 'PATCH',
    path: '/api/rows/note/1',
    body: { tekst: 'changed' },
    status: { none: 401, owner: 200, editor: 200, administrator: 200, link: 403, service: 200 },
  },
  {
    method: 'DELETE',
    path: '/api/rows/note/1',
    status: { none: 401, owner: 200, editor: 200, administrator: 200, link: 403, service: 200 },
  },
  {
    method: 'DELETE',
    path: '/api/rows/project/1',
    status: { none: 401, owner: 403, editor: 409, administrator: 409, link: 403, service: 409 },
  },
  {
    method: 'POST',
    path: '/api/batches/matrix-own/undo',
    body: {},
    status: { none: 401, owner: 200, editor: 200, administrator: 200, link: 403, service: 200 },
  },
  {
    method: 'POST',
    path: '/api/batches/matrix-other/undo',
    body: {},
    status: { none: 401, owner: 403, editor: 403, administrator: 403, link: 403, service: 403 },
  },
  {
    method: 'POST',
    path: '/api/actions/copy_notes',
    body: { id: 1, input: { source: 1 } },
    status: { none: 401, owner: 201, editor: 201, administrator: 201, link: 403, service: 201 },
  },
  {
    method: 'POST',
    path: '/api/actions/nope',
    body: { id: 1, input: {} },
    status: { none: 401, owner: 404, editor: 404, administrator: 404, link: 403, service: 404 },
  },
  {
    method: 'GET',
    path: '/api/views',
    status: { none: 401, owner: 200, editor: 200, administrator: 200, link: 403, service: 200 },
  },
  {
    method: 'POST',
    path: '/api/views',
    body: { name: 'Mine', source: 'taak' },
    status: { none: 401, owner: 403, editor: 201, administrator: 201, link: 403, service: 201 },
  },
  {
    method: 'PATCH',
    path: '/api/views/2',
    body: { name: 'Renamed' },
    status: { none: 401, owner: 403, editor: 200, administrator: 200, link: 403, service: 200 },
  },
  {
    method: 'DELETE',
    path: '/api/views/2',
    status: { none: 401, owner: 403, editor: 200, administrator: 200, link: 403, service: 200 },
  },
  {
    method: 'POST',
    path: '/api/views/2/restore',
    body: {},
    status: { none: 401, owner: 403, editor: 200, administrator: 200, link: 403, service: 200 },
  },
  {
    method: 'PUT',
    path: '/api/views/3/share-token',
    body: {},
    status: { none: 401, owner: 403, editor: 403, administrator: 200, link: 403, service: 403 },
  },
  {
    method: 'DELETE',
    path: '/api/views/3/share-token',
    status: { none: 401, owner: 403, editor: 403, administrator: 200, link: 403, service: 403 },
  },
  {
    method: 'PUT',
    path: '/api/views/3/for-owners',
    body: {},
    status: { none: 401, owner: 403, editor: 403, administrator: 200, link: 403, service: 403 },
  },
  {
    method: 'DELETE',
    path: '/api/views/3/for-owners',
    status: { none: 401, owner: 403, editor: 403, administrator: 200, link: 403, service: 403 },
  },
  {
    method: 'GET',
    path: '/api/owner/views',
    status: { none: 401, owner: 200, editor: 403, administrator: 403, link: 200, service: 403 },
  },
  {
    method: 'GET',
    path: '/api/owner/views/5/rows',
    status: { none: 401, owner: 200, editor: 403, administrator: 403, link: 200, service: 403 },
  },
  {
    method: 'PUT',
    path: '/api/sources/taak/display',
    body: { label: 'Werk', icon: 'star' },
    status: { none: 401, owner: 403, editor: 403, administrator: 200, link: 403, service: 200 },
  },
  {
    method: 'PUT',
    path: '/api/sources/plat/display',
    body: { label: 'Werk' },
    status: { none: 401, owner: 403, editor: 403, administrator: 200, link: 403, service: 200 },
  },
  {
    method: 'POST',
    path: '/api/record-links/request',
    body: { email: 'x@example.test' },
    status: { none: 200, owner: 200, editor: 200, administrator: 200, link: 200, service: 200 },
  },
  {
    method: 'GET',
    path: '/api/record-links/project/1',
    status: { none: 401, owner: 403, editor: 403, administrator: 200, link: 403, service: 403 },
  },
  {
    method: 'POST',
    path: '/api/record-links/project/1/rotate',
    body: {},
    status: { none: 401, owner: 403, editor: 403, administrator: 200, link: 403, service: 403 },
  },
  {
    method: 'GET',
    // A link reads its own record's files one record at a time; the batch is not on its allowlist.
    path: '/api/attachments/project?ids=1&kind=doc',
    status: { none: 401, owner: 200, editor: 200, administrator: 200, link: 403, service: 200 },
  },
  {
    method: 'GET',
    path: '/api/attachments/project/1',
    status: { none: 401, owner: 200, editor: 200, administrator: 200, link: 200, service: 200 },
  },
  {
    method: 'POST',
    path: '/api/attachments/project/1?kind=doc&name=a.pdf',
    body: FILE,
    type: 'application/octet-stream',
    status: { none: 401, owner: 201, editor: 201, administrator: 201, link: 201, service: 201 },
  },
  {
    method: 'GET',
    path: '/api/attachments/file/1',
    status: { none: 401, owner: 200, editor: 200, administrator: 200, link: 200, service: 200 },
  },
  {
    // The file is the signed-in account's; the link account deletes only its own uploads.
    method: 'DELETE',
    path: '/api/attachments/file/1',
    status: { none: 401, owner: 200, editor: 200, administrator: 200, link: 403, service: 200 },
  },
  {
    // Only the listed service puts; a link is confined before the route is reached.
    method: 'PUT',
    path: '/api/handoff/note/1',
    body: { value: 'https://matrix.example.test/' },
    status: { none: 401, owner: 403, editor: 403, administrator: 403, link: 403, service: 200 },
  },
  {
    // Only the creator account reads; every other caller gets the one 404.
    method: 'GET',
    path: '/api/handoff/note/1',
    status: { none: 401, owner: 404, editor: 404, administrator: 404, link: 403, service: 404 },
  },
  {
    method: 'GET',
    path: `/api/public/views/${PUBLIC_TOKEN}`,
    status: { none: 200, owner: 200, editor: 200, administrator: 200, link: 200, service: 200 },
  },
]

const roles: Role[] = ['none', 'owner', 'editor', 'administrator', 'link', 'service']

describe('the permissions matrix', () => {
  let sqlite: Database
  let app: ReturnType<typeof testEngine>
  const cookies = {} as Record<Role, string | undefined>
  let serviceToken: string

  // One engine and one sign-in per role; each cell runs in a savepoint that is rolled back.
  beforeAll(async () => {
    sqlite = freshDb()
    const filesDir = mkdtempSync(join(tmpdir(), 'wt-matrix-files-'))
    writeFileSync(join(filesDir, FILE_HASH), FILE)
    app = testEngine(sqlite, domain, { filesDir, handoffServices: ['matrix'] })
    for (const role of ['owner', 'editor', 'administrator'] as const) {
      cookies[role] = await signIn(app, role, role === 'owner' ? OWN : null)
    }
    serviceToken = createService(sqlite, 'matrix', 'administrator')
  })

  for (const { method, path, body, type, status } of EXPECTED) {
    for (const role of roles) {
      test(`${method} ${path} as ${role} is ${status[role]}`, async () => {
        sqlite.run('SAVEPOINT cell')
        try {
          // Views 2 and 3 belong to whoever signed in, so only the role decides; 4 is public, 5 for owners.
          const row = (
            role === 'service'
              ? sqlite.query("SELECT id FROM account WHERE kind = 'service'").get()
              : sqlite.query("SELECT id FROM account WHERE role = ? AND kind = 'user'").get(role)
          ) as { id: number } | null
          const account = row?.id ?? 0
          sqlite.run(
            `INSERT INTO saved_view (name, source_type, source, owner_id, visible_fields, public, share_token, for_owners)
             VALUES ('Own', 'dataset', 'taak', ${account}, '[]', 0, NULL, 0),
                    ('Query', 'query', 'per_project', ${account}, '["name"]', 0, NULL, 0),
                    ('Public', 'query', 'per_project', ${account}, '["name"]', 1, '${PUBLIC_HASH}', 0),
                    ('Owners', 'query', 'per_project', ${account}, '["name"]', 0, NULL, 1)`,
          )
          // One batch of the signed-in account's on a note every role may write, and one of another account.
          sqlite.run(
            `INSERT INTO batch (key, actor_id, kind, at) VALUES ('matrix-own', ${account}, 'write', 'x'), ('matrix-other', 999, 'write', 'x')`,
          )
          sqlite.run(
            `INSERT INTO revision (entity, record_id, field, old, new, actor_id, at, batch_id)
             VALUES ('note', 1, 'id', NULL, '1', ${account}, 'x', 'matrix-created'),
                    ('note', 1, 'tekst', '"oud"', '"eerste"', ${account}, 'x', 'matrix-own'),
                    ('note', 1, 'tekst', '"oud"', '"eerste"', 999, 'x', 'matrix-other')`,
          )
          // One file on project 1, uploaded by the signed-in account.
          sqlite.run(
            `INSERT INTO attachment (entity, record_id, kind, name, mime, size, sha256, uploaded_by)
             VALUES ('project', 1, 'doc', 'a.pdf', 'application/pdf', ${FILE.length}, '${FILE_HASH}', ${account})`,
          )
          const raw = body === undefined ? undefined : type ? String(body) : json(body)
          const authorization =
            role === 'link'
              ? `RecordLink ${recordLinkFor(sqlite, TEST_LINK_SECRET, 'project', 1)}`
              : role === 'service'
                ? `Bearer ${serviceToken}`
                : null
          const credential = authorization ? { authorization } : cookies[role] ? { cookie: cookies[role] } : {}
          const res = await app.request(path, {
            method,
            headers: {
              host: '127.0.0.1:4310',
              ...credential,
              ...(raw === undefined ? {} : { 'content-type': type ?? 'application/json' }),
              ...(type ? { 'content-length': String(raw?.length) } : {}),
            },
            body: raw,
          })
          expect(res.status).toBe(status[role])
        } finally {
          sqlite.run('ROLLBACK TO cell')
          sqlite.run('RELEASE cell')
        }
      })
    }
  }
})

// A registered route pattern against a concrete path: ':name' matches one segment.
const matches = (pattern: string, path: string) => {
  const a = pattern.split('/')
  const b = path.split('/')
  return a.length === b.length && a.every((seg, i) => seg.startsWith(':') || seg === b[i])
}

describe('every route has a row in the matrix', () => {
  const registered = testEngine(freshDb(), domain).routes.filter(
    (r) => r.path.startsWith('/api/') && r.method !== 'ALL' && r.path !== '/api/*',
  )
  const listed = (r: { method: string; path: string }) =>
    EXPECTED.some((e) => e.method === r.method && matches(r.path, e.path))

  test('a registered /api route with no EXPECTED row fails, naming it', () => {
    expect(registered.filter((r) => !listed(r)).map((r) => `${r.method} ${r.path}`)).toEqual([])
  })

  // Each ':param' or '*' segment filled with a word and with digits, every combination.
  const concrete = (pattern: string): string[] =>
    pattern
      .split('/')
      .reduce<string[]>(
        (paths, seg) =>
          (seg.startsWith(':') || seg === '*' ? ['a', '1'] : [seg]).flatMap((s) => paths.map((p) => `${p}/${s}`)),
        [''],
      )
      .map((p) => p.slice(1))

  test('the write guard skips its JSON checks for the upload route only', () => {
    const exempt = registered.filter((r) => r.method === 'POST' && concrete(r.path).some((p) => UPLOAD.test(p)))
    expect(exempt.map((r) => `${r.method} ${r.path}`)).toEqual(['POST /api/attachments/:dataset/:id'])
  })

  test('every EXPECTED row names a registered route and gives every role', () => {
    for (const e of EXPECTED) {
      const name = `${e.method} ${e.path}`
      expect(
        registered.some((r) => r.method === e.method && matches(r.path, e.path)),
        name,
      ).toBe(true)
      expect(Object.keys(e.status).sort(), name).toEqual([...roles].sort())
    }
  })
})
