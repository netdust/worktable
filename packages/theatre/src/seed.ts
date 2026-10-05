import type { SavedViewSeed } from '@worktable/engine'
import { plandag } from './plandag'

const DAY_LINE_HOUR = 5

const producties = [
  { titel: 'De Kersentuin', seizoen: '2026-2027', status: 'actief' },
  { titel: 'Nachtwacht', seizoen: '2026-2027', status: 'ontwikkeling' },
  { titel: 'Zomerstorm', seizoen: '2025-2026', status: 'archief' },
]

type Slot = [productieId: number, soort: string, startAt: string, endAt: string, status: string, plaats: string]

const slots: Slot[] = [
  [1, 'opbouw', '2026-10-12T09:00', '2026-10-12T13:00', 'bevestigd', 'Gent'],
  [1, 'repetitie', '2026-10-12T14:00', '2026-10-12T18:00', 'bevestigd', 'Gent'],
  [1, 'maaltijd', '2026-10-12T18:30', '2026-10-12T19:30', 'optie', 'Gent'],
  [1, 'voorstelling', '2026-10-12T20:30', '2026-10-12T22:30', 'bevestigd', 'Gent'],
  [1, 'afbouw', '2026-10-12T23:00', '2026-10-13T01:00', 'bevestigd', 'Gent'],
  [1, 'reis', '2026-10-13T10:00', '2026-10-13T12:00', 'bevestigd', 'Gent'],
  [1, 'opbouw', '2026-10-13T14:00', '2026-10-13T18:00', 'bevestigd', 'Brugge'],
  [1, 'voorstelling', '2026-10-13T20:00', '2026-10-13T22:00', 'bevestigd', 'Brugge'],
  [1, 'voorstelling', '2026-10-14T00:30', '2026-10-14T02:00', 'bevestigd', 'Brugge'],
  [1, 'overnachting', '2026-10-14T01:00', '2026-10-14T08:00', 'optie', 'Brugge'],
  [1, 'voorstelling', '2026-10-15T20:00', '2026-10-15T22:00', 'geannuleerd', 'Kortrijk'],
  [1, 'vergadering', '2026-10-16T10:00', '2026-10-16T11:00', 'bevestigd', 'Gent'],
  [2, 'repetitie', '2026-10-12T10:00', '2026-10-12T17:00', 'bevestigd', 'Antwerpen'],
  [2, 'repetitie', '2026-10-13T10:00', '2026-10-13T17:00', 'bevestigd', 'Antwerpen'],
  [2, 'repetitie', '2026-10-14T10:00', '2026-10-14T17:00', 'optie', 'Antwerpen'],
  [2, 'vergadering', '2026-10-14T17:30', '2026-10-14T18:30', 'bevestigd', 'Antwerpen'],
  [2, 'andere', '2026-10-15T14:00', '2026-10-15T16:00', 'optie', 'Antwerpen'],
  [2, 'repetitie', '2026-10-19T10:00', '2026-10-19T17:00', 'optie', 'Antwerpen'],
  [3, 'afbouw', '2026-10-12T08:00', '2026-10-12T12:00', 'bevestigd', 'Leuven'],
  [3, 'reis', '2026-10-12T13:00', '2026-10-12T15:00', 'geannuleerd', 'Leuven'],
  [3, 'maaltijd', '2026-10-13T12:00', '2026-10-13T13:00', 'bevestigd', 'Leuven'],
  [3, 'voorstelling', '2026-10-17T20:00', '2026-10-17T22:00', 'bevestigd', 'Mechelen'],
  [3, 'voorstelling', '2026-10-18T15:00', '2026-10-18T17:00', 'optie', 'Mechelen'],
  [3, 'overnachting', '2026-10-18T23:00', '2026-10-19T07:00', 'optie', 'Mechelen'],
  [3, 'afbouw', '2026-10-19T09:00', '2026-10-19T12:00', 'bevestigd', 'Mechelen'],
]

const activiteiten = slots.map(([productieId, soort, startAt, endAt, status, plaats]) => ({
  productie_id: productieId,
  soort,
  omschrijving: `${soort} ${plaats}`,
  start_at: startAt,
  eind_at: endAt,
  plandag: plandag(startAt, DAY_LINE_HOUR),
  status,
  plaats,
}))

export function seed(insert: (dataset: string, rows: Record<string, unknown>[]) => void): void {
  insert('productie', producties)
  insert('activiteit', activiteiten)
}

export const views: SavedViewSeed[] = [
  {
    name: 'Planning',
    source_type: 'dataset',
    source: 'activiteit',
    skin: 'table',
    filters: { status: 'bevestigd' },
    sort: ['start_at'],
    group_by: 'plandag',
    visible_fields: ['productie_id', 'soort', 'start_at', 'eind_at', 'status', 'plaats'],
  },
  {
    name: 'Per productie per dag',
    source_type: 'query',
    source: 'productie_dag',
    skin: 'table',
    filters: {},
    sort: ['plandag'],
    group_by: null,
    visible_fields: ['productie', 'plandag', 'activiteiten', 'voorstellingen', 'repetities'],
  },
]
