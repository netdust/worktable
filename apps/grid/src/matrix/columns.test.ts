import { describe, expect, it } from 'vitest'
import { columnsFixture } from '../fixture.test-support'
import type { Row, View } from '../types'
import type { MatrixColumn } from '../types'
import { buildColumns, visibleColumns } from './columns'

const columns: MatrixColumn[] = [
  { key: 'record:5', kind: 'record', id: 5, title: 'Sien' },
  { key: 'name:lieve', kind: 'name', title: 'Lieve' },
]

describe('the hidden columns', () => {
  it('leaves out the hidden keys and keeps the order of the rest', () => {
    expect(visibleColumns(columns, ['name:lieve']).map((c) => c.key)).toEqual(['record:5'])
  })

  it('ignores a hidden key for a record no longer in the window', () => {
    expect(visibleColumns(columns, ['record:99', 'name:gone']).map((c) => c.key)).toEqual(['record:5', 'name:lieve'])
  })
})

describe('the name keys', () => {
  it('are the keys the shared fixture names, each one Arrangement::clean() keeps: a long name capped at 80', () => {
    const view = { ...columnsFixture.table, type: 'matrix', join: { model: 'loan', row_field: 'book', column_field: 'reader', name_field: 'name', cell_field: 'state', keys: {}, marks: {}, count: '' } } as View
    const cells = columnsFixture.matrix.names.map((name, i) => ({ id: i + 1, title: '', status: 'publish', fields: { name, reader: '' } }))
    const rows: Row[] = [{ id: 1, title: 'a', status: 'publish', fields: {}, rollups: { cells } }]

    expect(buildColumns(view, rows, new Map(), []).map((c) => c.key).sort()).toEqual([...columnsFixture.matrix.keys].sort())
  })
})
