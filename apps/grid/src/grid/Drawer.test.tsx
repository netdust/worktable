import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Model, ModelAction, Row, Schema } from '../types'
import { SchemaContext } from './drawer/context'
import { RelationContext } from './cells/Relation'

const remote = vi.hoisted(() => ({ recordCount: vi.fn(() => Promise.resolve(0)), recordHistory: vi.fn((): Promise<unknown[]> => Promise.resolve([])), rowsWhere: vi.fn(() => Promise.resolve({ rows: [], total: 0 })), 
  records: vi.fn(), recordLink: vi.fn(), rotateRecordLink: vi.fn(), optionsFrom: vi.fn(),
  attachmentsOf: vi.fn(), uploadAttachment: vi.fn(), removeAttachment: vi.fn(), fileUrl: (id: number) => `/api/attachments/file/${id}`,
}))
vi.mock('../api', () => remote)
const { Drawer, linkedDataset } = await import('./Drawer')
import { columnsFor } from './columns'
import type { Flag, Flags } from '../ui/useFlags'
import type { WriteLink } from './drawer/Sections'
import { activity, planning } from './calais.test.data'
import { pressAction, pressTool } from '../test-setup'

const row = (id: number, title: string): Row => ({ id, title, status: 'publish', fields: { date: '2026-05-18', notes: 'Twee veggie' } })
const columns = columnsFor(activity, { ...planning, columns: undefined }, false)

afterEach(cleanup)

