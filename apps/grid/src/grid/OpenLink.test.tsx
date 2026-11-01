import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Field, Model, Row } from '../types'
import { OpenLink } from './OpenLink'

afterEach(cleanup)

const field = (extra: Partial<Field> = {}): Field => ({ type: 'text', label: 'Adres', required: false, fact: false, ...extra })
const model = { key: 'plek', label: 'Plekken', fields: { adres: field({ href: true }), naam: field() } } as unknown as Model
const row = (adres: unknown): Row => ({ id: 3, title: 'Plek', status: '', fields: { adres, naam: 'https://voorbeeld-site.test' } })
const link = () => screen.queryByRole('link', { name: 'Openen in nieuw tabblad' })

describe('the record\'s open link', () => {
  it('opens an https address in a new tab that cannot reach back', () => {
    render(<OpenLink row={row('https://voorbeeld-site.test')} model={model} />)
    expect(link()?.getAttribute('href')).toBe('https://voorbeeld-site.test/')
    expect(link()?.getAttribute('target')).toBe('_blank')
    expect(link()?.getAttribute('rel')).toBe('noopener noreferrer')
    expect(link()?.getAttribute('title')).toBe('https://voorbeeld-site.test/')
  })

  it('opens an http address too', () => {
    render(<OpenLink row={row('http://voorbeeld-site.test')} model={model} />)
    expect(link()).not.toBeNull()
  })

  it.each(['javascript:alert(1)', 'data:text/html,x', 'ftp://voorbeeld-site.test', '/relative', 'not a url', '', ' javascript:alert(1)', 'JaVaScRiPt:alert(1)'])(
    'renders nothing for %p, which a fake schema serves although the engine refuses it',
    (value) => {
      const { container } = render(<OpenLink row={row(value)} model={model} />)
      expect(link()).toBeNull()
      expect(container.querySelector('a')).toBeNull()
    },
  )

  it.each([null, undefined, 42, true])('renders nothing for %p', (value) => {
    render(<OpenLink row={row(value)} model={model} />)
    expect(link()).toBeNull()
  })

  it('renders nothing for a column that does not declare href, whatever it holds', () => {
    const plain = { ...model, fields: { adres: field() } } as unknown as Model
    render(<OpenLink row={row('https://voorbeeld-site.test')} model={plain} />)
    expect(link()).toBeNull()
  })

  it('renders nothing without a model or for a row not yet made', () => {
    render(<OpenLink row={row('https://voorbeeld-site.test')} />)
    expect(link()).toBeNull()
    cleanup()
    render(<OpenLink row={{ ...row('https://voorbeeld-site.test'), id: 0 }} model={model} />)
    expect(link()).toBeNull()
  })
})
