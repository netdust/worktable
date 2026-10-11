import type { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEngine, type DatasetDecl, type Domain, validateDomain } from '../src'
import { domain, freshDb } from './fixtures/attachment-domain'
import { signIn, TEST_LINK_SECRET, testEngine } from './sign-in'

const HOST = '127.0.0.1:4310'
const ascii = (text: string) => new TextEncoder().encode(text)
const PDF = ascii('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n')
const sha256 = (bytes: Uint8Array) => new Bun.CryptoHasher('sha256').update(bytes).digest('hex')

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(ascii(type), 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, Bun.hash.crc32(out.subarray(4, 8 + data.length)))
  return out
}

const PNG = new Uint8Array([
  ...[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  ...chunk('IHDR', new Uint8Array([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0])),
  ...chunk('IDAT', new Uint8Array([0x78, 0x9c, 0x63, 0xf8, 0x0f, 0x00, 0x01, 0x01, 0x01, 0x00])),
  ...chunk('IEND', new Uint8Array()),
])

let sqlite: Database
let app: ReturnType<typeof testEngine>
let filesDir: string
let editor: string

beforeEach(async () => {
  sqlite = freshDb()
  filesDir = mkdtempSync(join(tmpdir(), 'wt-files-'))
  app = testEngine(sqlite, domain, { filesDir })
  editor = await signIn(app)
})

interface Upload {
  dataset?: string
  id?: number
  kind?: string
  name?: string
  type?: string
  site?: string
  cookie?: string
}

async function upload(body: Uint8Array, opts: Upload = {}) {
  const { dataset = 'box', id = 1, kind = 'doc', name = 'plan.pdf', type = 'application/octet-stream' } = opts
  const headers: Record<string, string> = {
    host: HOST,
    cookie: opts.cookie ?? editor,
    'content-type': type,
    'content-length': String(body.length),
  }
  if (opts.site) headers['sec-fetch-site'] = opts.site
  const query = new URLSearchParams({ kind, name })
  const res = await app.request(`/api/attachments/${dataset}/${id}?${query}`, { method: 'POST', headers, body })
  // biome-ignore lint/suspicious/noExplicitAny: response bodies are asserted structurally
  return { status: res.status, body: (await res.json()) as Record<string, any> }
}

const request = (method: string, path: string, cookie = editor) =>
  app.request(path, {
    method,
    headers: { host: HOST, cookie, ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) },
    body: method === 'POST' ? '{}' : undefined,
  })

async function list(id = 1, cookie = editor) {
  const res = await request('GET', `/api/attachments/box/${id}`, cookie)
  // biome-ignore lint/suspicious/noExplicitAny: response bodies are asserted structurally
  return { status: res.status, body: (await res.json()) as Record<string, any> }
}

const download = (id: number, cookie = editor) => request('GET', `/api/attachments/file/${id}`, cookie)

async function remove(id: number, cookie = editor) {
  const res = await request('DELETE', `/api/attachments/file/${id}`, cookie)
  // biome-ignore lint/suspicious/noExplicitAny: response bodies are asserted structurally
  return { status: res.status, body: (await res.json()) as Record<string, any> }
}

async function undo(batch: string) {
  const res = await request('POST', `/api/batches/${batch}/undo`)
  // biome-ignore lint/suspicious/noExplicitAny: response bodies are asserted structurally
  return { status: res.status, body: (await res.json()) as Record<string, any> }
}

const listedIds = async () => (await list()).body.attachments.map((a: { id: number }) => a.id)

