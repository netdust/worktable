import { describe, expect, it } from 'vitest'
import type { TableDef, View } from '../types'
import { byFirstView, groupTables, tableOf } from './tables'

const table = (key: string, extra: Partial<TableDef> = {}): TableDef => ({ key, label: key.toUpperCase(), model: 'record', types: ['grid'], ...extra })
const view = (key: string, of: string, extra: Partial<View> = {}): View => ({ key, label: key.toUpperCase(), model: 'record', table: of, ...extra })

describe('the tables', () => {
  it('keeps the declared table order, each with its views in their order', () => {
    const tables = groupTables(
      [table('two'), table('one')],
      [view('a', 'one'), view('b', 'two'), view('c', 'one', { type: 'matrix' })],
    )

    expect(tables.map((t) => t.key)).toEqual(['two', 'one'])
    expect(tables[0].views.map((v) => v.key)).toEqual(['b'])
    expect(tables[1].views.map((v) => v.key)).toEqual(['a', 'c'])
  })

  it("takes the label and the space from the table's declaration", () => {
    const [one] = groupTables([table('one', { label: 'Planning', space: 'scoped' })], [view('a', 'one', { table_label: 'Other', space: 'global' })])

    expect(one.label).toBe('Planning')
    expect(one.space).toBe('scoped')
  })

  it('reads a table without a space as global', () => {
    expect(groupTables([table('one')], [view('a', 'one')])[0].space).toBe('global')
  })

  it('leaves out a table without a view: a rail entry must open one', () => {
    expect(groupTables([table('one'), table('empty')], [view('a', 'one')]).map((t) => t.key)).toEqual(['one'])
  })

  it('keeps two tables with one label as two entries', () => {
    const tables = groupTables([table('one', { label: 'Same' }), table('two', { label: 'Same' })], [view('a', 'one'), view('b', 'two')])

    expect(tables.map((t) => [t.key, t.label])).toEqual([['one', 'Same'], ['two', 'Same']])
  })

  it('puts the tables in the order their first view comes, the rest as declared after them', () => {
    const tables = byFirstView([table('one'), table('two'), table('three'), table('four')], [view('a', 'three'), view('b', 'one'), view('c', 'three')])

    expect(tables.map((t) => t.key)).toEqual(['three', 'one', 'two', 'four'])
  })

  it('finds the table a view belongs to', () => {
    const tables = groupTables([table('one'), table('c')], [view('a', 'one'), view('b', 'one'), view('c', 'c')])

    expect(tableOf(tables, 'b')?.key).toBe('one')
    expect(tableOf(tables, 'c')?.key).toBe('c')
    expect(tableOf(tables, 'gone')).toBeUndefined()
    expect(tableOf(tables, undefined)).toBeUndefined()
  })
})
