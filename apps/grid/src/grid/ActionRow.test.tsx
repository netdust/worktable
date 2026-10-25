import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Available, ModelAction, Row } from '../types'
import { ActionRow, fitting } from './ActionRow'
import { DrawerWriteContext } from './drawerWrite'

const remote = vi.hoisted(() => ({ records: vi.fn(() => Promise.resolve({ rows: [], total: 0 })), optionsFrom: vi.fn() }))
vi.mock('../api', () => remote)

afterEach(cleanup)

const press = vi.fn(() => Promise.resolve())
const write = { press, fresh: vi.fn() }
const buttons = (...list: [string, string, boolean?][]): Available['buttons'] => list.map(([to, label, primary]) => ({ to, label, ...(primary ? { primary: true as const } : {}) }))
const row = (available?: Available, id = 7): Row => ({ id, title: 'Opdracht', status: '', fields: {}, ...(available ? { available } : {}) })
const act = (name: string, input: ModelAction['input'] = {}): ModelAction => ({ name, label: name, input })

function show(record: Row, props: Partial<Parameters<typeof ActionRow>[0]> = {}) {
  return render(
    <DrawerWriteContext.Provider value={write}>
      <ActionRow model="actie" row={record} onDone={vi.fn()} actions={[]} {...props} />
    </DrawerWriteContext.Provider>,
  )
}
const names = (container: HTMLElement) => [...container.querySelectorAll('.nv-dw-actions__row > .nv-button')].map((one) => one.textContent)
const wide = (widths: number[], room: number) => () => ({ room, widths })