describe('upload and download', () => {
  test('an editor uploads a pdf: 201, and the list shows it', async () => {
    const res = await upload(PDF)
    expect(res.status).toBe(201)
    expect(res.body).toEqual({
      id: expect.any(Number),
      kind: 'doc',
      name: 'plan.pdf',
      mime: 'application/pdf',
      size: PDF.length,
      revision: { batch_id: expect.any(String) },
    })
    expect((await list()).body.attachments).toEqual([
      {
        id: res.body.id,
        kind: 'doc',
        name: 'plan.pdf',
        mime: 'application/pdf',
        size: PDF.length,
        own: true,
        created_at: expect.any(String),
      },
    ])
  })

  test('another editor sees the file as not their own', async () => {
    await upload(PDF)
    const other = await signIn(app)
    expect((await list(1, other)).body.attachments.map((a: { own: boolean }) => a.own)).toEqual([false])
  })

  test('the download returns the same bytes, as an attachment, nosniff and sandboxed', async () => {
    const { body } = await upload(PDF, { name: 'plan été.pdf' })
    const res = await download(body.id)
    expect(res.status).toBe(200)
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toBe("attachment; filename*=UTF-8''plan%20%C3%A9t%C3%A9.pdf")
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-security-policy')).toBe('sandbox')
  })

  test.each([
    ['x.html', 'x.html.pdf'],
    ['x', 'x.pdf'],
    ['X.PDF', 'X.PDF'],
  ])('a pdf named %s is served as %s', async (name, served) => {
    const { body } = await upload(PDF, { name })
    expect((await download(body.id)).headers.get('content-disposition')).toBe(`attachment; filename*=UTF-8''${served}`)
  })

  test('a jpeg keeps .jpeg and a png named .jpg gains .png', async () => {
    const jpeg = await upload(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { kind: 'photo', name: 'a.jpeg' })
    expect((await download(jpeg.body.id)).headers.get('content-disposition')).toBe("inline; filename*=UTF-8''a.jpeg")
    const png = await upload(PNG, { kind: 'photo', name: 'b.jpg' })
    expect((await download(png.body.id)).headers.get('content-disposition')).toBe("inline; filename*=UTF-8''b.jpg.png")
  })

  test('a png downloads inline', async () => {
    const { body } = await upload(PNG, { kind: 'photo', name: 'p.png' })
    const res = await download(body.id)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('content-disposition')).toBe("inline; filename*=UTF-8''p.png")
  })
})

describe('refusals', () => {
  const stored = () => sqlite.query('SELECT COUNT(*) AS n FROM attachment').get() as { n: number }

  test.each([
    ['an svg', ascii('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
    ['an html file', ascii('<!doctype html><script>alert(1)</script>')],
    ['an exe named x.pdf', new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00])],
    ['an empty body', new Uint8Array()],
  ])('%s is 415 bad_file_type', async (_, bytes) => {
    const res = await upload(bytes, { name: 'x.pdf' })
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 415, code: 'bad_file_type' })
    expect(stored().n).toBe(0)
    expect(readdirSync(filesDir)).toEqual([])
  })

  test("the client's Content-Type is never the stored mime", async () => {
    const res = await upload(PDF, { type: 'application/octet-stream', name: 'x.png' })
    expect(res.body.mime).toBe('application/pdf')
  })

  test('1 MB and one byte is 413', async () => {
    const res = await upload(new Uint8Array([...PDF, ...new Uint8Array(1024 * 1024 + 1 - PDF.length)]))
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 413, code: 'body_too_large' })
    expect(stored().n).toBe(0)
  })

  // Counts what the engine pulls from the body; nothing is pulled until something reads it.
  function streamed(path: string, headers: Record<string, string> = {}) {
    const read = { bytes: 0 }
    const body = new ReadableStream(
      {
        pull(controller) {
          read.bytes += PDF.length
          controller.enqueue(PDF)
          controller.close()
        },
      },
      { highWaterMark: 0 },
    )
    const sent = app.request(path, {
      method: 'POST',
      headers: { host: HOST, cookie: editor, 'content-type': 'application/octet-stream', ...headers },
      body,
    })
    return { read, sent }
  }

  test.each([
    ['an unknown record', '/api/attachments/box/99?kind=doc&name=a.pdf', 404, 'unknown_record'],
    ['a bad kind', '/api/attachments/box/1?kind=nope&name=a.pdf', 400, 'bad_kind'],
    ['a bad name', '/api/attachments/box/1?kind=doc&name=a%0Ab.pdf', 400, 'bad_name'],
    ['a dataset without a writer', '/api/attachments/crate/1?kind=doc&name=a.pdf', 405, 'read_only'],
  ])('a streamed body to %s is refused before a byte is read', async (_, path, status, code) => {
    const { read, sent } = streamed(path)
    const res = await sent
    expect({ status: res.status, code: ((await res.json()) as { code: string }).code }).toEqual({ status, code })
    expect(read.bytes).toBe(0)
  })

  test('a streamed body over the rate limit is refused before a byte is read', async () => {
    for (let n = 0; n < 30; n++) expect((await upload(PDF)).status).toBe(201)
    const { read, sent } = streamed('/api/attachments/box/1?kind=doc&name=a.pdf')
    expect((await sent).status).toBe(429)
    expect(read.bytes).toBe(0)
  })

  test.each([
    ['without a Content-Length', {}],
    ['with Transfer-Encoding', { 'content-length': String(PDF.length), 'transfer-encoding': 'chunked' }],
  ])('an upload %s is 411 length_required, with nothing read', async (_, headers) => {
    const { read, sent } = streamed('/api/attachments/box/1?kind=doc&name=a.pdf', headers)
    const res = await sent
    expect({ status: res.status, code: ((await res.json()) as { code: string }).code }).toEqual({
      status: 411,
      code: 'length_required',
    })
    expect(read.bytes).toBe(0)
    expect(stored().n).toBe(0)
  })

  test('exactly 1 MB is taken', async () => {
    const res = await upload(new Uint8Array([...PDF, ...new Uint8Array(1024 * 1024 - PDF.length)]))
    expect(res.status).toBe(201)
  })

  test('an unknown kind is 400 bad_kind', async () => {
    const res = await upload(PDF, { kind: 'nope' })
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 400, code: 'bad_kind' })
  })

  test.each([
    ['a newline', 'a\nb.pdf'],
    ['a NUL', 'a\u0000.pdf'],
    ['a right-to-left override', 'cod\u202egnp.pdf'],
    ['a zero-width space', 'a\u200bb.pdf'],
    ['over 200 characters', `${'a'.repeat(197)}.pdf`],
    ['nothing', ''],
  ])('a name with %s is 400 bad_name', async (_, name) => {
    const res = await upload(PDF, { name })
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 400, code: 'bad_name' })
  })

  test('a name of 200 characters is taken', async () => {
    expect((await upload(PDF, { name: `${'a'.repeat(196)}.pdf` })).status).toBe(201)
  })

  test('multipart/form-data is 415 bad_content_type', async () => {
    const res = await upload(PDF, { type: 'multipart/form-data; boundary=x' })
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 415, code: 'bad_content_type' })
  })

  test('a cross-site upload is 403 forbidden_site', async () => {
    const res = await upload(PDF, { site: 'cross-site' })
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 403, code: 'forbidden_site' })
    expect(stored().n).toBe(0)
  })

  test('an upload to an unknown dataset or record is 404', async () => {
    expect((await upload(PDF, { dataset: 'nope' })).status).toBe(404)
    expect((await upload(PDF, { id: 99 })).body.code).toBe('unknown_record')
  })

  test('the 31st upload in a minute by one account is 429', async () => {
    for (let n = 0; n < 30; n++) expect((await upload(PDF)).status).toBe(201)
    const res = await upload(PDF)
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 429, code: 'rate_limited' })
    expect((await upload(PDF, { cookie: await signIn(app) })).status).toBe(201)
  })

  test("another record's attachment id and an unknown id answer the same 404", async () => {
    const { body } = await upload(PDF, { id: 1 })
    const owner = await signIn(app, 'owner', { dataset: 'box', id: 2 })
    const other = await download(body.id, owner)
    const unknown = await download(999, owner)
    expect(other.status).toBe(404)
    expect(await other.json()).toEqual(await unknown.json())
    expect((await remove(body.id, owner)).status).toBe(404)
    expect((await list(1, owner)).status).toBe(404)
  })

  test('an owner reads its own record’s files but uploads only with owner_writable', async () => {
    const { body } = await upload(PDF, { id: 2 })
    const owner = await signIn(app, 'owner', { dataset: 'box', id: 2 })
    expect((await download(body.id, owner)).headers.get('cache-control')).toBe('no-store')
    expect((await upload(PDF, { id: 2, cookie: owner })).status).toBe(403)
    expect((await remove(body.id, owner)).status).toBe(403)
  })
})

