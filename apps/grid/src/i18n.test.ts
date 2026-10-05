import { afterEach, describe, expect, it } from 'vitest'
import { inUse, rowCount, setStrings, t } from './i18n'

afterEach(() => setStrings(undefined))

describe('t()', () => {
  it('reads English until the site says otherwise', () => {
    expect(t('saved')).toBe('Saved')
  })

  it("reads the site's words once they are set, English for any key left out", () => {
    setStrings({ saved: 'Opgeslagen', rows: '{n} rijen' })

    expect(t('saved')).toBe('Opgeslagen')
    expect(rowCount(3)).toBe('3 rijen')
    expect(t('previous')).toBe('Previous')
  })

  it('ignores an unknown key and an empty or non-string word', () => {
    setStrings({ toString: 'x', saved: '', next: 7 } as unknown as Record<string, string>)

    expect(t('saved')).toBe('Saved')
    expect(t('next')).toBe('Next')
  })
})

describe('inUse()', () => {
  it('names each referencing dataset with its count, the last joined by en', () => {
    expect(inUse([{ label: 'Activiteiten', count: 3 }])).toBe('Nog in gebruik door Activiteiten (3).')
    expect(inUse([{ label: 'Activiteiten', count: 3 }, { label: 'Personen', count: 1 }])).toBe('Nog in gebruik door Activiteiten (3) en Personen (1).')
    expect(inUse([{ label: 'A', count: 1 }, { label: 'B', count: 2 }, { label: 'C', count: 3 }])).toBe('Nog in gebruik door A (1), B (2) en C (3).')
  })
})
