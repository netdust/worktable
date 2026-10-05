import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Field, Model, View } from './types'

/** `tests/fixtures/views-columns.json`: the column ids and matrix keys `Saved/Arrangement.php` mirrors, asserted on both sides. */
export interface ColumnsFixture {
  model: string
  fields: Record<string, Field>
  table: View & { types: string[] }
  ids: string[]
  matrix: { names: string[]; keys: string[]; refused: string[] }
}

export const columnsFixture: ColumnsFixture = JSON.parse(readFileSync(resolve(__dirname, '../../../../tests/fixtures/views-columns.json'), 'utf8'))

export const fixtureModel = (fixture: ColumnsFixture): Model => ({
  key: fixture.model, label: fixture.model, title_label: 'Title', title_readonly: false, fields: fixture.fields,
})