describe('owner and read-only refusals', () => {
  test("an owner deletes its own upload but not another account's, nor undoes that account's batch", async () => {
    const owner = await signIn(app, 'owner', { dataset: 'bin', id: 1 })
    const editors = await upload(PDF, { dataset: 'bin' })
    const own = await upload(PDF, { dataset: 'bin', cookie: owner })
    expect(own.status).toBe(201)
    const refused = await remove(editors.body.id, owner)
    expect({ status: refused.status, code: refused.body.code }).toEqual({ status: 403, code: 'forbidden' })
    expect((await request('POST', `/api/batches/${editors.body.revision.batch_id}/undo`, owner)).status).toBe(403)
    expect((await remove(own.body.id, owner)).status).toBe(200)
    const files = await request('GET', '/api/attachments/bin/1')
    expect(((await files.json()) as { attachments: { id: number }[] }).attachments.map((a) => a.id)).toEqual([
      editors.body.id,
    ])
  })

  test('an owner on a dataset without owner_visible gets 404 on list, upload and download, and no attachments in /schema', async () => {
    const { body } = await upload(PDF, { dataset: 'shelf' })
    const owner = await signIn(app, 'owner', { dataset: 'shelf', id: 1 })
    expect((await request('GET', '/api/rows/shelf', owner)).status).toBe(200)
    expect((await request('GET', '/api/attachments/shelf/1', owner)).status).toBe(404)
    expect((await upload(PDF, { dataset: 'shelf', cookie: owner })).status).toBe(404)
    const download = await request('GET', `/api/attachments/file/${body.id}`, owner)
    expect({ status: download.status, code: ((await download.json()) as { code: string }).code }).toEqual({
      status: 404,
      code: 'unknown_attachment',
    })
    const schema = (await (await request('GET', '/api/schema', owner)).json()) as {
      sources: Record<string, { attachments?: unknown }>
    }
    expect(schema.sources.shelf).toBeDefined()
    expect(schema.sources.shelf?.attachments).toBeUndefined()
  })

  test('a dataset without a writer lists its files, and refuses upload and delete with 405 read_only', async () => {
    sqlite.run(
      `INSERT INTO attachment (entity, record_id, kind, name, mime, size, sha256, uploaded_by)
       VALUES ('crate', 1, 'doc', 'a.pdf', 'application/pdf', 1, 'x', 1)`,
    )
    const listed = await request('GET', '/api/attachments/crate/1')
    expect(((await listed.json()) as { attachments: unknown[] }).attachments).toHaveLength(1)
    const uploaded = await upload(PDF, { dataset: 'crate' })
    expect({ status: uploaded.status, code: uploaded.body.code }).toEqual({ status: 405, code: 'read_only' })
    const removed = await remove(1)
    expect({ status: removed.status, code: removed.body.code }).toEqual({ status: 405, code: 'read_only' })
  })
})

