import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type Mail, migrate, seedDomain } from '@worktable/engine'
import { createService } from '@worktable/engine/src/auth'
import { recordLinkFor } from '@worktable/engine/src/record-link'
import { signIn, TEST_LINK_SECRET, testEngine } from '@worktable/engine/test/sign-in'
import theatre from '../src'

type Body = Record<string, unknown>
type Request = (method: string, path: string, body?: unknown) => Promise<{ status: number; body: Body }>

// Bram De Wilde (persoon 2) has an email, Noor Claes (persoon 3) none; activiteit 5 holds no Toewijzing; Rol 1 is Speler.
const BRAM = 2
const NOOR = 3

let sqlite: Database
let app: ReturnType<typeof testEngine>
let editor: Request
let anyone: Request
let mails: Mail[]

function requester(cookie?: string): Request {
  return async (method, path, body) => {
    const headers: Record<string, string> = { host: '127.0.0.1:4310', 'content-type': 'application/json' }
    if (cookie) headers.cookie = cookie
    const res = await app.request(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: res.status, body: (await res.json()) as Body }
  }
}

// Sign-in links go to the outbox signIn reads; every other mail is kept here.
function recordingMailer(outbox: string) {
  return {
    send: async (mail: Mail) => {
      if (mail.subject === 'Inloggen')
        writeFileSync(join(outbox, `${crypto.randomUUID()}.txt`), `To: ${mail.to}\n\n${mail.text}\n`)
      else mails.push(mail)
    },
  }
}

beforeEach(async () => {
  mails = []
  sqlite = new Database(':memory:')
  migrate(sqlite, theatre)
  seedDomain(sqlite, theatre)
  const outbox = mkdtempSync(join(tmpdir(), 'wt-invite-'))
  app = testEngine(sqlite, theatre, { outbox, mailer: recordingMailer(outbox) })
  editor = requester(await signIn(app, 'editor'))
  anyone = requester()
})

