import { afterEach, describe, expect, it } from 'vitest'
import type { SavedView, View } from '../types'
import { savePicked, storedPicked } from '../matrix/columns'
import { arrangementOf, changed, clearIfSent, clearLocal, copyKept, forget, lastIn, layoutOf, listFor, localOf, moved, stepped, storeLayout, toStored } from './views'
import type { Table } from './tables'

const tabel: View = { key: 'planning', label: 'Tabel', model: 'activity', table: 'planning', sort: ['date', '-start'], group: 'date', starting: true }
const stored = {
  hidden: ['record:5', 'name:lieve'], order: [], widths: [{ id: 'title', width: 220 }], sort: [{ id: 'date', desc: false }],
  filters: [{ field: 'location', value: '3' }], group: null, picked: [9],
}
const calais: SavedView = {
  key: '42', id: 42, label: 'Calais techniek', model: 'activity', table: 'planning', type: 'matrix', starting: false,
  arrangement: stored, shared: false, owner: { id: 1, name: 'Hester' }, mine: true, editable: true,
}
const local = (key: string, value: unknown) => window.localStorage.setItem(`ntdst-views/layout/v1/${key}`, JSON.stringify(value))
const picked = (key: string, value: number[]) => savePicked({ ...calais, key }, value)

afterEach(() => window.localStorage.clear())

describe('an arrangement', () => {
  it("is a starting view's sort, group and hidden, and nothing picked", () => {
    expect(arrangementOf({ ...tabel, hidden: ['place'] })).toEqual({
      hidden: ['place'], order: [], widths: {}, sort: [{ id: 'date', desc: false }, { id: 'start', desc: true }], filters: [], group: 'date', picked: [],
    })
  })

  it("is a saved view's stored one, its widths a record by column", () => {
    expect(arrangementOf(calais)).toEqual({ ...stored, widths: { title: 220 } })
  })

  it('goes back to the stored shape whole', () => {
    expect(toStored(arrangementOf(calais))).toEqual(stored)
  })
})

describe('the local copy', () => {
  it('is null when this browser keeps none', () => {
    expect(localOf(tabel)).toBeNull()
    expect(changed(tabel)).toBe(false)
  })

  it('is changed once a grid column is hidden', () => {
    local('planning', { ...arrangementOf(tabel), picked: undefined, hidden: ['place'] })

    expect(localOf(tabel)?.hidden).toEqual(['place'])
    expect(changed(tabel)).toBe(true)
  })

  it('is not changed when a matrix hides the same ones in another order', () => {
    local('42', { ...arrangementOf(calais), hidden: ['name:lieve', 'record:5'] })
    expect(changed(calais)).toBe(false)
  })

  it('keeps a width, a matrix column hidden and a picked column in this browser: none is a change to save', () => {
    const { picked: _, ...layout } = arrangementOf(calais)
    storeLayout(calais, { ...layout, widths: { title: 220, place: 90 }, hidden: [...layout.hidden, 'record:7'] })
    picked('42', [9, 11])

    expect(localOf(calais)).toMatchObject({ widths: { title: 220, place: 90 }, picked: [9, 11] })
    expect(changed(calais)).toBe(false)
  })

  it('is not changed when it equals the saved arrangement', () => {
    local('42', arrangementOf(calais))
    picked('42', [9])

    expect(changed(calais)).toBe(false)
  })

  it('is what the sheet shows, and the saved one again once cleared', () => {
    local('42', { ...arrangementOf(calais), group: 'date' })
    picked('42', [9, 11])
    expect(layoutOf(calais).group).toBe('date')

    clearLocal(calais)

    expect(localOf(calais)).toBeNull()
    expect(layoutOf(calais).group).toBeNull()
    expect(layoutOf(calais).widths).toEqual({ title: 220 })
    expect(arrangementOf(calais).picked).toEqual([9, 11])
  })
})

describe('what stays in this browser', () => {
  const served: SavedView = { ...calais, arrangement: { ...stored, hidden: [], widths: [], picked: [] } }
  const layout = () => {
    const { picked: _, ...rest } = arrangementOf(served)
    return rest
  }

  it('is still there after a Save and a re-read: widths, picks and hidden matrix columns, none of them sent', () => {
    storeLayout(served, { ...layout(), widths: { place: 90 }, hidden: ['record:7'], group: 'date' })
    picked('42', [9])
    const sent = localOf(served)!
    expect(changed(served)).toBe(true)

    clearIfSent(served, sent)
    const reread: SavedView = { ...served, arrangement: { ...served.arrangement, group: 'date' } }

    expect(localOf(reread)).toBeNull()
    expect(changed(reread)).toBe(false)
    expect(layoutOf(reread)).toMatchObject({ widths: { place: 90 }, hidden: ['record:7'], group: 'date' })
    expect(arrangementOf(reread).picked).toEqual([9])
  })

  it('is copied to a view saved as new, and gone with a view deleted for good', () => {
    const created: SavedView = { ...served, key: '50', id: 50 }
    storeLayout(served, { ...layout(), widths: { place: 90 } })
    picked('42', [9])

    copyKept(served, created)
    forget(served)

    expect(layoutOf(created).widths).toEqual({ place: 90 })
    expect(storedPicked(created)).toEqual([9])
    expect(layoutOf(served).widths).toEqual({})
    expect(storedPicked(served)).toBeNull()
  })
})

