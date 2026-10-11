import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type Domain, defineDataset, type HookResult, type Mail, migrate, seedDomain } from '../src'
import { send } from './fixture'
import { signIn, testEngine } from './sign-in'

type Request = ReturnType<typeof send>

const sent: Mail[] = []
const outbox = mkdtempSync(join(tmpdir(), 'wt-hook-mails-'))
// Sign-in mails go where the sign-in helper reads them; every other mail is recorded.
const mailer = {
  send: async (mail: Mail) => {
    if (mail.subject === 'Inloggen')
      writeFileSync(join(outbox, `${crypto.randomUUID()}.txt`), `To: ${mail.to}\n\n${mail.text}\n`)
    else sent.push(mail)
  },
}

// What the hook on `b` answers; each test sets it.
let onB: () => HookResult = () => ({})

const parcel = defineDataset({
  name: 'parcel',
  label: 'Parcels',
  title: 'label',
  custom: false,
  owners: { owner: 'id' },
  record_link: { email: 'email' },
  columns: {
    label: { type: 'text', label: 'Label' },
    email: { type: 'text', label: 'Email', nullable: true },
    state: { type: 'text', label: 'State', default: 'a', options: { a: 'A', b: 'B' } },
  },
  lifecycle: {
    column: 'state',
    transitions: [{ from: ['a'], to: 'b', roles: ['editor'] }],
    hooks: { b: () => onB() },
  },
})

const toB_ = {
  column: 'state',
  transitions: [{ from: ['a'], to: 'b', roles: ['editor' as const] }],
  hooks: { b: () => onB() },
}
const stateColumns = {
  label: { type: 'text' as const, label: 'Label' },
  state: { type: 'text' as const, label: 'State', default: 'a', options: { a: 'A', b: 'B' } },
}

// A record link whose owner is a parcel, left empty on the seeded letter.
const letter = defineDataset({
  name: 'letter',
  label: 'Letters',
  title: 'label',
  custom: false,
  owners: { owner: 'parcel_id' },
  record_link: {},
  columns: { ...stateColumns, parcel_id: { type: 'integer', label: 'Parcel', relation: 'parcel', nullable: true } },
  lifecycle: toB_,
})

// No record link declared.
const plain = defineDataset({
  name: 'plain',
  label: 'Plain',
  title: 'label',
  custom: false,
  columns: stateColumns,
  lifecycle: toB_,
})

const domain: Domain = {
  datasets: [parcel, letter, plain],
  queries: [],
  seed: (insert) => {
    insert('parcel', [{ label: 'Doos', email: 'ontvanger@example.test', state: 'a' }])
    insert('letter', [{ label: 'Brief', parcel_id: null, state: 'a' }])
    insert('plain', [{ label: 'Gewoon', state: 'a' }])
  },
  views: [],
  writers: {
    parcel: { create: (v) => v, update: (v) => v },
    letter: { create: (v) => v, update: (v) => v },
    plain: { create: (v) => v, update: (v) => v },
  },
}

let sqlite: Database
let editor: Request

beforeEach(async () => {
  sent.length = 0
  sqlite = new Database(':memory:')
  migrate(sqlite, domain)
  seedDomain(sqlite, domain)
  const app = testEngine(sqlite, domain, { mailer, outbox })
  editor = send(app, await signIn(app))
})