describe('delete and undo', () => {
  test('a deleted file leaves the list and its download answers 404', async () => {
    const { body } = await upload(PDF)
    const res = await remove(body.id)
    expect(res.body).toEqual({ id: body.id, revision: { batch_id: expect.any(String) } })
    expect(await listedIds()).toEqual([])
    expect((await download(body.id)).status).toBe(404)
  })

  test("undoing the delete's batch brings it back, and redo removes it again", async () => {
    const { body } = await upload(PDF)
    const deleted = await remove(body.id)
    const undone = await undo(deleted.body.revision.batch_id)
    expect(undone.status).toBe(200)
    expect(undone.body.affected).toEqual([{ dataset: 'box', id: 1 }])
    expect(await listedIds()).toEqual([body.id])
    expect((await download(body.id)).status).toBe(200)
    expect((await undo(undone.body.batch_id)).status).toBe(200)
    expect(await listedIds()).toEqual([])
  })

  test("undoing the upload's batch removes it", async () => {
    const { body } = await upload(PDF)
    expect((await undo(body.revision.batch_id)).status).toBe(200)
    expect(await listedIds()).toEqual([])
  })

  test('an undo after the file was deleted or restored since is 409 changed_since', async () => {
    const { body } = await upload(PDF)
    await remove(body.id)
    const res = await undo(body.revision.batch_id)
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 409, code: 'changed_since' })
    expect(await listedIds()).toEqual([])
  })

  test("another account's attachment batch is refused", async () => {
    const { body } = await upload(PDF, { cookie: await signIn(app) })
    expect((await undo(body.revision.batch_id)).status).toBe(403)
  })
})

