import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EmptyState } from './EmptyState'
import { Spinner } from './Spinner'

afterEach(cleanup)

describe('Spinner and EmptyState', () => {
  it('the spinner is a named progressbar', () => {
    render(<Spinner />)

    expect(screen.getByRole('progressbar', { name: 'Laden' }).className).toBe('nv-spinner')
  })

  it('the empty state says what and why', () => {
    render(<EmptyState title="Geen rijen" description="Er is niets in deze periode" />)

    const status = screen.getByRole('status')
    expect(status.textContent).toBe('Geen rijenEr is niets in deze periode')
  })
})
