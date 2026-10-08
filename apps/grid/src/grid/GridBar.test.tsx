import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderNl } from '../test-setup'
import type { Model } from '../types'
import type { Column } from './columns'
import { GridBar } from './GridBar'
import type { Layout } from './layout'

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
      <GridBar model={model} columns={columns} layout={layout} onLayout={setLayout} count={3} />
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

    click(screen.getByRole('button', { name: 'Groeperen' }))
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
    click(screen.getByRole('button', { name: 'Groeperen' }))
    const dialog = await screen.findByRole('dialog', { name: 'Groeperen' })

    fireEvent.click(within(dialog).getByRole('button', { name: 'Soort' }))
    expect(last.group).toBe('kind')

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
