import type { SavedViewSeed } from '@worktable/engine'
import { plandag } from './plandag'

const DAY_LINE_HOUR = 5

const organisaties = [
  {
    naam: 'Gezelschap Lantaarn',
    soort: 'eigen',
    adres: 'Werfkaai 12, 9000 Gent',
    parameters: { dag_grens_uur: 5, waarschuwingshorizon_dagen: 14, bevestigingstermijn_dagen: 7 },
  },
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

const activityOf = (
  [productieId, soort, startAt, endAt, status, plaats]: Slot,
  omschrijving = `${soort} ${plaats}`,
) => ({
  productie_id: productieId,
  soort,
  omschrijving,
  datum: startAt.slice(0, 10),
  start_at: startAt,
  eind_at: endAt,
  plandag: plandag(startAt, DAY_LINE_HOUR),
  status,
  plaats,
  locatie_id: VENUE_OF[plaats] ?? null,
})

const timed = slots.map((slot) => activityOf(slot))

// Last, so the ids the toewijzingen name stay put; an activity without a time is on its own datum.
const untimed = {
  productie_id: 2,
  soort: 'overnachting',
  omschrijving: 'overnachting Antwerpen',
  datum: '2026-10-15',
  plandag: '2026-10-15',
  status: 'bevestigd',
  plaats: 'Antwerpen',
  locatie_id: VENUE_OF.Antwerpen,
}

// Overlaps activity 1 in Gent; its own words, as "vergadering Gent" is activity 12's.
const dubbel = activityOf(
  [2, 'vergadering', '2026-10-12T10:00', '2026-10-12T11:00', 'bevestigd', 'Gent'],
  'perspresentatie Gent',
)

const activiteiten = [...timed, untimed, dubbel]

const persoon = (voornaam: string, achternaam: string, rest: Record<string, unknown>) => ({
  voornaam,
  achternaam,
  weergavenaam: `${voornaam} ${achternaam}`,
  ...rest,
})

const SPELER = 1
const LICHTTECHNICUS = 2

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
  { activiteit_id: 13, persoon_id: 1, state: 'voorlopig' },
  { activiteit_id: 16, persoon_id: 3, state: 'bevestigd' },
  { activiteit_id: 15, persoon_id: 4, state: 'voorlopig' },
  { activiteit_id: 15, rol_id: SPELER, aantal: 1, state: 'open' },
  { activiteit_id: 26, persoon_id: 1, state: 'voorlopig' },
]

const beschikbaarheden = [
  { persoon_id: 3, start_at: '2026-10-14T00:00', eind_at: '2026-10-14T23:59', reden: 'Familiefeest' },
  { persoon_id: 2, start_at: '2026-10-19T09:00', eind_at: '2026-10-19T13:00', reden: 'Tandarts' },
  { persoon_id: 1, start_at: '2026-10-09T09:00', eind_at: '2026-10-12T12:00', reden: 'Studiedag' },
  {
    persoon_id: 2,
    start_at: '2026-10-12T20:00',
    eind_at: '2026-10-12T23:00',
    soort: 'onzeker',
    reden: 'Misschien repetitie',
  },
]

// Bram prefers Speler, Lotte does not: the rank order and the id order disagree.
const persoonRollen = [
  { persoon_id: 2, rol_id: SPELER, voorkeur: true },
  { persoon_id: 1, rol_id: SPELER },
  { persoon_id: 3, rol_id: SPELER },
  { persoon_id: 4, rol_id: SPELER },
  { persoon_id: 3, rol_id: LICHTTECHNICUS, dagtarief: 300 },
]

const taken = [
  { titel: 'Rider versturen', deadline: '2026-10-16', toegewezen_aan: 1, status: 'open' },
  { titel: 'Zaal bevestigen', deadline: '2026-10-09', status: 'gedaan' },
]

