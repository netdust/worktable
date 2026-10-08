import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setStrings } from '../i18n'
import { NewViewDialog } from './NewViewDialog'

afterEach(() => {
  cleanup()
  setStrings(undefined)
})

const dialog = () => screen.getByRole('dialog')
const name = () => within(dialog()).getByRole('textbox', { name: 'Naam' }) as HTMLInputElement
const make = () => within(dialog()).getByRole('button', { name: 'Weergave maken' }) as HTMLButtonElement
const show = (extra: Partial<Parameters<typeof NewViewDialog>[0]> = {}) => {
  const props = { source: 'Ritten', type: 'grid' as const, scope: null, onSubmit: vi.fn().mockResolvedValue(undefined), onClose: vi.fn(), ...extra }
  render(<NewViewDialog {...props} />)
  return props
}

describe('the new view dialog', () => {
  it("is titled by the kind, and pre-fills the name with the kind's name", () => {
    show({ type: 'matrix' })

    expect(screen.getByRole('dialog', { name: 'Nieuwe matrixweergave' })).toBeTruthy()
    expect(name().value).toBe('Matrix')
    cleanup()
    show()
    expect(screen.getByRole('dialog', { name: 'Nieuwe gridweergave' })).toBeTruthy()
    expect(name().value).toBe('Grid')
  })

  it('asks who may change it, the team first, with a hint for each choice', () => {
    show()
    const who = within(dialog()).getByRole('group', { name: 'Wie mag ze aanpassen' })

    expect((within(who).getByRole('radio', { name: 'Het team' }) as HTMLInputElement).checked).toBe(true)
    expect(within(who).getByText('Iedereen in het team ziet ze; alleen jij past ze aan, de anderen maken een kopie.')).toBeTruthy()
    fireEvent.click(within(who).getByRole('radio', { name: 'Alleen ik' }))
    expect(within(who).getByText('Alleen jij ziet ze; delen kan later.')).toBeTruthy()
  })

  it('shows the source, and the scope when one is set', () => {
    show()
    expect(within(dialog()).getByText('Op Ritten')).toBeTruthy()
    cleanup()

    show({ scope: 'Zomertour' })
    expect(within(dialog()).getByText('Op Ritten · beperkt tot Zomertour')).toBeTruthy()
  })

  it('creates a team view, then closes', async () => {
    const props = show()
    fireEvent.change(name(), { target: { value: '  Per chauffeur ' } })
    fireEvent.click(make())

    expect(props.onSubmit).toHaveBeenCalledWith('Per chauffeur', true)
    await waitFor(() => expect(props.onClose).toHaveBeenCalled())
  })

  it('creates a personal view', () => {
    const props = show()
    fireEvent.click(within(dialog()).getByRole('radio', { name: 'Alleen ik' }))
    fireEvent.submit(name().closest('form')!)

    expect(props.onSubmit).toHaveBeenCalledWith('Grid', false)
  })

  it('keeps its button off while the name is blank', () => {
    show()
    fireEvent.change(name(), { target: { value: '   ' } })

    expect(make().disabled).toBe(true)
  })

  it('closes on Annuleren and on Escape, creating nothing', () => {
    const props = show()
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Annuleren' }))
    fireEvent.keyDown(name(), { key: 'Escape' })

    expect(props.onClose).toHaveBeenCalledTimes(2)
    expect(props.onSubmit).not.toHaveBeenCalled()
  })

  it('closes on a press on the dimmed page, not on one inside the dialog', () => {
    const props = show()
    fireEvent.mouseDown(name())
    expect(props.onClose).not.toHaveBeenCalled()

    const scrim = dialog().closest('.nv-scrim')!
    for (const type of ['pointerDown', 'mouseDown', 'pointerUp', 'mouseUp', 'click'] as const) fireEvent[type](scrim)
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it("sets its width on the scrim's direct child, so the content cannot shrink it", () => {
    show()
    const scrim = dialog().closest('.nv-scrim')!
    expect(scrim.firstElementChild?.classList.contains('nv-dialog')).toBe(true)
  })

  it('opens with the name selected', () => {
    show()
    expect(document.activeElement).toBe(name())
  })

  it("says a refusal in the site's words and stays open", async () => {
    setStrings({ 'error.views_bad_name': 'Geef de weergave een naam van 1 tot 80 tekens' })
    const props = show({ onSubmit: vi.fn().mockRejectedValue({ code: 'views_bad_name', message: 'A name of 1 to 80 characters.' }) })
    fireEvent.click(make())

    expect((await within(dialog()).findByRole('alert')).textContent).toBe('Geef de weergave een naam van 1 tot 80 tekens')
    expect(props.onClose).not.toHaveBeenCalled()
  })
})
