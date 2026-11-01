import { afterEach, describe, expect, it } from 'vitest'
import { errorText, inUse, rowCount, setStrings, t, undoText } from './i18n'

afterEach(() => setStrings(undefined))

describe('errorText', () => {
  it('reads service_only in Dutch', () => {
    expect(errorText('service_only', 'Only a service account writes "status"')).toBe('Dit wordt automatisch bijgehouden en kan je niet zelf wijzigen.')
  })
})

describe('t()', () => {
  it('reads English until the site says otherwise', () => {
    expect(t('saved')).toBe('Opgeslagen')
  })

  it("reads the site's words once they are set, English for any key left out", () => {
    setStrings({ saved: 'Opgeslagen', rows: '{n} rijen' })

    expect(t('saved')).toBe('Opgeslagen')
    expect(rowCount(3)).toBe('3 rijen')
    expect(t('previous')).toBe('Vorige')
  })

  it('ignores an unknown key and an empty or non-string word', () => {
    setStrings({ toString: 'x', saved: '', next: 7 } as unknown as Record<string, string>)

    expect(t('saved')).toBe('Opgeslagen')
    expect(t('next')).toBe('Volgende')
  })
})

describe('inUse()', () => {
  it('names each referencing dataset with its count, the last joined by en', () => {
    expect(inUse([{ label: 'Activiteiten', count: 3 }])).toBe('Nog in gebruik door Activiteiten (3).')
    expect(inUse([{ label: 'Activiteiten', count: 3 }, { label: 'Personen', count: 1 }])).toBe('Nog in gebruik door Activiteiten (3) en Personen (1).')
    expect(inUse([{ label: 'A', count: 1 }, { label: 'B', count: 2 }, { label: 'C', count: 3 }])).toBe('Nog in gebruik door A (1), B (2) en C (3).')
  })
})

describe('undoText()', () => {
  it("says an in_use refusal in the site's sentence, not the engine's English", () => {
    const refused = { code: 'in_use', message: 'Still referenced by Toewijzingen (1)', by: [{ label: 'Toewijzingen', count: 1 }] }
    expect(undoText(refused)).toBe('Nog in gebruik door Toewijzingen (1).')
  })

  it('says a file changed since, not a removed record, on an attachment', () => {
    const refused = { code: 'changed_since', message: '"deleted_at" changed since', dataset: 'attachment', column: 'deleted_at', label: 'rider.pdf' }
    expect(undoText(refused)).toBe('Dit bestand is intussen gewijzigd.')
  })
})

describe('errorText()', () => {
  it('says a refused or lost transition in Dutch, whatever the engine said in English', () => {
    expect(errorText('transition_not_allowed', '"state" may not go from geweigerd to bevestigd')).toBe('Deze statuswijziging is niet toegestaan.')
    expect(errorText('transition_lost', '"state" is no longer uitgenodigd')).toBe('De status is intussen gewijzigd. De cel toont nu wat er staat.')
  })

  it("keeps the site's own words first, and the server's message for a code it does not know", () => {
    setStrings({ 'error.transition_lost': 'Iemand was je voor.' })
    expect(errorText('transition_lost', 'lost')).toBe('Iemand was je voor.')
    expect(errorText('refused', 'Kies een persoon of een naam.')).toBe('Kies een persoon of een naam.')
  })
})
