import { describe, expect, spyOn, test } from 'bun:test'
import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAccount } from '../src'
import { type Mail, outboxMailer } from '../src/mailer'
import { domain, freshDb } from './fixture'
import { linkFor, testEngine } from './sign-in'

const outboxDir = () => mkdtempSync(join(tmpdir(), 'wt-mailer-'))

describe('the Mailer', () => {
  test('sign-in mails through the Mailer', async () => {
    const sqlite = freshDb()
    createAccount(sqlite, domain, 'ed@example.test', 'editor', null)
    const sent: Mail[] = []
    const app = testEngine(sqlite, domain, { mailer: { send: async (mail) => void sent.push(mail) } })
    const res = await app.request('/api/auth/request', {
      method: 'POST',
      headers: { host: '127.0.0.1:4310', 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ed@example.test' }),
    })
    expect(res.status).toBe(200)
    await Bun.sleep(20)
    expect(sent).toHaveLength(1)
    expect(sent[0].to).toBe('ed@example.test')
    expect(sent[0].text).toContain('#/auth/')
  })

  test('the outbox mailer writes the same file as before', async () => {
    const dir = outboxDir()
    const log = spyOn(console, 'log').mockImplementation(() => {})
    await outboxMailer(dir).send({ to: 'a@example.test', subject: 's', text: 'http://x/#/auth/abc' })
    log.mockRestore()
    const [name] = readdirSync(dir)
    expect(readFileSync(join(dir, name), 'utf8')).toBe('To: a@example.test\n\nhttp://x/#/auth/abc\n')
    expect(statSync(join(dir, name)).mode & 0o777).toBe(0o600)
    expect(await linkFor(dir, 'a@example.test')).toBe('abc')
  })
})