const rollen = [
  { naam: 'Speler', categorie: 'artistiek', standaard_verrekening: 'dagcontract', dagtarief: 210, kleur: '#b03a2e' },
  {
    naam: 'Lichttechnicus',
    categorie: 'techniek',
    standaard_verrekening: 'factuur',
    dagtarief: 280,
    uurtarief: 38,
    kleur: '#1f6fb2',
  },
  { naam: 'Productieleider', categorie: 'productie', kleur: '#7d3c98' },
  { naam: 'Chauffeur', categorie: 'logistiek', standaard_verrekening: 'factuur', uurtarief: 24, kleur: '#239b56' },
]

type Plaats = { rol: string; aantal: number }
type Item = [soort: string, omschrijving: string, startTijd?: string, duur?: number, slots?: Plaats[]]

const speeldag: Item[] = [
  ['maaltijd', 'Lunch', '13:00', 60],
  ['repetitie', 'Voorbereiding', '14:00', 210, [{ rol: 'Lichttechnicus', aantal: 1 }]],
  ['maaltijd', 'Diner', '17:30', 60],
  ['repetitie', 'Voorbereiding avond', '18:30', 90],
  ['voorstelling', 'Voorstelling', '20:00', 75, [{ rol: 'Speler', aantal: 2 }]],
  ['andere', 'Afwas', '21:15', 60],
  ['overnachting', 'Overnachting'],
]

// Its own title: --seed-missing never updates, so a database holding step 1's unslotted "speeldag op locatie" gets this beside it.
const sjablonen = [
  {
    naam: 'speeldag op locatie (met plaatsen)',
    items: speeldag.map(([soort, omschrijving, start_tijd, duur, slots]) => ({
      soort,
      omschrijving,
      offset_dag: 0,
      ...(start_tijd ? { start_tijd, duur } : {}),
      locatie_regel: 'speelreeks',
      ...(slots ? { slots } : {}),
    })),
  },
]

export function seed(insert: (dataset: string, rows: Record<string, unknown>[]) => void): void {
  insert('organisatie', organisaties)
  insert('productie', producties)
  insert('activiteit', activiteiten)
  insert('persoon', personen)
  insert('rol', rollen)
  insert('toewijzing', toewijzingen)
  insert('beschikbaarheid', beschikbaarheden)
  insert('sjabloon', sjablonen)
  insert('persoon_rol', persoonRollen)
  insert('taak', taken)
}