describe('the action row', () => {
  it('shows the primary button first and filled, the others after it quiet, whatever order the server marked them in', () => {
    const { container } = show(row({ state: 'x', buttons: buttons(['nee', 'Annuleren'], ['ja', 'Bevestigen', true]), actions: [] }))

    expect(names(container)).toEqual(['Bevestigen', 'Annuleren'])
    expect(screen.getByRole('button', { name: 'Bevestigen' }).className).toContain('nv-button--primary')
    expect(screen.getByRole('button', { name: 'Annuleren' }).className).not.toContain('nv-button--primary')
  })

  it('shows the buttons in their declared order, all quiet, when none is primary, then the declared actions', () => {
    const { container } = show(row({ state: 'x', buttons: buttons(['a', 'Eerst'], ['b', 'Tweede']), actions: ['bundel'] }), { actions: [act('bundel')], onAction: vi.fn() })

    expect(names(container)).toEqual(['Eerst', 'Tweede', 'bundel'])
    expect(container.querySelector('.nv-button--primary')).toBeNull()
  })

  it('has no button for an action the row is not marked for, and nothing at all for an unsaved record or without buttons', () => {
    const { container } = show(row({ state: 'x', buttons: [], actions: ['een'] }), { actions: [act('een'), act('twee')], onAction: vi.fn() })
    expect(names(container)).toEqual(['een'])
    cleanup()

    expect(show(row(undefined, 0), { actions: [act('een')], onAction: vi.fn() }).container.querySelector('.nv-dw-actions')).toBeNull()
    cleanup()
    expect(show(row({ state: 'x', buttons: [], actions: [] })).container.querySelector('.nv-dw-actions')).toBeNull()
  })

  it('presses a marked button through the host with the marks it was given', () => {
    press.mockClear()
    const marks: Available = { state: 'x', buttons: buttons(['ja', 'Bevestigen', true]), actions: [] }
    show(row(marks))

    fireEvent.click(screen.getByRole('button', { name: 'Bevestigen' }))

    expect(press).toHaveBeenCalledWith('actie', 7, marks, 'ja', expect.any(Function))
  })

  it('folds what does not fit into Meer, in order, and keeps the primary out of it', async () => {
    const marks: Available = { state: 'x', buttons: buttons(['ja', 'Bevestigen', true], ['a', 'Een'], ['b', 'Twee'], ['c', 'Drie']), actions: [] }
    const { container } = show(row(marks), { measure: wide([90, 80, 80, 80], 250) })

    expect(names(container)).toEqual(['Bevestigen', 'Een'])
    fireEvent.click(screen.getByRole('button', { name: 'Meer' }))
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual(['Twee', 'Drie'])
  })

  it('shows no Meer when everything fits', () => {
    const marks: Available = { state: 'x', buttons: buttons(['ja', 'Bevestigen', true], ['a', 'Een']), actions: [] }
    const { container } = show(row(marks), { measure: wide([90, 80], 400) })

    expect(names(container)).toEqual(['Bevestigen', 'Een'])
    expect(screen.queryByRole('button', { name: 'Meer' })).toBeNull()
  })

  it('keeps the primary when even it does not fit', () => {
    expect(fitting({ room: 60, widths: [90, 80] }, true)).toBe(1)
    expect(fitting({ room: 60, widths: [90, 80] }, false)).toBe(0)
  })

  it('presses a folded action from Meer', async () => {
    const run = vi.fn(() => Promise.resolve())
    const marks: Available = { state: 'x', buttons: buttons(['ja', 'Bevestigen', true]), actions: ['bundel'] }
    show(row(marks), { actions: [act('bundel')], onAction: run, measure: wide([90, 80], 120) })

    fireEvent.click(screen.getByRole('button', { name: 'Meer' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'bundel' }))

    expect(run).toHaveBeenCalledWith(expect.objectContaining({ name: 'bundel' }), {})
  })

  it('opens an action’s inputs under the row, and Escape gives focus back to its button', async () => {
    const withInput = act('schuif', { dagen: { type: 'integer', label: 'Dagen' } })
    const marks: Available = { state: 'x', buttons: [], actions: ['schuif'] }
    const { container } = show(row(marks), { actions: [withInput], onAction: vi.fn() })

    fireEvent.click(screen.getByRole('button', { name: 'schuif' }))
    const panel = container.querySelector('.nv-dw-ask--inline') as HTMLElement
    expect(panel).not.toBeNull()
    expect(panel.previousElementSibling?.className).toBe('nv-dw-actions__row')
    expect(document.activeElement).toBe(within(panel).getByLabelText('Dagen'))

    fireEvent.keyDown(within(panel).getByLabelText('Dagen'), { key: 'Escape' })

    expect(container.querySelector('.nv-dw-ask--inline')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'schuif' }))
  })

  it('gives focus back to Meer when the action that asked was folded', async () => {
    const withInput = act('schuif', { dagen: { type: 'integer', label: 'Dagen' } })
    const marks: Available = { state: 'x', buttons: buttons(['ja', 'Bevestigen', true]), actions: ['schuif'] }
    const { container } = show(row(marks), { actions: [withInput], onAction: vi.fn(), measure: wide([90, 80], 120) })

    fireEvent.click(screen.getByRole('button', { name: 'Meer' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'schuif' }))
    const panel = container.querySelector('.nv-dw-ask--inline') as HTMLElement
    await waitFor(() => expect(document.activeElement).toBe(within(panel).getByLabelText('Dagen')))
    fireEvent.click(within(panel).getByRole('button', { name: 'Sluiten' }))

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Meer' }))
  })

  it('gives focus back to the action’s button after a run with inputs succeeded', async () => {
    const withInput = act('schuif', { dagen: { type: 'integer', label: 'Dagen' } })
    const onAction = vi.fn().mockResolvedValue(undefined)
    const { container } = show(row({ state: 'x', buttons: [], actions: ['schuif'] }), { actions: [withInput], onAction })
    fireEvent.click(screen.getByRole('button', { name: 'schuif' }))
    const panel = container.querySelector('.nv-dw-ask--inline') as HTMLElement
    fireEvent.change(within(panel).getByLabelText('Dagen'), { target: { value: '3' } })

    fireEvent.click(within(panel).getByRole('button', { name: 'schuif' }))

    await waitFor(() => expect(container.querySelector('.nv-dw-ask--inline')).toBeNull())
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'schuif' }))
  })

  it('moves focus to the row’s first button when the button that was pressed leaves with the new state', async () => {
    const before: Available = { state: 'x', buttons: buttons(['ja', 'Bevestigen', true], ['nee', 'Annuleren']), actions: [] }
    const after: Available = { state: 'y', buttons: buttons(['stop', 'Stoppen']), actions: [] }
    const done = vi.fn()
    const view = (record: Row) => (
      <DrawerWriteContext.Provider value={write}>
        <ActionRow model="actie" row={record} onDone={done} actions={[]} />
      </DrawerWriteContext.Provider>
    )
    press.mockImplementationOnce(() => Promise.resolve())
    const { rerender } = render(view(row(before)))
    const confirm = screen.getByRole('button', { name: 'Bevestigen' })
    confirm.focus()
    fireEvent.click(confirm)
    rerender(view(row(after)))

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Stoppen' })))
  })

  it('attaches its resize watch when the first record had no actions and the next one has', () => {
    const watched: Element[] = []
    const real = globalThis.ResizeObserver
    globalThis.ResizeObserver = class {
      observe(element: Element) {
        watched.push(element)
      }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
    try {
      const view = (record: Row) => (
        <DrawerWriteContext.Provider value={write}>
          <ActionRow model="actie" row={record} onDone={vi.fn()} actions={[]} />
        </DrawerWriteContext.Provider>
      )
      const { rerender, container } = render(view(row({ state: 'x', buttons: [], actions: [] })))
      expect(watched).toHaveLength(0)

      rerender(view(row({ state: 'x', buttons: buttons(['ja', 'Bevestigen', true]), actions: [] })))

      expect(watched).toEqual([container.querySelector('.nv-dw-actions__row')])
    } finally {
      globalThis.ResizeObserver = real
    }
  })
})

describe('the action row and head actions', () => {
  it('leaves an action with a head button to the drawer\'s head', () => {
    const { container } = show(row({ state: 'x', buttons: [], actions: ['kop', 'gewoon'] }), { actions: [{ ...act('kop'), head: { icon: 'log-in' } }, act('gewoon')], onAction: vi.fn() })
    expect(names(container)).toEqual(['gewoon'])
  })
})
