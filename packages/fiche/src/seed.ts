import type { SavedViewSeed } from '@worktable/engine'

const fiches = [
  {
    titel: 'Crisisopvang De Haven',
    type: 'hulp',
    gemeente: 'Voorbeeldstad',
    postcode: '9999',
    telefoon: '000 00 00 01',
    prioriteit: 10,
    custom: { talen: ['nl', 'fr', 'en'], crisisopvang: true },
  },
  {
    titel: 'Praatcafe Voorbeeld',
    type: 'preventie',
    gemeente: 'Voorbeeldstad',
    postcode: '9999',
    email: 'praatcafe@example.invalid',
    website: 'https://praatcafe.example.invalid',
    prioriteit: 5,
    custom: { talen: ['nl'], crisisopvang: false },
  },
  {
    titel: 'Vroegsignaal Testdorp',
    type: 'vroeginterventie',
    gemeente: 'Testdorp',
    postcode: '8888',
    prioriteit: 5,
    custom: { talen: ['nl', 'ar'], crisisopvang: true },
  },
  { titel: 'Buurtpunt Proefhoven', type: 'preventie', gemeente: 'Proefhoven', postcode: '7777' },
  {
    titel: 'Oud aanbod Nergens',
    type: 'hulp',
    gemeente: 'Nergens',
    postcode: '1111',
    prioriteit: 20,
    verborgen: true,
    custom: { talen: ['nl'], crisisopvang: false },
  },
]

export function seed(insert: (dataset: string, rows: Record<string, unknown>[]) => void): void {
  insert('fiche', fiches)
}

export const views: SavedViewSeed[] = [
  {
    name: 'Fiches',
    source_type: 'dataset',
    source: 'fiche',
    skin: 'table',
    filters: {},
    sort: ['titel'],
    group_by: null,
    visible_fields: ['titel', 'type', 'gemeente', 'postcode', 'prioriteit', 'verborgen'],
  },
  {
    name: 'Zichtbare fiches',
    source_type: 'query',
    source: 'zichtbare_fiches',
    skin: 'table',
    filters: {},
    sort: [],
    group_by: null,
    visible_fields: ['titel', 'type', 'gemeente', 'postcode', 'prioriteit'],
  },
]
