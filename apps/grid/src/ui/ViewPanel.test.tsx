import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setStrings } from '../i18n'
import { ViewPanel } from './ViewPanel'

afterEach(() => {
  cleanup()
  setStrings(undefined)
})

const panel = () => screen.getByRole('complementary', { name: 'Save as new view' })
const name = () => within(panel()).getByRole('textbox', { name: 'Name' })
const submit = () => within(panel()).getByRole('button', { name: 'Save' }) as HTMLButtonElement

describe('the save-as panel', () => {
  it('keeps its button off while the name is empty or blank', () => {
    render(<ViewPanel label="Save as new view" type="grid" onSubmit={vi.fn()} onClose={() => undefined} />)
    expect(submit().disabled).toBe(true)

    fireEvent.change(name(), { target: { value: '   ' } })
    expect(submit().disabled).toBe(true)
  })

  it('asks no type, and submits the name with the type it keeps', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<ViewPanel label="Save as new view" type="matrix" onSubmit={onSubmit} onClose={() => undefined} />)

    expect(within(panel()).queryByRole('radiogroup')).toBeNull()
    fireEvent.change(name(), { target: { value: 'Kopie' } })
    fireEvent.submit(name().closest('form')!)

    expect(onSubmit).toHaveBeenCalledWith('Kopie', 'matrix')
  })

  it("says a refusal in the site's words", async () => {
    setStrings({ 'error.views_bad_name': 'Geef de weergave een naam van 1 tot 80 tekens' })
    const onSubmit = vi.fn().mockRejectedValue({ code: 'views_bad_name', message: 'A name of 1 to 80 characters.' })
    render(<ViewPanel label="Save as new view" type="grid" onSubmit={onSubmit} onClose={() => undefined} />)

    fireEvent.change(name(), { target: { value: '<b></b>' } })
    fireEvent.click(submit())

    expect((await within(panel()).findByRole('alert')).textContent).toBe('Geef de weergave een naam van 1 tot 80 tekens')
  })
})