describe('the drawer as the prototypes draw it', () => {
  const model = { ...activity, fields: { ...activity.fields } } as Model
  const rows = [row(1, 'Lunch bistrot'), row(2, 'Montage'), row(3, 'Diner')]

  it('heads with its dataset, its place in the view, and steps with the buttons and with j and k', () => {
    const onStep = vi.fn()
    render(<Drawer row={rows[0]} columns={columns} model={model} nav={{ ids: rows.map((r) => r.id), onStep }} onClose={() => undefined} />)
    const drawer = screen.getByRole('complementary', { name: 'Lunch bistrot' })
    expect(drawer.querySelector('.nv-dw-head__kind')?.textContent).toContain(model.label)
    expect(drawer.querySelector('.nv-dw-head__pos')?.textContent).toBe('1 van 3')
    expect(within(drawer).getByRole('button', { name: 'Vorige' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(within(drawer).getByRole('button', { name: 'Volgende' }))
    expect(onStep).toHaveBeenLastCalledWith(2)
    fireEvent.keyDown(within(drawer).getByRole('button', { name: 'Volgende' }), { key: 'j' })
    expect(onStep).toHaveBeenLastCalledWith(2)
    onStep.mockClear()
    fireEvent.keyDown(within(drawer).getByRole('button', { name: 'Volgende' }), { key: 'k' })
    expect(onStep).not.toHaveBeenCalled()
  })

  it('puts the dataset\'s rail icon before its name where the record has no kind', () => {
    const bare = { ...model, fields: {} } as Model
    const schema = { models: { [bare.key]: bare }, tables: [{ key: bare.key, label: bare.label, model: bare.key, icon: 'users' }], views: [] } as unknown as Schema
    render(<SchemaContext.Provider value={schema}><Drawer row={rows[0]} columns={columns} model={bare} onClose={() => undefined} /></SchemaContext.Provider>)
    const head = screen.getByRole('complementary', { name: 'Lunch bistrot' }).querySelector('.nv-dw-head__kind')!
    expect(head.querySelector('svg.lucide-users')).not.toBeNull()
    expect(head.textContent).toBe(bare.label)
  })

  it('steps with j and k from anywhere in its head, the close button the grid focuses too', () => {
    const onStep = vi.fn()
    render(<Drawer row={rows[1]} columns={columns} model={model} nav={{ ids: rows.map((r) => r.id), onStep }} onClose={() => undefined} />)
    const close = within(screen.getByRole('complementary', { name: 'Montage' })).getByRole('button', { name: 'Sluiten' })
    fireEvent.keyDown(close, { key: 'j' })
    expect(onStep).toHaveBeenLastCalledWith(3)
    fireEvent.keyDown(close, { key: 'ArrowUp' })
    expect(onStep).toHaveBeenLastCalledWith(1)
  })

  it('says "–" and steps nowhere once its row left the view, and shows no position without one', () => {
    const { rerender } = render(<Drawer row={row(9, 'Weg')} columns={columns} model={model} nav={{ ids: [1, 2], onStep: vi.fn() }} onClose={() => undefined} />)
    const drawer = screen.getByRole('complementary', { name: 'Weg' })
    expect(drawer.querySelector('.nv-dw-head__pos')?.textContent).toBe('–')
    expect(within(drawer).getByRole('button', { name: 'Volgende' }).hasAttribute('disabled')).toBe(true)
    rerender(<Drawer row={row(9, 'Weg')} columns={columns} model={model} onClose={() => undefined} />)
    expect(screen.getByRole('complementary', { name: 'Weg' }).querySelector('.nv-dw-head__pos')).toBeNull()
  })

  it('reads a record\'s history, and none of a query\'s row, which the engine keeps none of', async () => {
    remote.recordHistory.mockResolvedValueOnce([{ batch: 'b1', at: '2026-10-12T16:20:00Z', by: 'account', actor: 'noor@lantaarn.test', undoable: false, others: 0, batch_kind: null, created: false, record: { id: 1, title: 'Lunch bistrot' }, changes: [{ field: 'notes', label: 'Notities', old: '', new: 'Twee veggie' }] }])
    const { rerender } = render(<Drawer row={rows[0]} columns={columns} model={model} onClose={() => undefined} />)
    const history = await screen.findByRole('region', { name: 'Geschiedenis' })
    expect(history.textContent).toContain('noor zette notities op Twee veggie')
    expect(remote.recordHistory).toHaveBeenLastCalledWith(model.key, 1)
    rerender(<Drawer row={rows[0]} columns={columns} model={{ ...model, query: true }} onClose={() => undefined} />)
    expect(screen.queryByRole('region', { name: 'Geschiedenis' })).toBeNull()
  })

  it('widens over the work and comes back with Escape, before Escape closes it', () => {
    const onClose = vi.fn()
    render(<Drawer row={rows[0]} columns={columns} model={model} onClose={onClose} />)
    const drawer = screen.getByRole('complementary', { name: 'Lunch bistrot' })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Volledig openen' }))
    expect(drawer.classList.contains('nv-drawer--wide')).toBe(true)
    fireEvent.keyDown(drawer, { key: 'Escape' })
    expect(drawer.classList.contains('nv-drawer--wide')).toBe(false)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(drawer, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it("the subline's space bar takes the space record's tone", async () => {
    const team = {
      key: 'team', label: 'Teams', title_label: 'Naam', title_readonly: false, tone: 'colour',
      fields: { colour: { type: 'select', label: 'Kleur', required: false, options: { violet: 'Paars' }, tones: { violet: 'violet' } } },
    } as unknown as Model
    const job = { ...model, key: 'job', fields: { team_id: { type: 'relation', label: 'Team', required: true, relation: { model: 'team', multiple: false } } } } as unknown as Model
    const schema = { models: { job, team }, tables: [], views: [], space: { model: 'team', field: 'team_id' } } as unknown as Schema
    const record: Row = { id: 8, title: 'Opbouw', status: '', fields: { team_id: 4 }, lookups: { team_id: { id: 4, title: 'Blauw team', status: '', fields: {} } } }
    remote.records.mockResolvedValue({ rows: [{ id: 4, title: 'Blauw team', status: '', fields: { colour: 'violet' } }], total: 1 })
    render(<SchemaContext.Provider value={schema}><Drawer row={record} columns={columnsFor(job, { ...planning, columns: undefined }, false)} model={job} onClose={() => undefined} /></SchemaContext.Provider>)
    const bar = () => screen.getByRole('complementary', { name: 'Opbouw' }).querySelector('.nv-dw-sub__space i') as HTMLElement
    await waitFor(() => expect(bar().style.getPropertyValue('--c')).toBe('var(--tone-violet)'))
    expect(bar().parentElement?.textContent).toBe('Blauw team')
    expect(remote.records).toHaveBeenCalledWith('team', '')
  })
})

describe('the drawer', () => {
  it('reads a record whole without an editor, as the grid has it', () => {
    const { container } = render(<Drawer row={row(1, 'Lunch bistrot')} columns={columns} onClose={() => undefined} />)
    const drawer = screen.getByRole('complementary', { name: 'Lunch bistrot' })

    expect(within(drawer).getByRole('heading', { name: 'Lunch bistrot' })).toBeTruthy()
    expect(within(drawer).getByText('Twee veggie')).toBeTruthy()
    // The filled fields show; the empty ones fold under one quiet line that unfolds them. The long text is a block of its own.
    const filled = container.querySelectorAll('.nv-drawer__field').length
    const fold = within(drawer).getByRole('button', { name: /^\+ \d+ andere velden$/ })
    fireEvent.click(fold)
    expect(container.querySelectorAll('.nv-drawer__field').length).toBe(columns.length - 2)
    expect(filled).toBeLessThan(columns.length - 2)
    expect(container.querySelector('.nv-drawer__editor')).toBeNull()
  })

  it('renders an editor under the fields', () => {
    render(<Drawer row={row(1, 'Lunch bistrot')} columns={[]} editor={<p>the editor</p>} onClose={() => undefined} />)
    const drawer = screen.getByRole('complementary', { name: 'Lunch bistrot' })

    expect(within(drawer).getByText('the editor').closest('.nv-drawer__editor')).not.toBeNull()
  })

  it('focuses its close button on a row change by default', () => {
    const { rerender } = render(<Drawer row={row(1, 'a')} columns={columns} onClose={() => undefined} />)
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Sluiten')

    ;(document.activeElement as HTMLElement).blur()
    rerender(<Drawer row={row(2, 'b')} columns={columns} onClose={() => undefined} />)
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Sluiten')
  })

  it('leaves focus where it was when focusOnOpen is false', () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()
    const { rerender } = render(<Drawer row={row(1, 'a')} columns={[]} focusOnOpen={false} onClose={() => undefined} />)
    rerender(<Drawer row={row(2, 'b')} columns={[]} focusOnOpen={false} onClose={() => undefined} />)

    expect(document.activeElement).toBe(outside)
    outside.remove()
  })

  it("leaves focus where it is when the open row's title changes", () => {
    const { rerender } = render(<Drawer row={row(1, 'Montage')} columns={columns} onClose={() => undefined} />)
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()

    rerender(<Drawer row={row(1, 'Montage zaal')} columns={columns} onClose={() => undefined} />)

    expect(document.activeElement).toBe(outside)
    outside.remove()
  })

  it('focuses its close button for another row of the same title', () => {
    const { rerender } = render(<Drawer row={row(1, 'Montage')} columns={columns} onClose={() => undefined} />)
    ;(document.activeElement as HTMLElement).blur()

    rerender(<Drawer row={row(2, 'Montage')} columns={columns} onClose={() => undefined} />)

    expect(document.activeElement?.getAttribute('aria-label')).toBe('Sluiten')
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<Drawer row={row(1, 'a')} columns={[]} onClose={onClose} />)

    fireEvent.keyDown(screen.getByRole('complementary'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('leaves an open list in it to Escape first', () => {
    const onClose = vi.fn()
    render(<Drawer row={row(1, 'a')} columns={[]} editor={<div role="combobox" aria-expanded="true" tabIndex={0}>list</div>} onClose={onClose} />)

    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('a long text in the drawer', () => {
  const people = { type: 'links', label: 'Mensen', required: false, fact: false, link: { item: 'Toewijzing', dataset: 'assignment', key: 'activity_id', target: 'person_id', target_dataset: 'person' } }
  const model = { ...activity, fields: { ...activity.fields, people } } as Model
  const every = columnsFor(model, { ...planning, columns: undefined }, false)
  const noted = (notes: string): Row => ({ id: 1, title: 'Lunch bistrot', status: 'publish', fields: { date: '2026-05-18', notes, people: [] } })
  const block = () => screen.getByRole('region', { name: 'Notities' })
  const area = () => screen.queryByRole('textbox', { name: 'Notities' }) as HTMLTextAreaElement | null

  it('shows the text as its own section after the people, titled by its label, and as no field line', () => {
    const { container } = render(<Drawer row={noted('Zaal open om 19:30.\nParkeren op de laadkade.')} columns={every} model={model} onClose={() => undefined} />)
    const sections = [...container.querySelectorAll('section.nv-dw-sec')].map((s) => s.getAttribute('aria-label'))

    expect(sections.indexOf('Notities')).toBe(sections.indexOf('Mensen') + 1)
    expect(block().querySelector('.nv-dw-long')?.textContent).toBe('Zaal open om 19:30.\nParkeren op de laadkade.')
    fireEvent.click(screen.getByRole('button', { name: /^\+ \d+ andere velden$/ }))
    expect([...container.querySelectorAll('.nv-drawer__field dt')].map((dt) => dt.textContent)).not.toContain('Notities')
  })

  it('reads only without a way to write, or on a readonly field: no button, and no block at all while it is empty', () => {
    const readonly = { ...model, fields: { ...model.fields, notes: { ...model.fields.notes, readonly: true } } } as Model
    const { rerender } = render(<Drawer row={noted('Twee veggie')} columns={every} model={model} onClose={() => undefined} />)
    expect(within(block()).queryByRole('button')).toBeNull()
    rerender(<Drawer row={noted('Twee veggie')} columns={every} model={readonly} onClose={() => undefined} onWrite={vi.fn()} />)
    expect(within(block()).queryByRole('button')).toBeNull()
    rerender(<Drawer row={noted('')} columns={every} model={model} onClose={() => undefined} />)
    expect(screen.queryByRole('region', { name: 'Notities' })).toBeNull()
    rerender(<Drawer row={noted('')} columns={every} model={readonly} onClose={() => undefined} onWrite={vi.fn()} />)
    expect(screen.queryByRole('region', { name: 'Notities' })).toBeNull()
  })

  it('keeps an empty block where it can be written, so a first note can be added', () => {
    render(<Drawer row={noted('')} columns={every} model={model} onClose={() => undefined} onWrite={vi.fn()} />)
    expect(within(block()).getByRole('button', { name: 'Nog geen notities. Klik om er een toe te voegen.' })).toBeTruthy()
  })

  it('asks for a first text where it is empty, opens its field in its place, and writes on Cmd+Enter, not on Enter', async () => {
    const onWrite = vi.fn()
    render(<Drawer row={noted('')} columns={every} model={model} onClose={() => undefined} onWrite={onWrite} />)

    fireEvent.click(within(block()).getByRole('button', { name: 'Nog geen notities. Klik om er een toe te voegen.' }))
    expect(block().contains(area())).toBe(true)
    // A click without a pointer is a virtual one: React Aria focuses the field a frame later.
    await waitFor(() => expect(document.activeElement).toBe(area()))
    fireEvent.change(area()!, { target: { value: 'Parkeren op de laadkade' } })
    fireEvent.keyDown(area()!, { key: 'Enter' })
    expect(onWrite).not.toHaveBeenCalled()
    fireEvent.keyDown(area()!, { key: 'Enter', metaKey: true })

    expect(onWrite).toHaveBeenCalledTimes(1)
    expect(onWrite).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), expect.objectContaining({ field: 'notes' }), 'Parkeren op de laadkade')
    expect(area()).toBeNull()
    expect(document.activeElement).toBe(within(block()).getByRole('button'))
  })

  it('writes on leaving for elsewhere, and nothing when the text is as it was', async () => {
    const onWrite = vi.fn()
    render(<Drawer row={noted('Twee veggie')} columns={every} model={model} onClose={() => undefined} onWrite={onWrite} />)
    const outside = document.body.appendChild(document.createElement('button'))

    fireEvent.click(within(block()).getByRole('button', { name: 'Twee veggie' }))
    expect(area()?.value).toBe('Twee veggie')
    await waitFor(() => expect(document.activeElement).toBe(area()))
    act(() => outside.focus())
    expect(onWrite).not.toHaveBeenCalled()
    expect(area()).toBeNull()

    fireEvent.click(within(block()).getByRole('button', { name: 'Twee veggie' }))
    fireEvent.change(area()!, { target: { value: 'Drie veggie' } })
    await waitFor(() => expect(document.activeElement).toBe(area()))
    act(() => outside.focus())
    expect(onWrite).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), expect.objectContaining({ field: 'notes' }), 'Drie veggie')
    outside.remove()
  })

  it('Escape leaves the edit without a write, and the drawer stays open', () => {
    const onWrite = vi.fn()
    const onClose = vi.fn()
    render(<Drawer row={noted('Twee veggie')} columns={every} model={model} onClose={onClose} onWrite={onWrite} />)

    fireEvent.click(within(block()).getByRole('button', { name: 'Twee veggie' }))
    fireEvent.change(area()!, { target: { value: 'weg' } })
    fireEvent.keyDown(area()!, { key: 'Escape' })

    expect(area()).toBeNull()
    expect(onWrite).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(block().querySelector('.nv-dw-long')?.textContent).toBe('Twee veggie')
    expect(document.activeElement).toBe(within(block()).getByRole('button'))
  })
})

describe('a flag in the drawer', () => {
  const people = { type: 'links', label: 'Mensen', required: false, fact: false, link: { item: 'Toewijzing', dataset: 'assignment', key: 'activity_id', target: 'person_id', target_dataset: 'person' } }
  const model = { ...activity, fields: { ...activity.fields, people } } as Model
  const every = columnsFor(model, { ...planning, columns: undefined }, false)
  const crew = [{ id: 11, target: 5, title: 'Sien Peeters', state: null }, { id: 12, target: 6, title: 'Lieve Claes', state: null }]
  const staffed = (id: number, title: string): Row => ({ id, title, status: 'publish', fields: { date: '2026-05-18', people: crew } })
  const flag = (text: string, marks: Record<string, number>): Flag => ({ text, tone: 'bad', label: 'Melding', marks })
  const raised = [flag('Sien staat dubbel ingepland.', { activity: 1, assignment: 11 }), flag('Montage overlapt.', { activity: 2 })]
  const flags: Flags = {
    marksOf: (dataset, id) => raised.filter((f) => f.marks[dataset] === id),
    count: () => 0,
    source: 'meldingen',
    label: 'Meldingen',
  }
  const band = () => screen.queryByRole('alert')

  it("shows the record's flag as a band under its title with Negeren only, which hides it in the open drawer and stores nothing", () => {
    const { unmount } = render(<Drawer row={staffed(1, 'Lunch bistrot')} columns={every} model={model} flags={flags} onClose={() => undefined} />)
    expect(band()?.querySelector('.nv-dw-alert__head')?.textContent).toBe('Melding')
    expect(band()?.querySelector('.nv-dw-alert__text')?.textContent).toBe('Sien staat dubbel ingepland.')
    expect([...band()!.querySelectorAll('.nv-dw-alert__acts button')].map((b) => b.textContent)).toEqual(['Negeren'])
    expect(screen.queryByRole('button', { name: 'Iemand anders kiezen' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Negeren' }))
    expect(band()).toBeNull()
    unmount()

    render(<Drawer row={staffed(1, 'Lunch bistrot')} columns={every} model={model} flags={flags} onClose={() => undefined} />)
    expect(band()).not.toBeNull()
  })

  it("moves the focus to the drawer's close button once Negeren took the band away, so Escape still closes the drawer", () => {
    const onClose = vi.fn()
    render(<Drawer row={staffed(1, 'Lunch bistrot')} columns={every} model={model} flags={flags} onClose={onClose} />)
    const negeren = screen.getByRole('button', { name: 'Negeren' })
    negeren.focus()
    fireEvent.click(negeren)

    const sluiten = screen.getByRole('button', { name: 'Sluiten' })
    expect(document.activeElement).toBe(sluiten)
    fireEvent.keyDown(sluiten, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps hiding the flag Negeren hid after a re-read that lists the flags in another order', () => {
    const two = [flag('Sien staat dubbel ingepland.', { activity: 1, assignment: 11 }), flag('Lieve is afwezig.', { activity: 1, assignment: 12 })]
    const read = (list: Flag[]): Flags => ({ ...flags, marksOf: (dataset, id) => list.filter((f) => f.marks[dataset] === id) })
    const texts = () => screen.queryAllByRole('alert').map((a) => a.querySelector('.nv-dw-alert__text')?.textContent)
    const { rerender } = render(<Drawer row={staffed(1, 'Lunch bistrot')} columns={every} model={model} flags={read(two)} onClose={() => undefined} />)
    fireEvent.click(within(screen.getAllByRole('alert')[0]).getByRole('button', { name: 'Negeren' }))
    expect(texts()).toEqual(['Lieve is afwezig.'])

    rerender(<Drawer row={staffed(1, 'Lunch bistrot')} columns={every} model={model} flags={read(two.toReversed())} onClose={() => undefined} />)
    expect(texts()).toEqual(['Lieve is afwezig.'])
  })

  it("shows another record's own band once the drawer steps to it, and none on a record without a flag", () => {
    const { rerender } = render(<Drawer row={staffed(1, 'Lunch bistrot')} columns={every} model={model} flags={flags} onClose={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'Negeren' }))
    rerender(<Drawer row={staffed(2, 'Montage')} columns={every} model={model} flags={flags} onClose={() => undefined} />)
    expect(band()?.querySelector('.nv-dw-alert__text')?.textContent).toBe('Montage overlapt.')
    rerender(<Drawer row={staffed(3, 'Diner')} columns={every} model={model} flags={flags} onClose={() => undefined} />)
    expect(band()).toBeNull()
  })

  it('marks a flagged person in its people with the flag, its text in place of their role', () => {
    render(<Drawer row={staffed(1, 'Lunch bistrot')} columns={every} model={model} flags={flags} onClose={() => undefined} />)
    const [sien, lieve] = within(screen.getByRole('region', { name: 'Mensen' })).getAllByRole('listitem')
    const mark = sien.querySelector('.nv-flag')
    expect(mark?.textContent).toBe('Melding')
    expect(mark?.getAttribute('title')).toBe('Sien staat dubbel ingepland.')
    expect(sien.querySelector('small')?.textContent).toBe('Sien staat dubbel ingepland.')
    expect(lieve.querySelector('.nv-flag')).toBeNull()
  })

  describe('"Iemand anders kiezen"', () => {
    const from = { source: 'candidates', match: { assignment_id: 'id' }, value: 'person_id' }
    const person = { type: 'relation', label: 'Persoon', required: false, fact: true, relation: { model: 'person', multiple: false } }
    const assignment = (target: object) => ({ key: 'assignment', label: 'Plaatsen', title_label: 'Titel', title_readonly: true, fields: { person_id: { ...person, ...target } } }) as unknown as Model
    const schemaOf = (writable = true, target: object = { options_from: from }) =>
      ({ models: { [model.key]: model, assignment: assignment(target) }, tables: [], views: [], writable: { assignment: writable } }) as unknown as Schema
    const open = (schema: Schema, onLink?: WriteLink, record = staffed(1, 'Lunch bistrot')) =>
      render(<SchemaContext.Provider value={schema}><Drawer row={record} columns={every} model={model} flags={flags} onLink={onLink} onClose={() => undefined} /></SchemaContext.Provider>)
    const acts = () => [...band()!.querySelectorAll('.nv-dw-alert__acts button')].map((b) => b.textContent)
    const mensen = () => within(screen.getByRole('region', { name: 'Mensen' }))

    it('stands beside Negeren where the flag marks a place of a link whose target column offers candidates', () => {
      open(schemaOf(), vi.fn())
      expect(acts()).toEqual(['Iemand anders kiezen', 'Negeren'])
    })

    it.each([
      ['a flag on the record only', () => open(schemaOf(), vi.fn(), staffed(2, 'Montage'))],
      ['a link dataset the caller cannot write', () => open(schemaOf(false), vi.fn())],
      ['a target column without candidates', () => open(schemaOf(true, {}), vi.fn())],
      ['a readonly target column', () => open(schemaOf(true, { options_from: from, readonly: true }), vi.fn())],
      ['a drawer that cannot write', () => open(schemaOf())],
    ])('is absent on %s: Negeren alone', (_case, arrange) => {
      arrange()
      expect(acts()).toEqual(['Negeren'])
    })

    it("opens the picker in place on the marked person, listing the place's candidates; a pick writes that place once", async () => {
      remote.optionsFrom.mockResolvedValueOnce([{ id: 7, title: 'Noor Janssens', status: '', fields: {} }])
      const onLink = vi.fn<WriteLink>().mockResolvedValue(undefined)
      open(schemaOf(), onLink)

      fireEvent.click(screen.getByRole('button', { name: 'Iemand anders kiezen' }))
      // An open combobox hides the rest of the page from a screen reader: the rows are read as elements.
      const [sien, lieve] = screen.getByRole('region', { name: 'Mensen' }).querySelectorAll('li')
      expect(within(sien).getByRole('combobox', { name: 'Persoon' })).toBeTruthy()
      expect(sien.querySelector('.nv-flag')?.textContent).toBe('Melding')
      expect(lieve.textContent).toContain('Lieve Claes')
      expect(lieve.querySelector('[role="combobox"]')).toBeNull()

      const noor = await screen.findByRole('option', { name: 'Noor Janssens' })
      expect(remote.optionsFrom).toHaveBeenCalledExactlyOnceWith(from, expect.objectContaining({ id: 11 }))
      await act(async () => fireEvent.click(noor))
      expect(onLink).toHaveBeenCalledExactlyOnceWith(people.link, 11, 7)
      expect(screen.queryByRole('combobox')).toBeNull()
    })

    it('Escape leaves the picker and writes nothing', () => {
      remote.optionsFrom.mockResolvedValueOnce([])
      const onLink = vi.fn<WriteLink>()
      open(schemaOf(), onLink)
      fireEvent.click(screen.getByRole('button', { name: 'Iemand anders kiezen' }))
      fireEvent.keyDown(mensen().getByRole('combobox', { name: 'Persoon' }), { key: 'Escape' })

      expect(screen.queryByRole('combobox')).toBeNull()
      expect(mensen().getAllByRole('listitem')[0].textContent).toContain('Sien Peeters')
      expect(onLink).not.toHaveBeenCalled()
    })
  })
})

describe("the drawer's actions", () => {
  const apply: ModelAction = { name: 'sjabloon_toepassen', label: 'Sjabloon toepassen', input: { sjabloon_id: { relation: 'sjabloon', label: 'Sjabloon' } } }
  const speeldag: Row = { id: 4, title: 'speeldag op locatie', status: '', fields: {} }

  async function pickSjabloon() {
    remote.records.mockResolvedValue({ rows: [speeldag], total: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Sjabloon: —' }))
    fireEvent.click(await screen.findByRole('option', { name: 'speeldag op locatie' }))
  }

  it('shows a button per action with a picker per input, run only once each input is picked', async () => {
    const onAction = vi.fn().mockResolvedValue(undefined)
    render(<Drawer row={row(3, 'Calais')} columns={[]} actions={[apply]} onAction={onAction} onClose={() => undefined} />)
    expect(screen.queryByRole('group', { name: 'Sjabloon toepassen' })).toBeNull()
    await pressAction('Sjabloon toepassen')
    const group = screen.getByRole('group', { name: 'Sjabloon toepassen' })
    const run = within(group).getByRole('button', { name: 'Sjabloon toepassen' })
    expect(run.hasAttribute('disabled')).toBe(true)

    await pickSjabloon()
    expect(remote.records).toHaveBeenCalledWith('sjabloon', '')
    expect(within(group).getByRole('button', { name: 'Sjabloon: speeldag op locatie' })).toBeTruthy()
    await act(async () => {
      fireEvent.click(run)
    })

    expect(onAction).toHaveBeenCalledExactlyOnceWith(apply, { sjabloon_id: 4 })
  })

  it('puts focus in the inputs panel when it opens: on the first input, not on the close button', async () => {
    const shift: ModelAction = { name: 'verschuiven', label: 'Verschuiven', input: { dagen: { type: 'integer', label: 'Dagen' } } }
    render(<Drawer row={row(3, 'Calais')} columns={[]} actions={[shift]} onAction={vi.fn().mockResolvedValue(undefined)} onClose={() => undefined} />)

    await pressAction('Verschuiven')

    expect(document.activeElement).toBe(screen.getByLabelText('Dagen'))
  })

  it('closes the inputs panel from its close button, and gives focus back to the action’s button in the row', async () => {
    render(<Drawer row={row(3, 'Calais')} columns={[]} actions={[apply]} onAction={vi.fn().mockResolvedValue(undefined)} onClose={() => undefined} />)
    await pressAction('Sjabloon toepassen')
    const panel = document.querySelector('.nv-dw-ask--inline') as HTMLElement
    expect(panel).not.toBeNull()

    fireEvent.click(within(panel).getByRole('button', { name: 'Sluiten' }))

    expect(document.querySelector('.nv-dw-ask--inline')).toBeNull()
    expect(document.activeElement).toBe(within(document.querySelector('.nv-dw-actions__row') as HTMLElement).getByRole('button', { name: 'Sjabloon toepassen' }))
  })

  it("says a refusal under the action, in the writer's words", async () => {
    const onAction = vi.fn().mockRejectedValue({ code: 'refused', message: 'Dit sjabloon is al toegepast.' })
    render(<Drawer row={row(3, 'Calais')} columns={[]} actions={[apply]} onAction={onAction} onClose={() => undefined} />)
    await pressAction('Sjabloon toepassen')

    await pickSjabloon()
    await act(async () => {
      fireEvent.click(within(screen.getByRole('group', { name: 'Sjabloon toepassen' })).getByRole('button', { name: 'Sjabloon toepassen' }))
    })

    expect(screen.getByRole('alert').textContent).toBe('Dit sjabloon is al toegepast.')
  })

  const shift: ModelAction = {
    name: 'tourstop_verschuiven',
    label: 'Tourstop verschuiven',
    input: { dagen: { type: 'integer', label: 'Dagen', min: -365, max: 365 }, stil: { type: 'boolean', label: 'Stil', required: false } },
  }

  it('takes a typed input as a field, sends it as its value, and leaves an optional one out', async () => {
    const onAction = vi.fn().mockResolvedValue(undefined)
    render(<Drawer row={row(3, 'Calais')} columns={[]} actions={[shift]} onAction={onAction} onClose={() => undefined} />)
    await pressAction('Tourstop verschuiven')
    const group = screen.getByRole('group', { name: 'Tourstop verschuiven' })
    const run = within(group).getByRole('button', { name: 'Tourstop verschuiven' })
    expect(run.hasAttribute('disabled')).toBe(true)

    fireEvent.change(within(group).getByLabelText('Dagen'), { target: { value: '400' } })
    expect(run.hasAttribute('disabled')).toBe(true)
    fireEvent.change(within(group).getByLabelText('Dagen'), { target: { value: '-3' } })
    await act(async () => {
      fireEvent.click(run)
    })
    expect(onAction).toHaveBeenCalledExactlyOnceWith(shift, { dagen: -3 })

    await waitFor(() => expect(screen.queryByRole('group', { name: 'Tourstop verschuiven' })).toBeNull())
    await pressAction('Tourstop verschuiven')
    const again = screen.getByRole('group', { name: 'Tourstop verschuiven' })
    fireEvent.change(within(again).getByLabelText('Dagen'), { target: { value: '-3' } })
    fireEvent.click(within(again).getByLabelText('Stil'))
    await act(async () => {
      fireEvent.click(within(again).getByRole('button', { name: 'Tourstop verschuiven' }))
    })
    expect(onAction).toHaveBeenLastCalledWith(shift, { dagen: -3, stil: true })
  })

  it('starts a required yes/no unticked as false, so it runs without a tick', async () => {
    const confirm: ModelAction = { name: 'bevestigen', label: 'Bevestigen', input: { mail: { type: 'boolean', label: 'Mail sturen' } } }
    const onAction = vi.fn().mockResolvedValue(undefined)
    render(<Drawer row={row(3, 'Calais')} columns={[]} actions={[confirm]} onAction={onAction} onClose={() => undefined} />)
    await pressAction('Bevestigen')
    const group = screen.getByRole('group', { name: 'Bevestigen' })
    expect((within(group).getByLabelText('Mail sturen') as HTMLInputElement).checked).toBe(false)
    const run = within(group).getByRole('button', { name: 'Bevestigen' })
    expect(run.hasAttribute('disabled')).toBe(false)
    await act(async () => {
      fireEvent.click(run)
    })
    expect(onAction).toHaveBeenCalledExactlyOnceWith(confirm, { mail: false })
  })

  it('offers no action without a way to run it, nor on a model that declares none', () => {
    const { rerender } = render(<Drawer row={row(3, 'Calais')} columns={[]} actions={[apply]} onClose={() => undefined} />)
    expect(screen.queryByRole('button', { name: 'Acties' })).toBeNull()

    rerender(<Drawer row={row(3, 'Calais')} columns={[]} onAction={vi.fn()} onClose={() => undefined} />)
    expect(screen.queryByRole('button', { name: 'Acties' })).toBeNull()
  })
})

describe("a person's link in the drawer", () => {
  const persoon = (record_link?: true): Model => ({ key: 'persoon', label: 'Personen', title_label: 'Naam', title_readonly: true, fields: {}, ...(record_link ? { record_link } : {}) })
  const LINK = 'http://grid.test/#/link/persoon.3.abc'

  it('is offered to an administrator on a dataset declaring record_link only', () => {
    expect(linkedDataset('administrator', persoon(true))).toBe('persoon')
    expect(linkedDataset('editor', persoon(true))).toBeUndefined()
    expect(linkedDataset('owner', persoon(true))).toBeUndefined()
    expect(linkedDataset('administrator', persoon())).toBeUndefined()
  })

  it('shows no link controls without a linked dataset', () => {
    render(<Drawer row={row(3, 'Noor Claes')} columns={[]} onClose={() => undefined} />)
    expect(screen.queryByRole('button', { name: 'Acties' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Link kopiëren' })).toBeNull()
  })

  it('"Link kopiëren" reads the current link and copies it; "Nieuwe link" rotates and copies the new one', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    remote.recordLink.mockResolvedValue(LINK)
    remote.rotateRecordLink.mockResolvedValue(`${LINK}-new`)
    const onSaid = vi.fn()
    render(<Drawer row={row(3, 'Noor Claes')} columns={[]} recordLink="persoon" onSaid={onSaid} onClose={() => undefined} />)
    expect(screen.getByRole('complementary', { name: 'Noor Claes' }).querySelector('.nv-dw-body')?.textContent).not.toContain('Link kopiëren')

    await act(async () => { await pressTool('Link kopiëren') })
    expect(remote.recordLink).toHaveBeenCalledExactlyOnceWith('persoon', 3)
    expect(writeText).toHaveBeenLastCalledWith(LINK)
    expect(onSaid).toHaveBeenLastCalledWith('Link gekopieerd')

    await act(async () => { await pressTool('Nieuwe link') })
    expect(remote.rotateRecordLink).toHaveBeenCalledExactlyOnceWith('persoon', 3)
    expect(writeText).toHaveBeenLastCalledWith(`${LINK}-new`)
    expect(onSaid).toHaveBeenLastCalledWith('Nieuwe link gekopieerd; de vorige werkt niet meer')
  })
})

describe("a record's files in the drawer", () => {
  const files = { dataset: 'activity', kinds: { rider: 'Rider', foto: 'Foto' }, max_mb: 20, writable: true as const, version: '0' }
  const rider = { id: 7, kind: 'rider', name: 'rider.pdf', mime: 'application/pdf', size: 48_000, own: true, created_at: '2026-10-01 09:00:00' }
  const photo = { id: 8, kind: 'foto', name: 'zaal.jpg', mime: 'image/jpeg', size: 3_000, own: true, created_at: '2026-10-01 09:01:00' }
  const pdf = () => new File(['%PDF-1.4'], 'zaalblad.pdf', { type: 'application/pdf' })

  async function shown(props: Partial<Parameters<typeof Drawer>[0]> = {}) {
    render(<Drawer row={row(1, 'Montage')} columns={[]} attachments={files} onBatch={vi.fn()} onClose={() => undefined} {...props} />)
    return within(await screen.findByRole('region', { name: 'Bijlagen' }))
  }
  const choose = async (file: File) => {
    await act(async () => fireEvent.change(screen.getByLabelText('Bestand toevoegen'), { target: { files: [file] } }))
  }

  afterEach(() => vi.clearAllMocks())

  it("lists each file with its kind, name and size, and opens it at its address in a new tab", async () => {
    remote.attachmentsOf.mockResolvedValue([rider])
    const section = await shown()

    expect(remote.attachmentsOf).toHaveBeenCalledWith('activity', 1)
    const item = await section.findByRole('listitem')
    expect(item.textContent).toContain('Rider')
    expect(item.textContent).toContain('47 kB')
    const open = within(item).getByRole('link', { name: 'rider.pdf' })
    expect(open.getAttribute('href')).toBe('/api/attachments/file/7')
    expect(open.getAttribute('target')).toBe('_blank')
  })

  it('uploads a chosen file with the picked kind, lists it and hands its batch to the history', async () => {
    remote.attachmentsOf.mockResolvedValue([])
    remote.uploadAttachment.mockResolvedValue({ attachment: { ...photo, name: 'zaalblad.pdf', mime: 'application/pdf' }, batch: 'b-up' })
    const onBatch = vi.fn()
    const section = await shown({ onBatch })

    fireEvent.click(section.getByRole('button', { name: 'Soort: Rider' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Foto' }))
    const file = pdf()
    await choose(file)

    expect(remote.uploadAttachment).toHaveBeenCalledExactlyOnceWith('activity', 1, 'foto', file)
    expect(section.getByRole('link', { name: 'zaalblad.pdf' })).toBeTruthy()
    expect(onBatch).toHaveBeenCalledExactlyOnceWith('b-up')
  })

  it('deletes a file and hands its batch to the history', async () => {
    remote.attachmentsOf.mockResolvedValue([rider, photo])
    remote.removeAttachment.mockResolvedValue('b-del')
    const onBatch = vi.fn()
    const section = await shown({ onBatch })

    await act(async () => fireEvent.click(await section.findByRole('button', { name: 'rider.pdf verwijderen' })))
    expect(remote.removeAttachment).toHaveBeenCalledExactlyOnceWith(7)
    expect(section.queryByRole('link', { name: 'rider.pdf' })).toBeNull()
    expect(onBatch).toHaveBeenCalledExactlyOnceWith('b-del')
  })

  it('reads the list again when its version moves', async () => {
    remote.attachmentsOf.mockResolvedValueOnce([photo]).mockResolvedValueOnce([rider, photo])
    const { rerender } = render(<Drawer row={row(1, 'Montage')} columns={[]} attachments={files} onClose={() => undefined} />)
    const section = within(await screen.findByRole('region', { name: 'Bijlagen' }))
    await section.findByRole('link', { name: 'zaal.jpg' })

    await act(async () => rerender(<Drawer row={row(1, 'Montage')} columns={[]} attachments={{ ...files, version: '1' }} onClose={() => undefined} />))

    expect(remote.attachmentsOf).toHaveBeenCalledTimes(2)
    expect(section.getByRole('link', { name: 'rider.pdf' })).toBeTruthy()
  })

  it('lists the files of a dataset it may not write, offering no upload or delete', async () => {
    remote.attachmentsOf.mockResolvedValue([rider])
    const { writable: _, ...readOnly } = files
    const section = await shown({ attachments: readOnly })

    await section.findByRole('link', { name: 'rider.pdf' })
    expect(section.queryByRole('button', { name: 'rider.pdf verwijderen' })).toBeNull()
    expect(section.queryByLabelText('Bestand toevoegen')).toBeNull()
    expect(section.queryByRole('button', { name: /^Soort/ })).toBeNull()
  })

  it.each([
    ['bad_name', 'name must be 1 to 200 characters', 'Deze bestandsnaam kan niet: hoogstens 200 tekens, zonder stuurtekens.'],
    ['rate_limited', 'Too many requests', 'Te veel bestanden in korte tijd. Probeer het zo meteen opnieuw.'],
    ['read_only', '"activity" does not accept attachments', 'Hier kunnen geen bestanden toegevoegd of verwijderd worden.'],
    ['forbidden', 'An owner may not add files here', 'Je mag hier geen bestanden toevoegen of verwijderen.'],
    ['length_required', 'An upload needs a Content-Length', 'Het bestand kwam niet volledig aan. Probeer het opnieuw.'],
  ])('says a refused upload with %s in Dutch', async (code, message, said) => {
    remote.attachmentsOf.mockResolvedValue([])
    remote.uploadAttachment.mockRejectedValue({ code, message })
    const section = await shown()

    await choose(pdf())

    expect(section.getByRole('alert').textContent).toBe(said)
  })

  it.each([
    ['unknown_attachment', 'unknown attachment', 'Dit bestand bestaat niet meer of je mag het niet zien.'],
    ['forbidden', 'An owner deletes only its own files', 'Je mag hier geen bestanden toevoegen of verwijderen.'],
  ])('says a refused delete with %s in Dutch', async (code, message, said) => {
    remote.attachmentsOf.mockResolvedValue([rider])
    remote.removeAttachment.mockRejectedValue({ code, message })
    const section = await shown()

    const remove = await section.findByRole('button', { name: 'rider.pdf verwijderen' })
    await act(async () => fireEvent.click(remove))

    expect(section.getByRole('alert').textContent).toBe(said)
  })

  it.each([
    [{ code: 'bad_file_type', message: 'Only pdf, jpeg, png and webp files are taken' }, 'Dit bestandstype kan niet. Gebruik pdf, jpg, png of webp.'],
    [{ code: 'body_too_large', message: 'too large' }, 'Dit bestand is te groot (max. 20 MB).'],
    [{ code: 'storage_full', message: 'The storage for attachments is full' }, 'De opslag voor bijlagen is vol. Een beheerder moet de limiet verhogen.'],
  ])('says a refused upload in Dutch: %o', async (refusal, said) => {
    remote.attachmentsOf.mockResolvedValue([])
    remote.uploadAttachment.mockRejectedValue(refusal)
    const onBatch = vi.fn()
    const section = await shown({ onBatch })

    await choose(pdf())

    expect(section.getByRole('alert').textContent).toBe(said)
    expect(onBatch).not.toHaveBeenCalled()
  })

  it('shows no files section on a model without attachments', () => {
    render(<Drawer row={row(1, 'Montage')} columns={[]} onClose={() => undefined} />)
    expect(screen.queryByRole('region', { name: 'Bijlagen' })).toBeNull()
    expect(remote.attachmentsOf).not.toHaveBeenCalled()
  })
})

describe('a link item in the drawer', () => {
  const people = { type: 'links', label: 'Mensen', required: false, fact: false, link: { item: 'Toewijzing', dataset: 'assignment', key: 'activity_id', target: 'person_id', target_dataset: 'person' } }
  const model = { ...activity, fields: { ...activity.fields, people } } as Model
  const every = columnsFor(model, { ...planning, columns: undefined }, false)
  const crew = [{ id: 11, target: 5, title: 'Sien Peeters', state: null }, { id: 12, target: null, title: '', state: null }]
  const staffed: Row = { id: 1, title: 'Lunch bistrot', status: 'publish', fields: { date: '2026-05-18', people: crew } }

  it("opens the link's own record, read-only, through openRelated", () => {
    const openRelated = vi.fn()
    render(<RelationContext.Provider value={{ models: {}, scope: null, spaceModel: null, openRelated }}>
      <Drawer row={staffed} columns={every} model={model} onClose={() => undefined} />
    </RelationContext.Provider>)

    fireEvent.click(screen.getByRole('button', { name: 'Open Sien Peeters' }))

    expect(openRelated).toHaveBeenCalledExactlyOnceWith('assignment', 11)
    expect(within(screen.getByRole('region', { name: 'Mensen' })).getAllByRole('button')).toHaveLength(1)
  })

  it('shows an item without a title as plain text, never as a nameless button', () => {
    const nameless: Row = { ...staffed, fields: { ...staffed.fields, people: [{ id: 13, target: 8, title: '', state: null }] } }
    render(<RelationContext.Provider value={{ models: {}, scope: null, spaceModel: null, openRelated: vi.fn() }}>
      <Drawer row={nameless} columns={every} model={model} onClose={() => undefined} />
    </RelationContext.Provider>)

    expect(within(screen.getByRole('region', { name: 'Mensen' })).queryAllByRole('button')).toHaveLength(0)
  })

  it('stays plain text where no grid can open a record', () => {
    render(<Drawer row={staffed} columns={every} model={model} onClose={() => undefined} />)
    expect(screen.getByText('Sien Peeters')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sien Peeters' })).toBeNull()
  })
})
