import { expect, test } from 'bun:test'
import theatre from '../src'

test('every theatre dataset declares a nullable readonly legacy_post_id', () => {
  expect(theatre.datasets).toHaveLength(6)
  for (const d of theatre.datasets) {
    expect(d.columns.legacy_post_id).toMatchObject({ type: 'integer', nullable: true, readonly: true })
  }
})
