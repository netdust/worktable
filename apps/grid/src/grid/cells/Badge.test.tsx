import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Model, Row, View } from '../../types'
import { columnsFor } from '../columns'
import { Display } from './index'

const model: Model = {
  key: 'persoon_dag', label: 'Per persoon per dag', title_label: 'Omschrijving', title_readonly: true,
  fields: { conflicten: { type: 'int', label: 'Conflicten', required: true, fact: false, readonly: true, badge: 'bad' } },
}
const view = { key: 'v', label: 'v', table: 'persoon_dag', model: 'persoon_dag', columns: ['conflicten'] } as unknown as View
const column = columnsFor(model, view, false).find((c) => c.id === 'conflicten')!
const row = (n: number | null): Row => ({ id: 1, title: 'repetitie', status: '', fields: { conflicten: n } })

afterEach(cleanup)

describe('a badge cell', () => {
  it('shows 3 and 1 as tinted counts named by the column, and nothing at 0 or empty', () => {
    for (const n of [3, 1]) {
      const { container, unmount } = render(<Display column={column} row={row(n)} onToggle={() => undefined} />)
      const badge = screen.getByLabelText(`${n} Conflicten`)
      expect([badge.textContent, badge.className]).toEqual([String(n), 'nv-badge nv-badge--bad'])
      expect(container.textContent).toBe(String(n))
      unmount()
    }
    for (const n of [0, null]) {
      const { container, unmount } = render(<Display column={column} row={row(n)} onToggle={() => undefined} />)
      expect(container.textContent).toBe('')
      unmount()
    }
  })
})
