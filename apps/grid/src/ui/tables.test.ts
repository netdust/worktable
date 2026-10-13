import type { SavedView } from '../types'
import { describe, expect, it } from 'vitest'
import type { TableDef, View } from '../types'
import { byFirstView, dashboardsOf, groupTables, sectionsOf, tableOf } from './tables'

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

  it('keeps a table without a view: its node is where its first view is made', () => {
    expect(groupTables([table('one'), table('empty')], [view('a', 'one')]).map((t) => [t.key, t.views.length])).toEqual([['one', 1], ['empty', 0]])
  })

  it("carries the table's view types and whether it is a query", () => {
    const [one, two] = groupTables([table('one', { types: ['grid', 'matrix'] }), table('two', { query: true })], [])

    expect([one.types, one.query]).toEqual([['grid', 'matrix'], undefined])
    expect([two.types, two.query]).toEqual([['grid'], true])
  })

  it('keeps two tables with one label as two entries', () => {
    const tables = groupTables([table('one', { label: 'Same' }), table('two', { label: 'Same' })], [view('a', 'one'), view('b', 'two')])

    expect(tables.map((t) => [t.key, t.label])).toEqual([['one', 'Same'], ['two', 'Same']])
  })

  it('puts the tables in the order their first view comes, the rest as declared after them', () => {
    const tables = byFirstView([table('one'), table('two'), table('three'), table('four')], [view('a', 'three'), view('b', 'one'), view('c', 'three')])

    expect(tables.map((t) => t.key)).toEqual(['three', 'one', 'two', 'four'])
  })

  it('puts the views of a query with `of` under that table, in the order they were served; the query gets no node', () => {
    const tables = groupTables(
      [table('model'), table('later', { query: true, of: 'model' }), table('sooner', { query: true, of: 'model' }), table('other')],
      [view('s', 'sooner'), view('l', 'later'), view('m', 'model'), view('o', 'other')],
    )

    expect(tables.map((t) => t.key)).toEqual(['model', 'other'])
    expect(tables[0].views.map((v) => v.key)).toEqual(['s', 'l', 'm'])
  })

  it('keeps a query without `of`, or with an `of` no table answers to, as a node of its own', () => {
    const tables = groupTables([table('model'), table('free', { query: true }), table('lost', { query: true, of: 'gone' })], [view('f', 'free')])

    expect(tables.map((t) => t.key)).toEqual(['model', 'free', 'lost'])
  })

  it('orders a node by its own first view, keeping its views in the order they were served', () => {
    const declared = [table('one'), table('two'), table('q1', { of: 'two' }), table('q2', { of: 'two' })]
    const all = [view('a', 'q2'), view('b', 'one'), view('c', 'two'), view('d', 'q1')]
    const tables = byFirstView(groupTables(declared, all), all)

    expect(tables.map((t) => t.key)).toEqual(['one', 'two'])
    expect(tables[1].views.map((v) => v.key)).toEqual(['a', 'c', 'd'])
  })

  it('finds the table a view belongs to', () => {
    const tables = groupTables([table('one'), table('c')], [view('a', 'one'), view('b', 'one'), view('c', 'c')])

    expect(tableOf(tables, 'b')?.key).toBe('one')
    expect(tableOf(tables, 'c')?.key).toBe('c')
    expect(tableOf(tables, 'gone')).toBeUndefined()
    expect(tableOf(tables, undefined)).toBeUndefined()
  })
})

describe('the sections', () => {
  const tables = groupTables([table('one'), table('two'), table('three'), table('four')], [view('a', 'four'), view('b', 'one')])
  const shape = (sections: ReturnType<typeof sectionsOf>) => sections.map((s) => [s.label, s.tables.map((t) => t.key)])

  it('holds the served sections in their order, each with its sources in theirs, the rest unlabelled last', () => {
    const sections = sectionsOf(tables, [{ label: 'Later', sources: ['three', 'one'] }, { label: 'First', sources: ['two'] }])

    expect(shape(sections)).toEqual([['Later', ['three', 'one']], ['First', ['two']], [null, ['four']]])
  })

  it('is one unlabelled section when the domain declares none', () => {
    expect(shape(sectionsOf(tables))).toEqual([[null, ['one', 'two', 'three', 'four']]])
  })

  it('places no query with `of`: its views sit under its table', () => {
    const grouped = groupTables([table('one'), table('q', { query: true, of: 'one' })], [view('a', 'q')])

    expect(shape(sectionsOf(grouped, [{ label: 'Werk', sources: ['one'] }]))).toEqual([['Werk', ['one']]])
  })

  it('drops a source it does not know and a section left empty, and adds no empty last section', () => {
    const sections = sectionsOf(tables, [{ label: 'Gone', sources: ['missing'] }, { label: 'All', sources: ['one', 'two', 'three', 'four'] }])

    expect(shape(sections)).toEqual([['All', ['one', 'two', 'three', 'four']]])
  })
})

describe('dashboardsOf', () => {
  const board = (id: number, owner: number, mine: boolean) =>
    ({ key: String(id), id, type: 'dashboard', owner: { id: owner, name: '' }, mine }) as unknown as SavedView
  it('lands on the reader’s own, then one shared by someone else, then the system’s', () => {
    const order = dashboardsOf([board(1, -1, false), board(2, 7, false), board(3, 4, true), { ...board(4, 4, true), type: 'grid' } as SavedView])
    expect(order.map((v) => v.id)).toEqual([3, 2, 1])
  })
})
