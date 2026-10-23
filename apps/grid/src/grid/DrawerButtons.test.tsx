import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Available, LinkItem, Model, Row, Schema } from '../types'
import { SchemaContext } from './drawer/context'

const remote = vi.hoisted(() => ({ recordCount: vi.fn(() => Promise.resolve(0)), recordHistory: vi.fn((): Promise<unknown[]> => Promise.resolve([])), rowsWhere: vi.fn(() => Promise.resolve({ rows: [], total: 0 })),
  records: vi.fn(), recordLink: vi.fn(), rotateRecordLink: vi.fn(), optionsFrom: vi.fn(),
  attachmentsOf: vi.fn(), uploadAttachment: vi.fn(), removeAttachment: vi.fn(), fileUrl: (id: number) => `/api/attachments/file/${id}`,
}))
vi.mock('../api', () => remote)
const { Drawer } = await import('./Drawer')
const { DrawerWriteContext } = await import('./drawerWrite')
import { columnsFor } from './columns'
import { activity, planning } from './calais.test.data'

afterEach(cleanup)

const model = { ...activity, lifecycle: 'status' } as Model
const columns = columnsFor(model, { ...planning, columns: undefined }, false)
const available = (...buttons: [string, string][]): Available => ({ state: 'open', buttons: buttons.map(([to, label]) => ({ to, label })), actions: [] })
const row = (marks?: Available, links?: LinkItem[]): Row => ({ id: 1, title: 'Lunch bistrot', status: '', fields: { date: '2026-05-18', ...(links ? { members: links } : {}) }, ...(marks ? { available: marks } : {}) })

const press = vi.fn(() => Promise.resolve())
const write = { press, fresh: vi.fn() }
const open = (r: Row, onDone: (() => Promise<Row | null>) | null = vi.fn(), m: Model = model) =>
  render(<DrawerWriteContext.Provider value={write}><Drawer row={r} columns={columns} model={m} onDone={onDone ?? undefined} onClose={() => undefined} /></DrawerWriteContext.Provider>)

describe('the drawer’s buttons', () => {
  it('shows the row’s marked buttons and no others', () => {
    open(row(available(['klaar', 'Afronden'], ['weg', 'Weg'])))
    const drawer = screen.getByRole('complementary', { name: 'Lunch bistrot' })
    expect(within(drawer).getAllByRole('button', { name: /^(Afronden|Weg)$/ }).map((b) => b.textContent)).toEqual(['Afronden', 'Weg'])
  })

  it('shows none for a transition with only a label: the server marks no button for it', () => {
    open(row(available()))
    expect(screen.queryByRole('button', { name: 'Afronden' })).toBeNull()
  })

  it('shows none where the host gives no way to re-read, as the matrix’s drawers', () => {
    open(row(available(['klaar', 'Afronden'])), null)
    expect(screen.queryByRole('button', { name: 'Afronden' })).toBeNull()
  })

  it('presses with the marks it was given and re-reads through onDone', () => {
    press.mockClear()
    const onDone = vi.fn()
    const marks = available(['klaar', 'Afronden'])
    open(row(marks), onDone)
    fireEvent.click(screen.getByRole('button', { name: 'Afronden' }))
    expect(press).toHaveBeenCalledExactlyOnceWith(model.key, 1, marks, 'klaar', onDone)
  })

  it('gives each link item its detail line and its own buttons, pressed on the link record', () => {
    press.mockClear()
    const item: LinkItem = { id: 9, target: 4, title: 'Ann', state: 'open', available: available(['skip', 'Niet nu']), detail: '4 plugins' }
    const link = { item: 'Lid', dataset: 'tie', key: 'activity_id', target: 'member_id', target_dataset: 'member' }
    const withLink: Model = { ...model, fields: { ...model.fields, members: { type: 'links', label: 'Leden', link } as unknown as Model['fields'][string] } }
    const cols = columnsFor(withLink, { ...planning, columns: undefined }, false)
    const onDone = vi.fn()
    const schema = { models: { tie: { key: 'tie', label: 'Tie', fields: {} } }, tables: [], views: [] } as unknown as Schema
    render(<SchemaContext.Provider value={schema}><DrawerWriteContext.Provider value={write}>
      <Drawer row={row(undefined, [item])} columns={cols} model={withLink} onDone={onDone} onClose={() => undefined} />
    </DrawerWriteContext.Provider></SchemaContext.Provider>)

    expect(screen.getByText('4 plugins')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Niet nu' }))
    expect(press).toHaveBeenCalledExactlyOnceWith('tie', 9, item.available, 'skip', onDone)
  })

  it('disables its buttons while a press is in flight, so a double click is one press', async () => {
    let answer: () => void = () => undefined
    press.mockClear()
    press.mockImplementationOnce(() => new Promise<void>((resolve) => { answer = resolve }))
    open(row(available(['klaar', 'Afronden'], ['weg', 'Weg'])))

    fireEvent.click(screen.getByRole('button', { name: 'Afronden' }))
    fireEvent.click(screen.getByRole('button', { name: 'Afronden' }))
    fireEvent.click(screen.getByRole('button', { name: 'Weg' }))

    expect(press).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Weg' })).toHaveProperty('disabled', true)
    await act(async () => answer())
    expect(screen.getByRole('button', { name: 'Weg' })).toHaveProperty('disabled', false)
  })
})
