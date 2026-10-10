import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Model, Row } from '../../types'
import { columnsFor } from '../columns'
import { Display } from './index'

const view = { key: 'v', label: 'V', table: 't', table_label: 'T', model: 'session', type: 'grid', columns: ['room'] } as never

afterEach(cleanup)

describe('an inherited lookup', () => {
  const activity: Model = {
    key: 'activiteit', label: 'Activiteiten', title_label: 'Omschrijving', title_readonly: false,
    fields: {
      locatie: { type: 'relation', label: 'Locatie', required: false, fact: false, relation: { model: 'organisatie', multiple: false }, via: 'Tourstop' },
    },
  }
  const locatie = columnsFor(activity, { ...(view as object), model: 'activiteit', columns: ['locatie'] } as never).find((c) => c.id === 'locatie')!
  const row = (inherited?: string[]): Row =>
    ({ id: 1, title: 'A', status: '', fields: { locatie: 3 }, lookups: { locatie: { id: 3, title: 'Zaal Twaalf', status: '', fields: {} } }, ...(inherited ? { inherited } : {}) })
  const cell = (r: Row) => render(<Display column={locatie} row={r} onToggle={() => {}} />).container

  it('an inherited lookup reads via its word', () => {
    const inherited = cell(row(['locatie']))
    expect(inherited.querySelector('.nv-inherited')).not.toBeNull()
    expect(inherited.querySelector('.nv-via')?.textContent).toBe('via tourstop')
    expect(inherited.textContent).toContain('Zaal Twaalf')

    cleanup()
    const own = cell(row())
    expect(own.querySelector('.nv-inherited')).toBeNull()
    expect(own.textContent).toBe('Zaal Twaalf')
  })
})