describe('a table\'s list', () => {
  const bezetting: View = { ...tabel, key: 'bezetting', label: 'Matrix', type: 'matrix' }
  const table: Table = { key: 'planning', label: 'Planning', space: 'scoped', types: ['grid', 'matrix'], views: [tabel, bezetting] }
  const other: SavedView = { ...calais, key: '43', id: 43, label: 'Montage', type: 'grid' }
  const elsewhere: SavedView = { ...calais, key: '44', id: 44, table: 'afwezigheden' }

  it('is the starting views, then the saved ones of that table', () => {
    expect(listFor(table, [calais, elsewhere, other], {}).map((v) => v.key)).toEqual(['planning', 'bezetting', '42', '43'])
  })

  it('follows an order, with the views it does not name after it and a key it names that is gone ignored', () => {
    expect(listFor(table, [calais, other], { planning: ['43', 'gone', 'bezetting'] }).map((v) => v.key)).toEqual(['43', 'bezetting', 'planning', '42'])
  })

  it("is its own views, then each query's, each block in the order kept for its own source", () => {
    const query: View = { key: 'dag', label: 'Dag', model: 'per_dag', table: 'per_dag', of: 'planning', query: true, starting: true }
    const copy: SavedView = { ...calais, key: '45', id: 45, label: 'Dag (kopie)', model: 'per_dag', table: 'per_dag', of: 'planning', query: true }
    const withQuery: Table = { ...table, views: [tabel, bezetting, query] }
    const order = { planning: ['bezetting'], per_dag: ['45', 'dag'] }

    expect(listFor(withQuery, [calais, copy], order).map((v) => v.key)).toEqual(['bezetting', 'planning', '42', '45', 'dag'])
    expect(listFor(withQuery, [calais, copy], { planning: ['45', '42'] }).map((v) => v.key)).toEqual(['42', 'planning', 'bezetting', 'dag', '45'])
  })
})

describe('an order', () => {
  const keys = ['planning', 'bezetting', '42', '43']

  it('takes a dragged key to the edge of the one it is dropped on', () => {
    expect(moved(keys, '43', 'planning', 'before')).toEqual(['43', 'planning', 'bezetting', '42'])
    expect(moved(keys, 'planning', '43', 'after')).toEqual(['bezetting', '42', '43', 'planning'])
    expect(moved(keys, 'planning', '42', 'before')).toEqual(['bezetting', 'planning', '42', '43'])
    expect(moved(keys, 'bezetting', '42', 'after')).toEqual(['planning', '42', 'bezetting', '43'])
  })

  it('stays as it is when a key is dropped on itself, or either key is not in it', () => {
    expect(moved(keys, '42', '42', 'after')).toEqual(keys)
    expect(moved(keys, 'gone', '42', 'after')).toEqual(keys)
    expect(moved(keys, '42', 'gone', 'after')).toEqual(keys)
  })

  it('moves a key one step, and not past either end', () => {
    expect(stepped(keys, '42', -1)).toEqual(['planning', '42', 'bezetting', '43'])
    expect(stepped(keys, '42', 1)).toEqual(['planning', 'bezetting', '43', '42'])
    expect(stepped(keys, 'planning', -1)).toEqual(keys)
    expect(stepped(keys, '43', 1)).toEqual(keys)
  })
})

describe('the view a table opens on', () => {
  const bezetting: View = { ...tabel, key: 'bezetting', label: 'Matrix', type: 'matrix' }
  const table: Table = { key: 'planning', label: 'Planning', space: 'scoped', types: ['grid', 'matrix'], views: [bezetting, tabel, calais] }

  it('is the last one used there while it is still in the list', () => {
    expect(lastIn(table, { planning: '42' })?.key).toBe('42')
  })

  it('is the first in the list when the last one is gone, or there is none', () => {
    expect(lastIn(table, { planning: '99' })?.key).toBe('bezetting')
    expect(lastIn(table, {})?.key).toBe('bezetting')
    expect(lastIn(table, { afwezigheden: '42' })?.key).toBe('bezetting')
  })

  it("is a query's view last used under the table its views sit under", () => {
    const query: View = { key: 'dag', label: 'Dag', model: 'per_dag', table: 'per_dag', of: 'planning', query: true }

    expect(lastIn({ ...table, views: [...table.views, query] }, { planning: 'dag' })?.key).toBe('dag')
  })
})
