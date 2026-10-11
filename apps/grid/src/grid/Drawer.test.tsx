import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Model, ModelAction, Row } from '../types'

const remote = vi.hoisted(() => ({
  records: vi.fn(), recordLink: vi.fn(), rotateRecordLink: vi.fn(),
  attachmentsOf: vi.fn(), uploadAttachment: vi.fn(), removeAttachment: vi.fn(), fileUrl: (id: number) => `/api/attachments/file/${id}`,
}))
vi.mock('../api', () => remote)
const { Drawer, linkedDataset } = await import('./Drawer')
import { columnsFor } from './columns'
import { activity, planning } from './calais.test.data'

const row = (id: number, title: string): Row => ({ id, title, status: 'publish', fields: { date: '2026-05-18', notes: 'Twee veggie' } })
const columns = columnsFor(activity, { ...planning, columns: undefined }, false)

afterEach(cleanup)

describe('the drawer', () => {
  it('reads a record whole without an editor, as the grid has it', () => {
    const { container } = render(<Drawer row={row(1, 'Lunch bistrot')} columns={columns} onClose={() => undefined} />)
    const drawer = screen.getByRole('complementary', { name: 'Lunch bistrot' })

    expect(within(drawer).getByRole('heading', { name: 'Lunch bistrot' })).toBeTruthy()
    expect(within(drawer).getByText('Twee veggie')).toBeTruthy()
    expect(container.querySelectorAll('.nv-drawer__field').length).toBe(columns.length - 1)
    expect(container.querySelector('.nv-drawer__editor')).toBeNull()
  })

  it('renders an editor under the fields', () => {
    render(<Drawer row={row(1, 'Lunch bistrot')} columns={[]} editor={<p>the editor</p>} onClose={() => undefined} />)
    const drawer = screen.getByRole('complementary', { name: 'Lunch bistrot' })

    expect(within(drawer).getByText('the editor').closest('.nv-drawer__editor')).not.toBeNull()
  })

  it('focuses its close button on a row change by default', () => {
    const { rerender } = render(<Drawer row={row(1, 'a')} columns={columns} onClose={() => undefined} />)
    expect(document.activeElement?.textContent).toBe('Sluiten')

    ;(document.activeElement as HTMLElement).blur()
    rerender(<Drawer row={row(2, 'b')} columns={columns} onClose={() => undefined} />)
    expect(document.activeElement?.textContent).toBe('Sluiten')
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

    expect(document.activeElement?.textContent).toBe('Sluiten')
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

  it("says a refusal under the action, in the writer's words", async () => {
    const onAction = vi.fn().mockRejectedValue({ code: 'refused', message: 'Dit sjabloon is al toegepast.' })
    render(<Drawer row={row(3, 'Calais')} columns={[]} actions={[apply]} onAction={onAction} onClose={() => undefined} />)

    await pickSjabloon()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sjabloon toepassen' }))
    })

    expect(screen.getByRole('alert').textContent).toBe('Dit sjabloon is al toegepast.')
  })

  it('offers no action without a way to run it, nor on a model that declares none', () => {
    const { rerender } = render(<Drawer row={row(3, 'Calais')} columns={[]} actions={[apply]} onClose={() => undefined} />)
    expect(screen.queryByRole('group', { name: 'Sjabloon toepassen' })).toBeNull()

    rerender(<Drawer row={row(3, 'Calais')} columns={[]} onAction={vi.fn()} onClose={() => undefined} />)
    expect(screen.queryByRole('button', { name: 'Sjabloon toepassen' })).toBeNull()
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
    expect(screen.queryByRole('button', { name: 'Link kopiëren' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Nieuwe link' })).toBeNull()
  })

  it('"Link kopiëren" reads the current link and copies it; "Nieuwe link" rotates and copies the new one', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    remote.recordLink.mockResolvedValue(LINK)
    remote.rotateRecordLink.mockResolvedValue(`${LINK}-new`)
    render(<Drawer row={row(3, 'Noor Claes')} columns={[]} recordLink="persoon" onClose={() => undefined} />)

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Link kopiëren' })))
    expect(remote.recordLink).toHaveBeenCalledExactlyOnceWith('persoon', 3)
    expect(writeText).toHaveBeenLastCalledWith(LINK)
    expect(screen.getByRole('status').textContent).toBe('Link gekopieerd')

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Nieuwe link' })))
    expect(remote.rotateRecordLink).toHaveBeenCalledExactlyOnceWith('persoon', 3)
    expect(writeText).toHaveBeenLastCalledWith(`${LINK}-new`)
    expect(screen.getByRole('status').textContent).toBe('Nieuwe link gekopieerd; de vorige werkt niet meer')
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