export const views: SavedViewSeed[] = [
  {
    name: 'Planning',
    source_type: 'dataset',
    source: 'activiteit',
    skin: 'table',
    filters: { plandag: { $period: 'week' } },
    sort: ['start_at'],
    group_by: 'plandag',
    visible_fields: ['start_at', 'omschrijving', 'soort', 'locatie', 'status', 'speelreeks_id', 'mensen'],
  },
  {
    name: 'Toewijzingen per activiteit',
    source_type: 'dataset',
    source: 'activiteit',
    skin: 'matrix',
    filters: {},
    sort: ['plandag', 'start_at'],
    group_by: null,
    visible_fields: ['productie_id', 'soort', 'datum', 'start_at', 'status'],
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
    visible_fields: ['persoon_id', 'soort', 'start_at', 'eind_at', 'reden'],
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
    // Not for owners until an administrator publishes it.
    name: 'Mijn producties',
    source_type: 'query',
    source: 'mijn_producties',
    skin: 'table',
    filters: {},
    sort: ['vanaf'],
    group_by: null,
    visible_fields: ['productie', 'rollen', 'vanaf', 'laatste_dag', 'toegang_vervalt'],
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
  {
    name: 'Tourstops',
    source_type: 'dataset',
    source: 'speelreeks',
    skin: 'table',
    filters: {},
    sort: ['start_datum'],
    group_by: null,
    visible_fields: ['productie_id', 'naam', 'locatie_id', 'start_datum', 'eind_datum', 'status'],
  },
  {
    name: 'Rollen',
    source_type: 'dataset',
    source: 'rol',
    skin: 'table',
    filters: {},
    sort: ['naam'],
    group_by: null,
    visible_fields: ['naam', 'categorie', 'standaard_verrekening', 'dagtarief', 'uurtarief', 'kleur'],
  },
  {
    name: 'Sjablonen',
    source_type: 'dataset',
    source: 'sjabloon',
    skin: 'table',
    filters: {},
    sort: ['naam'],
    group_by: null,
    visible_fields: ['naam', 'items'],
  },
  {
    name: 'Conflicten',
    source_type: 'query',
    source: 'conflicten',
    skin: 'table',
    filters: {},
    sort: ['plandag', 'type'],
    group_by: null,
    visible_fields: [
      'type',
      'ernst',
      'plandag',
      'persoon_id',
      'activiteit_id',
      'ander_activiteit_id',
      'locatie_id',
      'productie_id',
    ],
  },
  {
    name: 'Per persoon per dag',
    source_type: 'query',
    source: 'persoon_dag',
    skin: 'table',
    filters: { state: { $nin: ['geweigerd', 'geannuleerd'] } },
    sort: ['plandag', 'start_at'],
    group_by: null,
    // The badge sits by the name, so it never scrolls off a 1280 px screen.
    visible_fields: [
      'persoon_id',
      'conflicten',
      'plandag',
      'start_at',
      'soort',
      'productie_id',
      'locatie_id',
      'state',
      'beschikbaarheid',
    ],
  },
  {
    name: 'Persoonskalender',
    source_type: 'query',
    source: 'persoon_dag',
    skin: 'calendar',
    filters: { state: { $nin: ['geweigerd', 'geannuleerd'] } },
    sort: ['plandag', 'start_at'],
    group_by: 'persoon_id',
    visible_fields: [],
  },
  {
    name: 'Locatiekalender',
    source_type: 'query',
    source: 'locatie_dag',
    skin: 'calendar',
    filters: {},
    sort: ['plandag', 'start_at'],
    group_by: 'locatie_id',
    visible_fields: [],
  },
  {
    name: 'Bedrijfsweek',
    source_type: 'query',
    source: 'productie_dag',
    skin: 'calendar',
    filters: {},
    sort: ['plandag'],
    group_by: 'productie_id',
    visible_fields: [],
  },
  {
    name: 'Werklijst',
    source_type: 'query',
    source: 'werklijst',
    skin: 'table',
    filters: {},
    sort: ['deadline'],
    group_by: null,
    visible_fields: ['soort', 'titel', 'persoon_id', 'deadline', 'status'],
  },
  {
    name: 'Kandidaten',
    source_type: 'query',
    source: 'kandidaten',
    skin: 'table',
    filters: {},
    sort: ['toewijzing_id', 'rang'],
    group_by: null,
    visible_fields: ['toewijzing_id', 'rang', 'naam', 'rol_id', 'voorkeur', 'activiteit_id'],
  },
  {
    name: 'Bord toewijzingen',
    source_type: 'dataset',
    source: 'toewijzing',
    skin: 'board',
    filters: {},
    sort: ['activiteit_id'],
    group_by: null,
    visible_fields: ['activiteit_id', 'rol_id', 'datum'],
  },
  {
    name: 'Per status',
    source_type: 'dataset',
    source: 'activiteit',
    skin: 'board',
    filters: { plandag: { $period: 'week' } },
    sort: ['plandag', 'start_at'],
    group_by: null,
    visible_fields: ['soort', 'plandag', 'start_at', 'eind_at', 'locatie', 'mensen'],
  },
  {
    name: 'Tijdlijn tourstops',
    source_type: 'dataset',
    source: 'speelreeks',
    skin: 'timeline',
    filters: {},
    sort: ['start_datum'],
    group_by: 'productie_id',
    visible_fields: [],
  },
  {
    name: 'Galerij activiteiten',
    source_type: 'dataset',
    source: 'activiteit',
    skin: 'gallery',
    filters: {},
    sort: ['plandag', 'start_at'],
    group_by: null,
    visible_fields: ['plandag', 'soort'],
  },
  {
    name: 'Kalender activiteiten',
    source_type: 'dataset',
    source: 'activiteit',
    skin: 'calendar',
    filters: {},
    sort: ['plandag', 'start_at'],
    group_by: 'productie_id',
    visible_fields: [],
  },
  {
    name: 'Kalender afwezigheden',
    source_type: 'dataset',
    source: 'beschikbaarheid',
    skin: 'calendar',
    filters: {},
    sort: ['start_at'],
    group_by: 'persoon_id',
    visible_fields: [],
  },
  {
    name: 'Open plaatsen',
    source_type: 'query',
    source: 'werklijst',
    skin: 'table',
    filters: { soort: 'open_slot' },
    sort: ['deadline'],
    group_by: null,
    visible_fields: ['titel', 'deadline'],
  },
  {
    name: 'Onbeantwoord',
    source_type: 'query',
    source: 'werklijst',
    skin: 'table',
    filters: { soort: 'onbeantwoord' },
    sort: ['deadline'],
    group_by: null,
    visible_fields: ['titel', 'persoon_id', 'deadline'],
  },
  {
    name: 'Vandaag',
    source_type: 'dataset',
    source: 'activiteit',
    skin: 'table',
    filters: { plandag: { $period: 'today' } },
    sort: ['start_at'],
    group_by: null,
    visible_fields: ['start_at', 'omschrijving', 'locatie'],
  },
  {
    name: 'Plaatsen',
    source_type: 'query',
    source: 'plaatsen',
    skin: 'table',
    filters: { rol_id: { $exists: true }, datum: { $period: 'week' } },
    sort: ['activiteit_id'],
    group_by: null,
    visible_fields: ['activiteit_id', 'rol_id', 'persoon_id', 'state'],
  },
  {
    name: 'Plaatsen gevuld',
    source_type: 'query',
    source: 'plaatsen',
    skin: 'table',
    filters: { rol_id: { $exists: true }, persoon_id: { $exists: true }, datum: { $period: 'week' } },
    sort: ['activiteit_id'],
    group_by: null,
    visible_fields: ['activiteit_id', 'rol_id', 'persoon_id', 'state'],
  },
  // The page the grid opens on: what is wrong now, what happens this week, what waits.
  {
    name: 'Overzicht',
    skin: 'dashboard',
    filters: {},
    sort: [],
    group_by: null,
    visible_fields: [],
    layout: {
      sections: [
        {
          label: 'Nu',
          tiles: [
            { kind: 'stat', view: 'Conflicten', measure: 'count', tone: { above: 0, tone: 'bad' } },
            { kind: 'stat', view: 'Open plaatsen', measure: 'count', tone: { above: 0, tone: 'warn' } },
            { kind: 'stat', view: 'Onbeantwoord', measure: 'count', tone: { above: 0, tone: 'warn' } },
            { kind: 'progress', done: 'Plaatsen gevuld', total: 'Plaatsen', label: 'Plaatsen gevuld' },
          ],
        },
        {
          label: 'Deze week',
          tiles: [
            { kind: 'week', view: 'Kalender activiteiten' },
            { kind: 'list', view: 'Vandaag', rows: 5 },
          ],
        },
        {
          label: 'Te doen',
          tiles: [
            {
              kind: 'list',
              view: 'Werklijst',
              rows: 8,
              columns: ['soort', 'deadline'],
              set: { column: 'status', value: 'gedaan', label: 'Gedaan' },
            },
          ],
        },
      ],
      actions: [
        { create: 'activiteit', label: 'Nieuwe activiteit' },
        { create: 'speelreeks', label: 'Nieuwe tourstop' },
        { create: 'taak', label: 'Nieuwe taak' },
      ],
    },
  },
]
