import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Share } from './Share'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const open = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Exporteren / delen' }))
  return screen.getByRole('menu', { name: 'Exporteren / delen' })
}
const items = () => within(open()).getAllByRole('menuitem').map((item) => item.textContent)

describe('the share menu', () => {
  it('lists Excel, Agenda and Link kopiëren; Publiceren only when publishing is offered', () => {
    const { unmount } = render(<Share onExcel={vi.fn()} onIcs={vi.fn()} link={() => ''} onCopied={vi.fn()} />)
    expect(items()).toEqual(['Excel', 'Agenda (.ics)', 'Link kopiëren'])
    unmount()
    render(<Share onExcel={vi.fn()} onIcs={vi.fn()} link={() => ''} onCopied={vi.fn()} publish={{ isPublic: false, run: vi.fn() }} />)
    expect(items()).toEqual(['Excel', 'Agenda (.ics)', 'Link kopiëren', 'Publiceren'])
  })

  it('offers no Agenda on a view without dates', () => {
    render(<Share onExcel={vi.fn()} link={() => ''} onCopied={vi.fn()} />)
    expect(items()).toEqual(['Excel', 'Link kopiëren'])
  })

  it('copies the address, conditions included, and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const onCopied = vi.fn()
    const address = 'http://grid.test/#view=dagplanning&f=%5B%5D'
    render(<Share onExcel={vi.fn()} link={() => address} onCopied={onCopied} />)

    fireEvent.click(within(open()).getByRole('menuitem', { name: 'Link kopiëren' }))

    await waitFor(() => expect(onCopied).toHaveBeenCalled())
    expect(writeText).toHaveBeenCalledWith(address)
  })

  it('publishes a view not yet public at once, and shows its data address with a copy button', async () => {
    const run = vi.fn().mockResolvedValue('tok-1')
    render(<Share onExcel={vi.fn()} link={() => ''} onCopied={vi.fn()} publish={{ isPublic: false, run }} />)

    const item = within(open()).getByRole('menuitem', { name: 'Publiceren' })
    await act(async () => fireEvent.click(item))

    const dialog = screen.getByRole('dialog', { name: 'Publiceren' })
    const address = within(dialog).getByRole('textbox', { name: 'Publiek adres' }) as HTMLTextAreaElement
    expect(address.value).toBe(`${window.location.origin}/api/public/views/tok-1`)
    // Read whole: a long address wraps in its field, where a one-line input would cut it.
    expect(address.tagName).toBe('TEXTAREA')
    expect(address.readOnly).toBe(true)
    expect(within(dialog).getByRole('button', { name: 'Kopiëren' })).toBeTruthy()
  })

  it('asks before making a new link for a public view, since the old one stops', async () => {
    const run = vi.fn().mockResolvedValue('tok-2')
    render(<Share onExcel={vi.fn()} link={() => ''} onCopied={vi.fn()} publish={{ isPublic: true, run }} />)

    fireEvent.click(within(open()).getByRole('menuitem', { name: 'Publiceren' }))
    const dialog = screen.getByRole('dialog', { name: 'Publiceren' })
    expect(dialog.textContent).toContain('Nieuwe link maken? De vorige stopt.')
    expect(run).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Annuleren' }))
    expect(screen.queryByRole('dialog', { name: 'Publiceren' })).toBeNull()

    fireEvent.click(within(open()).getByRole('menuitem', { name: 'Publiceren' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Nieuwe link maken' })))
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('says publishing works on a computed view only when the engine answers not_query', async () => {
    const run = vi.fn().mockRejectedValue({ code: 'not_query', message: 'only a view on a query can be public' })
    render(<Share onExcel={vi.fn()} link={() => ''} onCopied={vi.fn()} publish={{ isPublic: false, run }} />)

    const item = within(open()).getByRole('menuitem', { name: 'Publiceren' })
    await act(async () => fireEvent.click(item))

    expect(screen.getByRole('dialog', { name: 'Publiceren' }).textContent).toContain('Publiceren kan alleen op een berekende weergave.')
  })

  async function published() {
    const run = vi.fn().mockResolvedValue('tok-3')
    render(<Share onExcel={vi.fn()} link={() => ''} onCopied={vi.fn()} publish={{ isPublic: false, run }} />)
    const item = within(open()).getByRole('menuitem', { name: 'Publiceren' })
    await act(async () => fireEvent.click(item))
    return screen.getByRole('dialog', { name: 'Publiceren' })
  }
  const trigger = () => screen.getByRole('button', { name: 'Exporteren / delen' })

  it('closes on its close button, and gives focus back to the share button', async () => {
    const dialog = await published()
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Sluiten' })))

    expect(screen.queryByRole('dialog', { name: 'Publiceren' })).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it('closes on Escape, and gives focus back to the share button', async () => {
    const dialog = await published()
    await act(async () => fireEvent.keyDown(within(dialog).getByRole('textbox', { name: 'Publiek adres' }), { key: 'Escape' }))

    expect(screen.queryByRole('dialog', { name: 'Publiceren' })).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })
})
