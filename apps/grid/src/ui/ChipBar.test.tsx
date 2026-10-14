import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderNl } from '../test-setup'
import type { Model } from '../types'
import type { Column } from '../grid/columns'
import type { Layout } from '../grid/layout'
import { barOf } from './bar'
import type { Filter } from '../grid/conditions'
import type { Period } from './period'
import { ChipBar } from './ChipBar'

const column = (id: string, label: string) => ({ id, field: id, label, kind: 'text', editable: true, required: false, align: 'start', width: 120 }) as unknown as Column
const columns = [column('title', 'Titel'), column('start', 'Start'), column('end', 'Einde')]
const model = {
  key: 'activity', label: 'Activiteit', title_label: 'Titel', title_readonly: false,
  fields: { kind: { type: 'select', label: 'Soort' }, start: { type: 'time', label: 'Start' } },
} as unknown as Model
const empty: Layout = { hidden: [], order: [], widths: {}, sort: [], filters: [], group: null }

let last: Layout = empty

function Bar() {
  const [layout, setLayout] = useState(empty)
  last = layout
  return (
    <div data-testid="box">
      <p>page</p>
      <div data-testid="scroller" />
      <ChipBar {...barOf({ view: { key: 'p', label: 'Planning', table: 'activity', model: 'activity' }, model, layout, onLayout: setLayout, scope: null, told: { rows: 3, groups: null, cut: false, menu: columns }, period: null })} />
    </div>
  )
}

afterEach(cleanup)

/** What a mouse does: down (focus moves, or leaves for the page), up, click. */
const click = (target: HTMLElement) => {
  fireEvent.pointerDown(target, { button: 0, pointerType: 'mouse' })
  fireEvent.mouseDown(target, { button: 0 })
  if (target.tabIndex >= 0) target.focus()
  else (document.activeElement as HTMLElement | null)?.blur()
  fireEvent.pointerUp(target, { button: 0, pointerType: 'mouse' })
  fireEvent.mouseUp(target, { button: 0 })
  fireEvent.click(target, { button: 0 })
}

const trigger = () => screen.getByRole('button', { name: 'Kolommen' })
const panel = () => screen.queryByRole('dialog', { name: 'Kolommen' })

describe('the column picker', () => {
  it('shows, hides and moves a column; the title always shows', async () => {
    renderNl(<Bar />)
    click(trigger())
    const dialog = await screen.findByRole('dialog', { name: 'Kolommen' })

    expect(within(dialog).getAllByRole('checkbox').map((box) => (box as HTMLInputElement).checked)).toEqual([true, true, true])
    expect((within(dialog).getByRole('checkbox', { name: 'Titel' }) as HTMLInputElement).disabled).toBe(true)

    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Start' }))
    expect(last.hidden).toEqual(['start'])
    expect((within(dialog).getByRole('checkbox', { name: 'Start' }) as HTMLInputElement).checked).toBe(false)

    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Start' }))
    expect(last.hidden).toEqual([])

    fireEvent.click(within(dialog).getByRole('button', { name: 'Einde: naar links' }))
    expect(last.order.slice(0, 3)).toEqual(['title', 'end', 'start'])
  })

  it('Escape closes it and gives focus back to its button', async () => {
    renderNl(<Bar />)
    click(trigger())
    const dialog = await screen.findByRole('dialog', { name: 'Kolommen' })
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' })
    await waitFor(() => expect(panel()).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger()))
  })

  it('closes on a press outside it', async () => {
    renderNl(<Bar />)
    click(trigger())
    await screen.findByRole('dialog', { name: 'Kolommen' })

    click(screen.getByText('page'))
    await waitFor(() => expect(panel()).toBeNull())
  })

  it('a press inside it keeps it open', async () => {
    renderNl(<Bar />)
    click(trigger())
    const dialog = await screen.findByRole('dialog', { name: 'Kolommen' })

    click(within(dialog).getByRole('checkbox', { name: 'Einde' }))
    expect(panel()).not.toBeNull()
  })

  it('closes on a second click on its button', async () => {
    renderNl(<Bar />)
    click(trigger())
    await screen.findByRole('dialog', { name: 'Kolommen' })

    click(trigger())
    await waitFor(() => expect(panel()).toBeNull())
  })

  it('another button opens its own panel with one click and closes this one', async () => {
    renderNl(<Bar />)
    click(trigger())
    await screen.findByRole('dialog', { name: 'Kolommen' })

    click(screen.getByRole('button', { name: 'Groep: geen' }))
    await screen.findByRole('dialog', { name: 'Groeperen' })
    await waitFor(() => expect(panel()).toBeNull())
  })

  it('does not lock the page: it scrolls behind it and stays visible to a screen reader', async () => {
    renderNl(<Bar />)
    click(trigger())
    await screen.findByRole('dialog', { name: 'Kolommen' })

    expect(document.body.style.overflow).not.toBe('hidden')
    expect(screen.getByText('page').closest('[aria-hidden="true"]')).toBeNull()
  })

  it('stays open while the sheet beside it scrolls', async () => {
    renderNl(<Bar />)
    click(trigger())
    await screen.findByRole('dialog', { name: 'Kolommen' })

    fireEvent.scroll(screen.getByTestId('scroller'))
    expect(panel()).not.toBeNull()
  })
})

