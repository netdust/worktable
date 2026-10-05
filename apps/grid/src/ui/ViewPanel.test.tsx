import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setStrings } from '../i18n'
import { ViewPanel } from './ViewPanel'

afterEach(() => {
  cleanup()
  setStrings(undefined)
})

const panel = () => screen.getByRole('complementary', { name: '+ View' })
const name = () => within(panel()).getByRole('textbox', { name: 'Name' })
const submit = () => within(panel()).getByRole('button', { name: 'Save' }) as HTMLButtonElement

describe('the new view panel', () => {
  it("offers the table's types, and the calendar disabled with its word", () => {
    render(<ViewPanel label="+ View" types={['grid', 'matrix']} onSubmit={vi.fn()} onClose={() => undefined} />)
    const kinds = within(panel()).getByRole('radiogroup', { name: 'View type' })

    expect(within(kinds).getAllByRole('radio').map((r) => r.closest('label')?.textContent)).toEqual(['Table', 'Matrix', 'Calendarsoon'])
    expect((within(kinds).getByRole('radio', { name: /^Calendar/ }) as HTMLInputElement).disabled).toBe(true)
    expect((within(kinds).getByRole('radio', { name: 'Table' }) as HTMLInputElement).checked).toBe(true)
  })

  it('offers no matrix on a table that has only a grid', () => {
    render(<ViewPanel label="+ View" types={['grid']} onSubmit={vi.fn()} onClose={() => undefined} />)

    expect(within(panel()).queryByRole('radio', { name: 'Matrix' })).toBeNull()
  })

  it('keeps its button off while the name is empty or blank', () => {
    render(<ViewPanel label="+ View" types={['grid']} onSubmit={vi.fn()} onClose={() => undefined} />)
    expect(submit().disabled).toBe(true)

    fireEvent.change(name(), { target: { value: '   ' } })
    expect(submit().disabled).toBe(true)
  })

  it('submits the name and the chosen type on Enter', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<ViewPanel label="+ View" types={['grid', 'matrix']} onSubmit={onSubmit} onClose={() => undefined} />)

    fireEvent.click(within(panel()).getByRole('radio', { name: 'Matrix' }))
    fireEvent.change(name(), { target: { value: 'Calais techniek' } })
    fireEvent.submit(name().closest('form')!)

    expect(onSubmit).toHaveBeenCalledWith('Calais techniek', 'matrix')
  })

  it('asks no type when it saves a view as a new one', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<ViewPanel label="+ View" types={null} type="matrix" onSubmit={onSubmit} onClose={() => undefined} />)

    expect(within(panel()).queryByRole('radiogroup')).toBeNull()
    fireEvent.change(name(), { target: { value: 'Kopie' } })
    fireEvent.click(submit())

    expect(onSubmit).toHaveBeenCalledWith('Kopie', 'matrix')
  })

  it("says a refusal in the site's words", async () => {
    setStrings({ 'error.views_bad_name': 'Geef de weergave een naam van 1 tot 80 tekens' })
    const onSubmit = vi.fn().mockRejectedValue({ code: 'views_bad_name', message: 'A name of 1 to 80 characters.' })
    render(<ViewPanel label="+ View" types={['grid']} onSubmit={onSubmit} onClose={() => undefined} />)

    fireEvent.change(name(), { target: { value: '<b></b>' } })
    fireEvent.click(submit())

    expect((await within(panel()).findByRole('alert')).textContent).toBe('Geef de weergave een naam van 1 tot 80 tekens')
  })
})
