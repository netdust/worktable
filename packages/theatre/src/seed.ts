import type { SavedViewSeed } from '@worktable/engine'
import { plandag } from './plandag'

const DAY_LINE_HOUR = 5

const organisaties = [
  { naam: 'Gezelschap Lantaarn', soort: 'eigen', adres: 'Werfkaai 12, 9000 Gent', parameters: { dag_grens_uur: 5 } },
  {
    naam: 'Zaal De Spiegel',
    soort: 'venue',
    adres: 'Spiegelstraat 4, 9000 Gent',
    lat: 51.05,
    lng: 3.72,
    toegang: 'Laden via de achterpoort, parking op het plein',
  },
  { naam: 'Theater Het Anker', soort: 'venue', adres: 'Ankerdijk 8, 8000 Brugge', contact: 'regie@anker.test' },
  { naam: 'Repetitiekot De Loods', soort: 'partner', adres: 'Loodsweg 3, 2000 Antwerpen' },
  { naam: 'Lichtwerk Verhuur', soort: 'leverancier', contact: 'verhuur@lichtwerk.test' },
]

const OWN = 1
const VENUE_OF: Record<string, number> = { Gent: 2, Brugge: 3, Antwerpen: 4 }

const producties = [
  { titel: 'De Kersentuin', seizoen: '2026-2027', status: 'actief', organisatie_id: OWN },
  { titel: 'Nachtwacht', seizoen: '2026-2027', status: 'ontwikkeling', organisatie_id: OWN },
  { titel: 'Zomerstorm', seizoen: '2025-2026', status: 'archief', organisatie_id: OWN },
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
  locatie_id: VENUE_OF[plaats] ?? null,
}))

const persoon = (voornaam: string, achternaam: string, rest: Record<string, unknown>) => ({
  voornaam,
  achternaam,
  weergavenaam: `${voornaam} ${achternaam}`,
  ...rest,
})

const personen = [
  persoon('Lotte', 'Verhaegen', { email: 'lotte@lantaarn.test', organisatie_id: OWN, contract_type: 'vast' }),
  persoon('Bram', 'De Wilde', { email: 'bram@voorbeeld.test', telefoon: '0470 00 00 01', contract_type: 'freelance' }),
  persoon('Noor', 'Claes', { organisatie_id: OWN, contract_type: 'dagcontract', dietary: 'vegetarisch' }),
  persoon('Sam', 'Peeters', { organisatie_id: 4, contract_type: 'freelance' }),
  persoon('Jef', 'Maes', { contract_type: 'freelance', actief: false }),
]

// Never on activiteit 1: the Activiteit writer tests delete it.
const toewijzingen = [
  { activiteit_id: 4, persoon_id: 1, state: 'bevestigd' },
  { activiteit_id: 4, persoon_id: 2, state: 'uitgenodigd' },
  { activiteit_id: 4, naam: 'Gastmuzikant', state: 'bevestigd', notitie: 'Brengt eigen instrument' },
  { activiteit_id: 2, persoon_id: 1, state: 'bevestigd' },
  { activiteit_id: 13, persoon_id: 4, state: 'uitgenodigd' },
  { activiteit_id: 8, persoon_id: 3, state: 'bevestigd' },
]

const beschikbaarheden = [
  { persoon_id: 3, start_at: '2026-10-14T00:00', eind_at: '2026-10-14T23:59', reden: 'Familiefeest' },
  { persoon_id: 2, start_at: '2026-10-19T09:00', eind_at: '2026-10-19T13:00', reden: 'Tandarts' },
]

export function seed(insert: (dataset: string, rows: Record<string, unknown>[]) => void): void {
  insert('organisatie', organisaties)
  insert('productie', producties)
  insert('activiteit', activiteiten)
  insert('persoon', personen)
  insert('toewijzing', toewijzingen)
  insert('beschikbaarheid', beschikbaarheden)
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
  {
    name: 'Dagplanning',
    source_type: 'query',
    source: 'dagplanning',
    skin: 'table',
    filters: {},
    sort: ['start_at'],
    group_by: 'plandag',
    visible_fields: ['productie', 'soort', 'start_at', 'status'],
  },
  {
    name: 'Organisaties',
    source_type: 'dataset',
    source: 'organisatie',
    skin: 'table',
    filters: {},
    sort: ['naam'],
    group_by: null,
    visible_fields: ['naam', 'soort', 'adres', 'contact'],
  },
  {
    name: 'Personen',
    source_type: 'dataset',
    source: 'persoon',
    skin: 'table',
    filters: {},
    sort: ['achternaam'],
    group_by: null,
    visible_fields: ['voornaam', 'achternaam', 'email', 'telefoon', 'organisatie_id', 'contract_type', 'actief'],
  },
  {
    name: 'Toewijzingen',
    source_type: 'dataset',
    source: 'toewijzing',
    skin: 'table',
    filters: {},
    sort: ['activiteit_id'],
    group_by: null,
    visible_fields: ['activiteit_id', 'persoon_id', 'naam', 'state', 'notitie'],
  },
  {
    name: 'Afwezigheden',
    source_type: 'dataset',
    source: 'beschikbaarheid',
    skin: 'table',
    filters: {},
    sort: ['start_at'],
    group_by: null,
    visible_fields: ['persoon_id', 'start_at', 'eind_at', 'reden'],
  },
  {
    name: 'Voorstellingen',
    source_type: 'query',
    source: 'voorstellingen',
    skin: 'table',
    filters: {},
    sort: ['datum', 'start'],
    group_by: null,
    visible_fields: ['productie', 'datum', 'start', 'venue', 'adres'],
  },
  {
    name: 'Producties',
    source_type: 'dataset',
    source: 'productie',
    skin: 'table',
    filters: {},
    sort: ['titel'],
    group_by: null,
    visible_fields: ['titel', 'seizoen', 'status', 'organisatie_id'],
  },
]