describe('the group panel', () => {
  it('groups by a field and closes on Escape', async () => {
    renderNl(<Bar />)
    click(screen.getByRole('button', { name: 'Groep: geen' }))
    const dialog = await screen.findByRole('dialog', { name: 'Groeperen' })

    click(within(dialog).getByRole('button', { name: 'Soort' }))
    expect(last.group).toBe('kind')

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

describe('one chip row for every skin', () => {
  const activity = {
    key: 'activiteit', label: 'Activiteit', title_label: 'Omschrijving', title_readonly: false,
    fields: {
      plandag: { type: 'date', label: 'Plandag' }, soort: { type: 'select', label: 'Soort' },
      productie_id: { type: 'relation', label: 'Productie' }, speelreeks_id: { type: 'relation', label: 'Tourstop' },
    },
  } as unknown as Model
  const cal = { day: 'plandag', start: null, end: null, lanes: ['productie_id', 'speelreeks_id'] }
  // Every view on a table carries the table's needs, a board's column too: the skin is the view's type.
  const base = { key: 'v', label: 'Activiteiten', table: 'activiteit', model: 'activiteit', date_field: 'plandag', board: { column: 'soort' } }
  const skins = {
    grid: { ...base },
    board: { ...base, type: 'board', board: { column: 'soort' } },
    timeline: { ...base, type: 'timeline', calendar: cal },
    calendar: { ...base, type: 'calendar', calendar: cal },
    gallery: { ...base, type: 'gallery', gallery: { kind: 'foto' } },
    matrix: { ...base, type: 'matrix' },
  }
  const layout: Layout = { ...empty, group: 'productie_id' }
  const told = { rows: 12, groups: null, cut: false, menu: [column('title', 'Omschrijving')] }
  const period = { period: { field: 'plandag', condition: null, window: { from: '2026-10-12', to: '2026-10-18' }, kind: 'week', name: 'Week 42 · 12–18 okt', optional: false } as Period, onPeriod: () => undefined }
  /** The row's slots in the order they show, each by what it is. */
  const slots = () => [...document.querySelectorAll('.nv-bar > *, .nv-bar__end > *')].flatMap((el) => {
    const text = el.textContent ?? ''
    if (el.classList.contains('nv-chip--scope')) return ['scope']
    if (el.getAttribute('data-testid') === 'filters') return ['filters']
    if (text.startsWith('Groep:')) return ['group']
    if (text === 'Vandaag') return ['period']
    if (text === '+ Kolom') return ['addColumn']
    if (el.classList.contains('nv-bar__count')) return ['count']
    if (el.getAttribute('aria-label') === 'Kolommen') return ['columns']
    return []
  })
  const ORDER = ['scope', 'filters', 'group', 'period', 'addColumn', 'count', 'columns']
  const rowFor = (type: keyof typeof skins) => {
    renderNl(<ChipBar {...barOf({
      view: skins[type] as never, model: activity, layout, onLayout: () => undefined, scope: 'Productie is Nachtwacht',
      filters: <span data-testid="filters">Filter</span>, told, period,
      ...(type === 'matrix' ? { adding: { open: false, onToggle: () => undefined } } : {}),
    })} />)
    const found = slots()
    const texts = [...document.querySelectorAll('.nv-bar .nv-chip, .nv-bar__count')].map((el) => el.textContent)
    cleanup()
    return { found, texts }
  }

  it('shows the same slots in the same order on all six skins, each where its data has it', () => {
    for (const type of Object.keys(skins) as (keyof typeof skins)[]) {
      const { found } = rowFor(type)
      expect(found, type).toEqual(ORDER.filter((slot) => found.includes(slot)))
      expect(found.filter((slot) => ['scope', 'filters', 'group', 'period', 'count'].includes(slot)), type).toEqual(['scope', 'filters', 'group', 'period', 'count'])
    }
    expect(rowFor('grid').found).toContain('columns')
    expect(rowFor('matrix').found).toContain('addColumn')
  })

  it('gives a timeline and a calendar on the same dataset the same chip row', () => {
    expect(rowFor('timeline').texts).toEqual(rowFor('calendar').texts)
  })

  it('makes Groep a chooser on a board, its option fields, and on a gallery, its dates and options and geen', async () => {
    let chosen: string | null | undefined
    renderNl(<ChipBar {...barOf({ view: skins.board as never, model: activity, layout: { ...layout, group: null }, onLayout: (next) => { chosen = next.group }, scope: null, told, period })} />)
    click(screen.getByRole('button', { name: 'Groep: soort' }))
    let dialog = await screen.findByRole('dialog', { name: 'Groeperen' })
    expect(within(dialog).getAllByRole('button').map((b) => b.textContent)).toEqual(['Soort'])
    click(within(dialog).getByRole('button', { name: 'Soort' }))
    expect(chosen).toBe('soort')
    cleanup()
    renderNl(<ChipBar {...barOf({ view: skins.gallery as never, model: activity, layout: { ...layout, group: null }, onLayout: (next) => { chosen = next.group }, scope: null, told, period })} />)
    click(screen.getByRole('button', { name: 'Groep: geen' }))
    dialog = await screen.findByRole('dialog', { name: 'Groeperen' })
    expect(within(dialog).getAllByRole('button').map((b) => b.textContent)).toEqual(['Geen', 'Plandag', 'Soort'])
    click(within(dialog).getByRole('button', { name: 'Plandag' }))
    expect(chosen).toBe('plandag')
  })

  it('closes the Groep panel on a pick, a single choice, the chosen option marked as pressed', async () => {
    let layoutNow = { ...layout, group: null as string | null }
    const { rerender } = renderNl(<ChipBar {...barOf({ view: skins.board as never, model: activity, layout: layoutNow, onLayout: (next) => { layoutNow = next }, scope: null, told, period })} />)
    click(screen.getByRole('button', { name: /^Groep: / }))
    const dialog = await screen.findByRole('dialog', { name: 'Groeperen' })
    click(within(dialog).getByRole('button', { name: 'Soort' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Groeperen' })).toBeNull())
    rerender(<ChipBar {...barOf({ view: skins.board as never, model: activity, layout: layoutNow, onLayout: () => undefined, scope: null, told, period })} />)
    click(screen.getByRole('button', { name: 'Groep: soort' }))
    const again = await screen.findByRole('dialog', { name: 'Groeperen' })
    expect(within(again).getByRole('button', { name: 'Soort' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('shows Kolommen on every skin that reports its fields, never on a matrix', () => {
    for (const type of ['grid', 'board', 'gallery', 'calendar', 'timeline'] as const) expect(rowFor(type).found, type).toContain('columns')
    expect(rowFor('matrix').found).not.toContain('columns')
  })

  it('offers a calendar\'s declared lanes and Geen in the Groep chip', async () => {
    let chosen: string | null | undefined
    renderNl(<ChipBar {...barOf({ view: skins.calendar as never, model: activity, layout, onLayout: (next) => { chosen = next.group }, scope: null, told, period })} />)
    click(screen.getByRole('button', { name: 'Groep: productie' }))
    const dialog = await screen.findByRole('dialog', { name: 'Groeperen' })
    expect(within(dialog).getAllByRole('button').map((b) => b.textContent)).toEqual(['Productie', 'Tourstop', 'Geen'])
    click(within(dialog).getByRole('button', { name: 'Geen' }))
    expect(chosen).toBeNull()
  })

  it('steps the period, opens today, and toggles a lit chip off where the skin shows every date', () => {
    const asked: (Filter | null)[] = []
    const week: Period = { field: 'plandag', condition: { field: 'plandag', op: 'week', values: [] }, window: { from: '2026-10-12', to: '2026-10-18' }, kind: 'week', name: 'Week 42 · 12–18 okt', optional: true }
    renderNl(<ChipBar period={{ period: week, onPeriod: (next) => asked.push(next) }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Volgende periode' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Week' }))
    expect(asked).toEqual([{ field: 'plandag', op: 'between', values: ['2026-10-19', '2026-10-25'] }, null])
    cleanup()
    const none: Period = { ...week, condition: null, window: null, kind: null, name: null }
    renderNl(<ChipBar period={{ period: none, onPeriod: (next) => asked.push(next) }} />)
    expect(screen.getByRole('button', { name: 'Volgende periode' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false'])
    fireEvent.click(screen.getByRole('button', { name: 'Vandaag' }))
    expect(asked[2]).toEqual({ field: 'plandag', op: 'week', values: [] })
  })
})