const toB = (dataset = 'parcel') => editor('PATCH', `/api/rows/${dataset}/1`, { body: JSON.stringify({ state: 'b' }) })
const stateNow = () => (sqlite.query('SELECT state FROM parcel WHERE id = 1').get() as { state: string }).state
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('a hook mail with the record link, and several mails per hook', () => {
  test('two mails go out after commit; the record link only to the record’s own address', async () => {
    onB = () => ({
      record_link: true,
      mail: (_token, links) => [
        { to: 'ontvanger@example.test', subject: 'Onderweg', text: `Volg je pakket: ${links.record}` },
        { to: 'balie@example.test', subject: 'Kopie', text: 'Pakket Doos is onderweg.' },
      ],
    })
    const res = await toB()
    expect(res.status).toBe(200)
    await settle()
    expect(sent.map((mail) => mail.to)).toEqual(['ontvanger@example.test', 'balie@example.test'])
    expect(sent[0]?.text).toMatch(/#\/link\/parcel\.1\./)
    expect(sent[1]?.text).not.toContain('#/link/')
  })

  test('without record_link the hook gets no record link', async () => {
    let seen: string | null = 'unset'
    onB = () => ({
      mail: (_token, links) => {
        seen = links.record
        return null
      },
    })
    expect((await toB()).status).toBe(200)
    expect(seen).toBeNull()
  })

  test('a hook that still returns one mail from the token link alone keeps working', async () => {
    onB = () => ({ mail: (link) => ({ to: 'balie@example.test', subject: 'Status', text: `link: ${link}` }) })
    expect((await toB()).status).toBe(200)
    await settle()
    expect(sent).toEqual([{ to: 'balie@example.test', subject: 'Status', text: 'link: null' }])
  })

  test.each([
    [
      'eleven mails',
      () => Array.from({ length: 11 }, (_, n) => ({ to: `p${n}@example.test`, subject: 's', text: 't' })),
    ],
    [
      'the record link in two mails',
      (links: { record: string | null }) => [
        { to: 'ontvanger@example.test', subject: 'a', text: `${links.record}` },
        { to: 'ontvanger@example.test', subject: 'b', text: `${links.record}` },
      ],
    ],
    [
      'the record link to two recipients',
      (links: { record: string | null }) => [
        { to: 'ontvanger@example.test, balie@example.test', subject: 'a', text: `${links.record}` },
      ],
    ],
    [
      'the record link to another address than the record’s own',
      (links: { record: string | null }) => [{ to: 'balie@example.test', subject: 'a', text: `${links.record}` }],
    ],
  ])('%s fails the write, writes nothing and sends nothing', async (_, mails) => {
    onB = () => ({ record_link: true, mail: (_token, links) => mails(links) as Mail[] })
    const res = await toB()
    expect(res.status).toBe(500)
    expect(res.body).toMatchObject({
      code: 'hook_mail_refused',
      message: expect.stringContaining('parcel hook on "b"'),
    })
    await settle()
    expect(stateNow()).toBe('a')
    expect(sent).toEqual([])
  })
})

type Links = { token: string | null; record: string | null }
const TOKEN = { to: ['a'], days: 7 }
const secretOf = (link: string | null) => (link ?? '').split(/#\/(?:link|act)\//)[1] ?? ''
const macOf = (link: string | null) => secretOf(link).split('.').pop() ?? ''

// The write fails as one refusal naming the dataset and state, never the link; nothing is written or sent.
async function refused(mails: (links: Links) => unknown, dataset = 'parcel') {
  let seen: Links = { token: null, record: null }
  onB = () => ({
    record_link: true,
    token: TOKEN,
    mail: (_token, links) => {
      seen = links
      return mails(links) as Mail[]
    },
  })
  const res = await toB(dataset)
  await settle()
  expect(res.status).toBe(500)
  expect(res.body.code).toBe('hook_mail_refused')
  expect(res.body.message).toContain(`${dataset} hook on "b"`)
  for (const link of [seen.token, seen.record]) if (link) expect(JSON.stringify(res.body)).not.toContain(secretOf(link))
  expect(stateNow()).toBe('a')
  expect(sent).toEqual([])
}

describe('a hook mail cannot slip a link past the rules', () => {
  test.each([
    [
      'the record link URL-encoded inside another URL, to another address',
      (l: Links) => [
        {
          to: 'vreemde@example.test',
          subject: 's',
          text: `https://track.example/?l=${encodeURIComponent(l.record ?? '')}`,
        },
      ],
    ],
    [
      'the bare record token, to another address',
      (l: Links) => [{ to: 'vreemde@example.test', subject: 's', text: `code ${secretOf(l.record)}` }],
    ],
    [
      'the record token’s secret alone, in a subject',
      (l: Links) => [{ to: 'vreemde@example.test', subject: macOf(l.record), text: 't' }],
    ],
    [
      'the action-token link in two mails',
      (l: Links) => [
        { to: 'ontvanger@example.test', subject: 'a', text: `${l.token}` },
        { to: 'balie@example.test', subject: 'b', text: `code ${secretOf(l.token)}` },
      ],
    ],
    [
      'the action-token link to two recipients',
      (l: Links) => [{ to: 'ontvanger@example.test, balie@example.test', subject: 'a', text: `${l.token}` }],
    ],
    [
      'the action-token link to two addresses split by a space',
      (l: Links) => [{ to: 'ontvanger@example.test balie@example.test', subject: 'a', text: `${l.token}` }],
    ],
    [
      'the encoded action token to a display-name address',
      (l: Links) => [{ to: 'Balie <balie@example.test>', subject: 'a', text: encodeURIComponent(l.token ?? '') }],
    ],
  ])('%s fails the write', async (_, mails) => {
    await refused(mails)
  })

  test.each([
    ['a CRLF in to', [{ to: 'ontvanger@example.test\r\nBcc: spion@example.test', subject: 's', text: 'hallo' }]],
    ['a line feed in subject', [{ to: 'balie@example.test', subject: 's\nBcc: spion@example.test', text: 'hallo' }]],
    ['a null to', [{ to: null, subject: 's', text: 'hallo' }]],
    ['an empty to', [{ to: '  ', subject: 's', text: 'hallo' }]],
  ])('%s fails the write, even without a link', async (_, mails) => {
    await refused(() => mails)
  })

  test('the record’s own address matches trimmed and in any case', async () => {
    onB = () => ({
      record_link: true,
      mail: (_token, links) => ({ to: ' Ontvanger@Example.TEST ', subject: 'Onderweg', text: `${links.record}` }),
    })
    expect((await toB()).status).toBe(200)
    await settle()
    expect(sent).toHaveLength(1)
  })
})

describe('what record link a hook gets', () => {
  const recordOf = async (dataset: string) => {
    let seen: string | null = 'unset'
    onB = () => ({
      record_link: true,
      mail: (_token, links) => {
        seen = links.record
        return null
      },
    })
    expect((await toB(dataset)).status).toBe(200)
    return seen
  }

  test('null on a dataset that declares no record_link', async () => {
    expect(await recordOf('plain')).toBeNull()
  })

  test('null on a record with no owner, whose link would never open', async () => {
    expect(await recordOf('letter')).toBeNull()
  })

  // The branch for a missing secret is a guard only: such an engine never starts, so no hook meets it.
  test('an engine without a link secret refuses to start on a dataset declaring record_link', () => {
    expect(() => testEngine(sqlite, domain, { mailer, outbox, linkSecret: undefined })).toThrow(/link secret/)
  })
})