const post = (body: Body) => editor('POST', '/api/rows/toewijzing', { activiteit_id: 5, rol_id: 1, ...body })
const patch = (id: number, body: Body) => editor('PATCH', `/api/rows/toewijzing/${id}`, body)
const tokens = () => sqlite.query('SELECT * FROM action_token').all()
const stateOf = (id: number) => (sqlite.query('SELECT state FROM toewijzing WHERE id = ?').get(id) as Body).state
const tokenOf = (mail: Mail) => mail.text.match(/#\/act\/([\w-]+)/)?.[1] as string

async function invited(persoon_id: number): Promise<{ id: number; token: string }> {
  const res = await post({ persoon_id, state: 'uitgenodigd' })
  expect(res.status).toBe(201)
  return { id: res.body.id as number, token: tokenOf(mails.at(-1) as Mail) }
}

describe('the invite', () => {
  test('a create as uitgenodigd mails the person one #/act/ link', async () => {
    const res = await post({ persoon_id: BRAM, state: 'uitgenodigd' })
    expect(res.status).toBe(201)
    expect(res.body.notices).toEqual([])
    expect(mails).toHaveLength(1)
    expect(mails[0]?.to).toBe('bram@voorbeeld.test')
    expect(mails[0]?.text).toContain('http://127.0.0.1:5173/#/act/')
    expect(tokens()).toHaveLength(1)
  })

  test('a move to uitgenodigd mails the invite; a direct bevestigd mails nothing', async () => {
    const pencilled = await post({ persoon_id: BRAM, state: 'voorlopig' })
    const direct = await editor('POST', '/api/rows/toewijzing', {
      activiteit_id: 6,
      persoon_id: BRAM,
      state: 'bevestigd',
    })
    expect([pencilled.status, direct.status]).toEqual([201, 201])
    expect(mails).toEqual([])

    const moved = await patch(pencilled.body.id as number, { state: 'uitgenodigd', expect: { state: 'voorlopig' } })
    expect(moved.status).toBe(200)
    expect(mails.map((mail) => mail.to)).toEqual(['bram@voorbeeld.test'])
    expect(tokenOf(mails[0] as Mail)).toBeTruthy()
  })

  test('without an email: no mail, no token, and the reply says so in Dutch', async () => {
    const person = await post({ persoon_id: NOOR, state: 'uitgenodigd' })
    const named = await post({ naam: 'Gastzanger', rol_id: null, state: 'uitgenodigd' })
    expect(person.body.notices).toEqual(['Geen uitnodiging: Noor Claes heeft geen e-mailadres.'])
    expect(named.body.notices).toEqual(['Geen uitnodiging: Gastzanger heeft geen e-mailadres.'])
    expect(mails).toEqual([])
    expect(tokens()).toEqual([])
  })
})

describe('another person on an invited row', () => {
  test('pencils the row back in as voorlopig and mails no one; the move to uitgenodigd then invites the new person', async () => {
    const { id, token } = await invited(BRAM)
    sqlite.run("UPDATE persoon SET email = 'noor@voorbeeld.test' WHERE id = ?", [NOOR])
    mails = []

    const swapped = await patch(id, { persoon_id: NOOR })
    expect(swapped.status).toBe(200)
    expect(stateOf(id)).toBe('voorlopig')
    expect(mails).toEqual([])
    const old = await anyone('POST', '/api/act', { token, to: 'bevestigd' })
    expect({ status: old.status, code: old.body.code }).toEqual({ status: 401, code: 'bad_token' })

    expect((await patch(id, { state: 'uitgenodigd', expect: { state: 'voorlopig' } })).status).toBe(200)
    expect(mails.map((mail) => mail.to)).toEqual(['noor@voorbeeld.test'])
  })

  test('a name in place of the person pencils it in too', async () => {
    const { id } = await invited(BRAM)
    expect((await patch(id, { naam: 'Gastzanger' })).status).toBe(200)
    expect(stateOf(id)).toBe('voorlopig')
  })
})

describe('the confirm page routes', () => {
  test('/act/view carries only the projection: the activity, the role and the state', async () => {
    const { token } = await invited(BRAM)
    const activity = sqlite.query('SELECT omschrijving FROM activiteit WHERE id = 5').get() as Body
    const res = await anyone('POST', '/api/act/view', { token })
    expect(res.status).toBe(200)
    expect(res.body.projection).toEqual({
      activiteit_id: activity.omschrijving,
      rol_id: 'Speler',
      state: 'Uitgenodigd',
    })
    expect(res.body.to).toEqual([
      { value: 'bevestigd', label: 'Bevestigen' },
      { value: 'geweigerd', label: 'Weigeren' },
    ])
  })

  test('confirm and decline move the rows, and the planner reads geweigerd', async () => {
    const yes = await invited(BRAM)
    const no = await editor('POST', '/api/rows/toewijzing', {
      activiteit_id: 6,
      persoon_id: BRAM,
      state: 'uitgenodigd',
    })
    const noToken = tokenOf(mails.at(-1) as Mail)

    expect((await anyone('POST', '/api/act', { token: yes.token, to: 'bevestigd' })).status).toBe(200)
    expect((await anyone('POST', '/api/act', { token: noToken, to: 'geweigerd' })).status).toBe(200)
    expect(stateOf(yes.id)).toBe('bevestigd')

    const read = await editor(
      'GET',
      `/api/rows/toewijzing?filter=${encodeURIComponent(JSON.stringify({ id: no.body.id }))}`,
    )
    expect((read.body.rows as Body[])[0]?.state).toBe('geweigerd')

    const again = await anyone('POST', '/api/act', { token: yes.token, to: 'geweigerd' })
    expect({ status: again.status, code: again.body.code }).toEqual({ status: 401, code: 'bad_token' })
  })
})

describe('the address a link is mailed to (B1)', () => {
  const bram = () => sqlite.query('SELECT * FROM persoon WHERE id = ?').get(BRAM)
  const asLink = (token: string) =>
    app.request('/api/auth/me', {
      headers: { host: '127.0.0.1:4310', authorization: `RecordLink ${token}` },
    })
  const bearer =
    (token: string): Request =>
    async (method, path, body) => {
      const res = await app.request(path, {
        method,
        headers: { host: '127.0.0.1:4310', 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      return { status: res.status, body: (await res.json()) as Body }
    }

  test('an editor may not change it: 403, the row unchanged', async () => {
    const before = bram()
    const res = await editor('PATCH', `/api/rows/persoon/${BRAM}`, { email: 'attacker@evil.test' })
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 403, code: 'forbidden' })
    expect(bram()).toEqual(before)
  })

  test('an editor service account may not change it, nor an administrator service account: 403', async () => {
    const before = bram()
    for (const role of ['editor', 'administrator'] as const) {
      const service = bearer(createService(sqlite, `bot-${role}`, role))
      const res = await service('PATCH', `/api/rows/persoon/${BRAM}`, { email: 'attacker@evil.test' })
      expect({ status: res.status, code: res.body.code }).toEqual({ status: 403, code: 'forbidden' })
    }
    expect(bram()).toEqual(before)
  })

  test('an editor may still echo it unchanged and edit the other columns', async () => {
    const res = await editor('PATCH', `/api/rows/persoon/${BRAM}`, { email: 'bram@voorbeeld.test', telefoon: '0470' })
    expect(res.status).toBe(200)
  })

  test("an administrator's change kills the old link and the outstanding invite", async () => {
    const { token } = await invited(BRAM)
    const oldLink = recordLinkFor(sqlite, TEST_LINK_SECRET, 'persoon', BRAM)
    expect((await asLink(oldLink)).status).toBe(200)
    const admin = requester(await signIn(app, 'administrator'))

    const res = await admin('PATCH', `/api/rows/persoon/${BRAM}`, { email: 'bram.nieuw@voorbeeld.test' })
    expect(res.status).toBe(200)
    expect((await asLink(oldLink)).status).toBe(401)
    const act = await anyone('POST', '/api/act', { token, to: 'bevestigd' })
    expect({ status: act.status, code: act.body.code }).toEqual({ status: 401, code: 'bad_token' })
    expect((await asLink(recordLinkFor(sqlite, TEST_LINK_SECRET, 'persoon', BRAM))).status).toBe(200)
  })
})