describe('storage', () => {
  test('the file sits at <filesDir>/<sha256>, and the same bytes twice store one file', async () => {
    await upload(PDF)
    await upload(PDF, { name: 'again.pdf' })
    expect(readdirSync(filesDir)).toEqual([sha256(PDF)])
    expect(new Uint8Array(readFileSync(join(filesDir, sha256(PDF))))).toEqual(PDF)
    expect(await listedIds()).toHaveLength(2)
  })

  test('a jpeg is stored stripped, hashed and sized as stored', async () => {
    const comment = [0xff, 0xfe, 0, 6, ...ascii('home')]
    const { status, body } = await upload(new Uint8Array([0xff, 0xd8, ...comment, 0xff, 0xd9, 0x01]), {
      kind: 'photo',
      name: 'a.jpg',
    })
    const stored = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
    expect({ status, size: body.size }).toEqual({ status: 201, size: stored.length })
    expect(readdirSync(filesDir)).toEqual([sha256(stored)])
    expect(new Uint8Array(await (await download(body.id)).arrayBuffer())).toEqual(stored)
  })

  // The doubled SOI read as a segment would take FF E1 as its length and span the GPS APP1 whole.
  const gpsApp1 = [...ascii('Exif\0\0GPS'), ...new Uint8Array(0xffdf - 2 - 9)]
  test.each([
    ['a truncated jpeg', new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x40, ...ascii('Exif')])],
    [
      'a doubled SOI before a GPS APP1',
      new Uint8Array([0xff, 0xd8, 0xff, 0xd8, 0xff, 0xe1, 0xff, 0xdf, ...gpsApp1, 0xff, 0xd9]),
    ],
  ])('%s is 415 bad_file_type, with nothing stored', async (_, jpeg) => {
    const res = await upload(jpeg, { kind: 'photo', name: 'a.jpg' })
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 415, code: 'bad_file_type' })
    expect(readdirSync(filesDir)).toEqual([])
    expect(await listedIds()).toEqual([])
  })

  // Serves on a free port until it listens, then stops it, so no server outlives the test.
  async function serveWith(files: string): Promise<void> {
    const dir = mkdtempSync(join(tmpdir(), 'wt-serve-files-'))
    const secret = join(dir, 'secret')
    writeFileSync(secret, 'x'.repeat(32), { mode: 0o600 })
    const probe = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => new Response() })
    const port = String(probe.port)
    probe.stop(true)
    const serve = join(import.meta.dir, '..', 'src', 'serve.ts')
    const domainFile = join(import.meta.dir, 'fixtures', 'serve-domain.ts')
    const run = Bun.spawn(
      ['bun', serve, '--domain', domainFile, '--db', join(dir, 'db'), '--fresh', '--port', port].concat([
        '--link-secret-file',
        secret,
        '--files-dir',
        files,
      ]),
      { stdout: 'pipe', stderr: 'pipe' },
    )
    try {
      const reader = run.stdout.getReader()
      let out = ''
      while (!out.includes('engine listening')) {
        const { done, value } = await reader.read()
        if (done) throw new Error(`the engine did not start: ${out}`)
        out += new TextDecoder().decode(value)
      }
    } finally {
      run.kill()
      await run.exited
    }
  }

  test('serve.ts --files-dir creates the directory with mode 0700', async () => {
    const files = join(mkdtempSync(join(tmpdir(), 'wt-files-parent-')), 'files')
    await serveWith(files)
    expect(statSync(files).mode & 0o777).toBe(0o700)
  }, 20_000)

  test('serve.ts --files-dir narrows an existing 0755 directory to 0700', async () => {
    const files = join(mkdtempSync(join(tmpdir(), 'wt-files-parent-')), 'files')
    mkdirSync(files, { mode: 0o755 })
    chmodSync(files, 0o755)
    await serveWith(files)
    expect(statSync(files).mode & 0o777).toBe(0o700)
  }, 20_000)
})

const withBox = (attachments: unknown): Domain => ({
  ...domain,
  datasets: [{ ...(domain.datasets[0] as DatasetDecl), attachments } as DatasetDecl],
})

describe('start and validation', () => {
  test('createEngine on a domain with attachments and no filesDir throws', () => {
    expect(() =>
      createEngine(freshDb(), domain, { port: 4310, linkSecret: TEST_LINK_SECRET, clientIp: () => '127.0.0.1' }),
    ).toThrow(/files/)
  })

  test.each([
    ['empty kinds', { kinds: {} }],
    ['a kind that is no identifier', { kinds: { 'Big doc': 'Doc' } }],
    ['max_mb 0', { kinds: { doc: 'Doc' }, max_mb: 0 }],
    ['max_mb 51', { kinds: { doc: 'Doc' }, max_mb: 51 }],
    ['max_mb 1.5', { kinds: { doc: 'Doc' }, max_mb: 1.5 }],
    ['owner_writable without owner_visible', { kinds: { doc: 'Doc' }, owner_writable: true }],
  ])('validation refuses %s', (_, attachments) => {
    expect(() => validateDomain(withBox(attachments))).toThrow(/attachments/)
  })

  test('validation refuses attachments on a query and a dataset named file', () => {
    const query = {
      kind: 'query',
      name: 'q',
      label: 'Q',
      title: 'id',
      sql: 'SELECT 1 AS id',
      columns: { id: { type: 'integer', label: 'Id' } },
    }
    const onQuery = { ...domain, queries: [{ ...query, attachments: { kinds: { doc: 'Doc' } } }] } as unknown as Domain
    expect(() => validateDomain(onQuery)).toThrow(/attachments/)
    const file = { ...(domain.datasets[0] as DatasetDecl), name: 'file' }
    expect(() => validateDomain({ ...domain, datasets: [file] })).toThrow(/file/)
  })

  test('/schema serves attachments per dataset that declares them', async () => {
    const res = await request('GET', '/api/schema')
    const { sources } = (await res.json()) as { sources: Record<string, { attachments?: unknown }> }
    expect(sources.box?.attachments).toEqual({ kinds: { doc: 'Doc', photo: 'Photo' }, max_mb: 1, owner_visible: true })
  })
})
