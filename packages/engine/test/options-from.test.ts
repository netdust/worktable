import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import {
  type ActionDecl,
  type Domain,
  DomainError,
  migrate,
  type OptionsFrom,
  seedDomain,
  validateDomain,
} from '../src'
import { send } from './fixture'
import domain, { PICKS } from './fixtures/options-domain'
import { signIn, testEngine } from './sign-in'

type Request = ReturnType<typeof send>

const withColumnFrom = (from: OptionsFrom): Domain => ({
  ...domain,
  datasets: domain.datasets.map((d) =>
    d.name === 'slot'
      ? { ...d, columns: { ...d.columns, member_id: { ...d.columns.member_id, options_from: from } } }
      : d,
  ),
})

const withInputFrom = (from: OptionsFrom): Domain => ({
  ...domain,
  actions: {
    fill_slot: {
      ...(domain.actions?.fill_slot as ActionDecl),
      input: { member_id: { relation: 'member', label: 'Member', options_from: from } },
    },
  },
})

function refusal(d: Domain): DomainError {
  try {
    validateDomain(d)
  } catch (error) {
    if (error instanceof DomainError) return error
    throw error
  }
  throw new Error('validateDomain accepted the domain')
}

describe('validateDomain refuses a bad options_from', () => {
  test('accepts the fixture', () => expect(() => validateDomain(domain)).not.toThrow())

  test('refuses an unknown source', () => {
    expect(refusal(withColumnFrom({ ...PICKS, source: 'nowhere' })).message).toContain('nowhere')
    expect(refusal(withInputFrom({ ...PICKS, source: 'nowhere' })).message).toContain('nowhere')
  })

  test('refuses a dataset as the source', () => {
    expect(refusal(withColumnFrom({ ...PICKS, source: 'pick' })).message).toContain('pick')
  })

  test('refuses a value that is not a relation to the same target', () => {
    expect(refusal(withColumnFrom({ ...PICKS, value: 'rank' })).message).toContain('rank')
    expect(refusal(withColumnFrom({ ...PICKS, value: 'slot_id' })).message).toContain('slot_id')
    expect(refusal(withInputFrom({ ...PICKS, value: 'rank' })).message).toContain('rank')
  })

  test('refuses a match column missing on the query', () => {
    expect(refusal(withColumnFrom({ ...PICKS, match: { lot_id: 'id' } })).message).toContain('lot_id')
  })

  test('refuses a match column missing on the row', () => {
    expect(refusal(withColumnFrom({ ...PICKS, match: { slot_id: 'nope' } })).message).toContain('nope')
    expect(refusal(withInputFrom({ ...PICKS, match: { slot_id: 'nope' } })).message).toContain('nope')
  })

  test('refuses options_from on a column without relation', () => {
    const onName: Domain = {
      ...domain,
      datasets: domain.datasets.map((d) =>
        d.name === 'slot' ? { ...d, columns: { ...d.columns, name: { ...d.columns.name, options_from: PICKS } } } : d,
      ),
    }
    expect(refusal(onName).message).toContain('options_from needs a relation')
  })

  test('refuses a sort column missing on the query', () => {
    expect(refusal(withColumnFrom({ ...PICKS, sort: ['-nope'] })).message).toContain('nope')
  })

  test('accepts a descending sort', () => {
    expect(() => validateDomain(withColumnFrom({ ...PICKS, sort: ['-rank'] }))).not.toThrow()
  })
})

describe('options_from on the wire', () => {
  let editor: Request
  let owner: Request

  beforeEach(async () => {
    const sqlite = new Database(':memory:')
    migrate(sqlite, domain)
    seedDomain(sqlite, domain)
    sqlite.query('UPDATE slot SET member_id = 1 WHERE id = 1').run()
    const app = testEngine(sqlite, domain)
    editor = send(app, await signIn(app, 'editor'))
    owner = send(app, await signIn(app, 'owner', { dataset: 'member', id: 1 }))
  })

  const fill = (body: Record<string, unknown>) =>
    (body.sources.slot.actions as { name: string; input: Record<string, Record<string, unknown>> }[]).find(
      (a) => a.name === 'fill_slot',
    )?.input.member_id

  test('/schema serves options_from to an editor, on the column and the input', async () => {
    const { body } = await editor('GET', '/api/schema')
    expect(body.sources.slot.columns.member_id.options_from).toEqual(PICKS)
    expect(fill(body)?.options_from).toEqual(PICKS)
  })

  test('/schema leaves options_from out for an owner who cannot read the source', async () => {
    const { body } = await owner('GET', '/api/schema')
    expect(body.sources.pick_list).toBeUndefined()
    expect(body.sources.slot.columns.member_id).toBeDefined()
    expect(body.sources.slot.columns.member_id.options_from).toBeUndefined()
    expect(fill(body)).toBeDefined()
    expect(fill(body)?.options_from).toBeUndefined()
  })

  test('the match filter with the declared sort answers the slot rows in rank order, not id order', async () => {
    const filter = encodeURIComponent(JSON.stringify({ slot_id: 1 }))
    const { status, body } = await editor('GET', `/api/rows/pick_list?filter=${filter}&sort=rank`)
    expect(status).toBe(200)
    expect(body.rows.map((r: { member_id: number }) => r.member_id)).toEqual([3, 2, 1])
  })
})
