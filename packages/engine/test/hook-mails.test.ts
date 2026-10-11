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

const domain: Domain = {
  datasets: [parcel],
  queries: [],
  seed: (insert) => insert('parcel', [{ label: 'Doos', email: 'ontvanger@example.test', state: 'a' }]),
  views: [],
  writers: { parcel: { create: (v) => v, update: (v) => v } },
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

const toB = () => editor('PATCH', '/api/rows/parcel/1', { body: JSON.stringify({ state: 'b' }) })
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
    await settle()
    expect(stateNow()).toBe('a')
    expect(sent).toEqual([])
  })
})
