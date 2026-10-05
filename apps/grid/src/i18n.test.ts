import { afterEach, describe, expect, it } from 'vitest'
import { rowCount, setStrings, t } from './i18n'

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
