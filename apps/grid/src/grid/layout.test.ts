import { beforeEach, describe, expect, it } from 'vitest'
import { planning } from './calais.test.data'
import { defaults, filter, group, hide, type Layout, readStored, reorder, resize, save, show, sort, storedLayout, writeStored } from './layout'

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem'> {
  items = new Map<string, string>()
  getItem(key: string) {
    return this.items.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.items.set(key, value)
  }
}

let memory: MemoryStorage
const storage = () => memory as unknown as Storage

beforeEach(() => {
  memory = new MemoryStorage()
})

describe('defaults', () => {
  it("start with the view's own hidden columns, a copy the layout may change", () => {
    const view = { ...planning, hidden: ['place', 'rollup:confirmed'] }
    const layout = defaults(view)

    expect(layout.hidden).toEqual(['place', 'rollup:confirmed'])
    expect(hide(layout, 'kind').hidden).toEqual(['place', 'rollup:confirmed', 'kind'])
    expect(view.hidden).toEqual(['place', 'rollup:confirmed'])
  })

  it("start from the view's declared sort and group, nothing hidden or filtered", () => {
    expect(defaults({ ...planning, sort: ['date', '-start'] })).toEqual({
      hidden: [], order: [], widths: {}, filters: [], group: 'date',
      sort: [{ id: 'date', desc: false }, { id: 'start', desc: true }],
    })
  })
})

describe('the column state', () => {
  it('hides and shows a column', () => {
    const hidden = hide(defaults(planning), 'place')
    expect(hidden.hidden).toEqual(['place'])
    expect(show(hidden, 'place').hidden).toEqual([])
  })

  it('moves a column to a new place, starting from the columns as shown when nothing was moved yet', () => {
    const ids = ['title', 'date', 'start', 'kind']
    const moved = reorder(defaults(planning), 'kind', 1, ids)
    expect(moved.order).toEqual(['title', 'kind', 'date', 'start'])
    expect(reorder({ ...moved, order: ['kind', 'title', 'gone'] }, 'date', 0, ids).order).toEqual(['date', 'kind', 'title', 'start'])
  })

  it('keeps a width, never under the floor', () => {
    expect(resize(defaults(planning), 'title', 300).widths).toEqual({ title: 300 })
    expect(resize(defaults(planning), 'title', 4).widths).toEqual({ title: 48 })
  })

  it('sets a filter per field, replaces it, and removes it with null', () => {
    const one = filter(defaults(planning), 'status', 'option')
    const two = filter(one, 'location', '12')
    expect(filter(two, 'status', 'confirmed').filters).toEqual([{ field: 'status', value: 'confirmed' }, { field: 'location', value: '12' }])
    expect(filter(two, 'status', null).filters).toEqual([{ field: 'location', value: '12' }])
  })
})

describe('persistence', () => {
  it('round-trips hide, reorder, resize, sort, filter and group through storage, per view', () => {
    let layout: Layout = defaults(planning)
    layout = hide(layout, 'place')
    layout = reorder(layout, 'kind', 1, ['title', 'date', 'kind'])
    layout = resize(layout, 'title', 280)
    layout = sort(layout, [{ id: 'title', desc: true }])
    layout = filter(layout, 'status', 'option')
    layout = group(layout, 'kind')

    save(planning, layout, storage)

    expect(storedLayout(planning, storage)).toEqual(layout)
    expect(storedLayout({ ...planning, key: 'other' }, storage)).toBeNull()
  })

  it('keeps nothing when storage throws, on read and on write', () => {
    const broken = () => {
      throw new DOMException('denied', 'SecurityError')
    }

    expect(() => save(planning, hide(defaults(planning), 'place'), broken)).not.toThrow()
    expect(storedLayout(planning, broken)).toBeNull()
  })

  it('keeps nothing for what an older build or a hand wrote there', () => {
    memory.setItem('ntdst-views/layout/v1/planning', '{"hidden":"place","sort":[{"id":3}]}')
    expect(storedLayout(planning, storage)).toBeNull()

    memory.setItem('ntdst-views/layout/v1/planning', 'not json')
    expect(storedLayout(planning, storage)).toBeNull()
  })

  it('keeps any per-view value under its own prefix, parsed: null when absent, unreadable, refused by the parser or blocked', () => {
    const numbers = (raw: unknown) => (Array.isArray(raw) ? raw.filter((n): n is number => typeof n === 'number') : null)
    const broken = () => {
      throw new DOMException('denied', 'SecurityError')
    }

    expect(readStored('picked/', planning, numbers, storage)).toBeNull()
    writeStored('picked/', planning, [7, 'x', 9], storage)
    expect(memory.getItem('picked/planning')).toBe('[7,"x",9]')
    expect(readStored('picked/', planning, numbers, storage)).toEqual([7, 9])
    memory.setItem('picked/planning', '{"a":1}')
    expect(readStored('picked/', planning, numbers, storage)).toBeNull()
    memory.setItem('picked/planning', 'not json')
    expect(readStored('picked/', planning, numbers, storage)).toBeNull()
    expect(() => writeStored('picked/', planning, [1], broken)).not.toThrow()
    expect(readStored('picked/', planning, numbers, broken)).toBeNull()
  })
})
