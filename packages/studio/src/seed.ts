import type { SavedViewSeed } from '@worktable/engine'
import { localDay, localTime } from './time'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const ago = (ms: number) => localTime(new Date(Date.now() - ms))

/** A day of this week, Monday 0, at the given hour: the agenda never runs out of fixtures. */
function thisWeek(day: number, hour = 0): Date {
  const at = new Date()
  at.setHours(hour, 0, 0, 0)
  at.setDate(at.getDate() - ((at.getDay() + 6) % 7) + day)
  return at
}

const INTERN = 1
const KLANT = 2

const organisaties = [
  { naam: 'Studio Voorbeeld', soort: 'intern', notities: 'Het eigen bureau.' },
  { naam: 'Bakkerij Testmans', soort: 'klant' },
]

const sites = [
  {
    naam: 'testmans-winkel',
    domein: 'winkel.testmans.example',
    hosting: 'Voorbeeldhost',
    sla: true,
    risico: 'hoog',
    staging: true,
    beheer: 'volledig',
    organisatie_id: KLANT,
    gezondheid: 'ok',
    statuscode: 200,
    responstijd_ms: 420,
    wp_versie: '6.8.3',
    php_versie: '8.3',
    tls_dagen: 61,
    laatste_check: ago(DAY),
  },
  {
    naam: 'testmans-bestel',
    domein: 'bestel.testmans.example',
    hosting: 'Voorbeeldhost',
    sla: true,
    risico: 'normaal',
    beheer: 'volledig',
    organisatie_id: KLANT,
    gezondheid: 'let_op',
    statuscode: 200,
    responstijd_ms: 1830,
    wp_versie: '6.7.2',
    php_versie: '8.2',
    updates_plugins: 4,
    updates_core: true,
    tls_dagen: 12,
    laatste_check: ago(DAY),
  },
  {
    naam: 'voorbeeld-site',
    domein: 'www.voorbeeld.example',
    hosting: 'Eigen server',
    sla: false,
    risico: 'laag',
    beheer: 'composer',
    organisatie_id: INTERN,
    gezondheid: 'ok',
    statuscode: 200,
    responstijd_ms: 310,
    wp_versie: '6.8.3',
    php_versie: '8.3',
    tls_dagen: 74,
    laatste_check: ago(2 * DAY),
  },
  {
    naam: 'voorbeeld-blog',
    domein: 'blog.voorbeeld.example',
    hosting: 'Eigen server',
    sla: false,
    risico: 'laag',
    beheer: 'web_alleen',
    organisatie_id: INTERN,
    gezondheid: 'storing',
    statuscode: 500,
    responstijd_ms: 95,
    laatste_check: ago(3 * HOUR),
  },
  { naam: 'oud-archief', domein: 'archief.voorbeeld.example', in_registry: false, organisatie_id: INTERN },
]

const ALLE = 1
const SLA = 2
const groepen = [
  { naam: 'Alle sites', soort: 'alle' },
  { naam: 'SLA-sites', soort: 'sla' },
  ...sites.map((s) => ({ naam: s.naam, soort: 'site' })),
]
const leden = [
  ...[1, 2, 3, 4].map((site_id) => ({ groep_id: ALLE, site_id })),
  ...[1, 2].map((site_id) => ({ groep_id: SLA, site_id })),
  ...sites.map((_, at) => ({ groep_id: 3 + at, site_id: 1 + at })),
]

const acties = [
  {
    titel: 'Bijwerken · Alle sites',
    soort: 'bijwerken',
    groep_id: ALLE,
    status: 'voorbereid',
    voorbereid_op: ago(2 * HOUR),
    samenvatting: 'Twee sites hebben updates klaarstaan.',
  },
]
const voorstel = (items: [string, string, string][]) =>
  JSON.stringify(items.map(([naam, van, naar]) => ({ naam, van, naar })))
const actieSites = [
  {
    actie_id: 1,
    site_id: 2,
    state: 'te_bevestigen',
    voorstel: voorstel([
      ['wordpress', '6.7.2', '6.8.3'],
      ['formulier-plugin', '2.4.0', '2.5.1'],
    ]),
  },
  { actie_id: 1, site_id: 3, state: 'te_bevestigen', voorstel: voorstel([['cache-plugin', '1.9.0', '1.9.2']]) },
]

const projecten = [
  { naam: 'Studio', organisatie_id: INTERN, repo: '/srv/voorbeeld/studio' },
  { naam: 'Webshop Testmans', organisatie_id: KLANT, repo: '/srv/voorbeeld/testmans-shop' },
]
const werkpakketten = [
  {
    project_id: 1,
    naam: 'Dashboard',
    repo: '/srv/voorbeeld/studio',
    branch: 'feature/dashboard',
    plan: 'specs/dashboard/plan.md',
    fase: 'bouwen',
    laatste_stap: 'Taak 3: de tegels lezen hun views',
    volgende_stap: 'Taak 4: de snelle acties',
    bijgewerkt: ago(3 * HOUR),
    organisatie_id: INTERN,
  },
  {
    project_id: 2,
    naam: 'Kassakoppeling',
    repo: '/srv/voorbeeld/testmans-shop',
    branch: 'feature/kassa',
    plan: 'specs/kassa/plan.md',
    fase: 'geblokkeerd',
    laatste_stap: 'Testbestelling loopt vast op de betaalstap',
    geblokkeerd_door: 'Wacht op een testsleutel van de klant',
    bijgewerkt: ago(2 * DAY),
    organisatie_id: KLANT,
  },
  {
    project_id: 2,
    naam: 'Nieuwsbrief',
    repo: '/srv/voorbeeld/testmans-shop',
    branch: 'feature/nieuwsbrief',
    fase: 'plan',
    laatste_stap: 'Spec goedgekeurd',
    volgende_stap: 'Plan schrijven',
    bijgewerkt: ago(5 * DAY),
    organisatie_id: KLANT,
  },
]

const taken = [
  { titel: 'Offerte nieuwsbrief opsturen', deadline: localDay(thisWeek(3)), wie: 'stefan', organisatie_id: KLANT },
  { titel: 'TLS van bestel.testmans verlengen', deadline: localDay(thisWeek(4)), organisatie_id: KLANT, site_id: 2 },
  { titel: 'Storing voorbeeld-blog bekijken', deadline: localDay(), wie: 'stefan', organisatie_id: INTERN, site_id: 4 },
  { titel: 'Dashboard-plan nalezen', wie: 'claude', organisatie_id: INTERN, project_id: 1, werkpakket_id: 1 },
]

const agendapunten = [
  {
    titel: 'Overleg Testmans',
    datum: localDay(),
    start_at: localTime(new Date(new Date().setHours(10, 0, 0, 0))),
    eind_at: localTime(new Date(new Date().setHours(11, 0, 0, 0))),
    organisatie_id: KLANT,
  },
  { titel: 'Oplevering kassakoppeling', datum: localDay(thisWeek(4)), soort: 'deadline', organisatie_id: KLANT },
  { titel: 'Back-up-rapport nakijken', datum: localDay(thisWeek(2)), soort: 'herinnering', organisatie_id: INTERN },
]

export function seed(insert: (dataset: string, rows: Record<string, unknown>[]) => void): void {
  insert('organisatie', organisaties)
  insert('site', sites)
  insert('groep', groepen)
  insert('groep_lid', leden)
  insert('actie', acties)
  insert('actie_site', actieSites)
  insert('project', projecten)
  insert('werkpakket', werkpakketten)
  insert('taak', taken)
  insert('agendapunt', agendapunten)
}

type View = Omit<SavedViewSeed, 'filters' | 'sort' | 'group_by'> & Partial<SavedViewSeed>
const view = (v: View): SavedViewSeed => ({ filters: {}, sort: [], group_by: null, ...v })
const IN_REGISTRY = { in_registry: true }
const SITE_FIELDS = ['naam', 'domein', 'gezondheid', 'organisatie_id', 'laatste_check', 'updates_plugins', 'risico']

export const views: SavedViewSeed[] = [
  view({
    name: 'Sites',
    source_type: 'dataset',
    source: 'site',
    skin: 'table',
    sort: ['naam'],
    visible_fields: [
      'naam',
      'domein',
      'gezondheid',
      'organisatie_id',
      'sla',
      'risico',
      'statuscode',
      'wp_versie',
      'php_versie',
      'updates_plugins',
      'updates_themas',
      'updates_core',
      'tls_dagen',
      'laatste_check',
      'in_registry',
    ],
  }),
  view({
    name: 'Alle sites',
    source_type: 'dataset',
    source: 'site',
    skin: 'table',
    filters: IN_REGISTRY,
    sort: ['naam'],
    visible_fields: SITE_FIELDS,
  }),
  view({
    name: 'Sites in orde',
    source_type: 'dataset',
    source: 'site',
    skin: 'table',
    filters: { ...IN_REGISTRY, gezondheid: 'ok' },
    sort: ['naam'],
    visible_fields: SITE_FIELDS,
  }),
  view({
    name: 'Storing',
    source_type: 'dataset',
    source: 'site',
    skin: 'table',
    filters: { ...IN_REGISTRY, gezondheid: 'storing' },
    sort: ['naam'],
    visible_fields: SITE_FIELDS,
  }),
  view({
    name: 'Let op',
    source_type: 'dataset',
    source: 'site',
    skin: 'table',
    filters: { ...IN_REGISTRY, gezondheid: 'let_op' },
    sort: ['naam'],
    visible_fields: SITE_FIELDS,
  }),
  view({
    name: 'Sites met aandacht',
    source_type: 'query',
    source: 'sites_aandacht',
    skin: 'table',
    sort: ['naam'],
    visible_fields: ['naam', 'reden', 'gezondheid', 'laatste_check', 'organisatie_id'],
  }),
  view({
    name: 'Groepen',
    source_type: 'dataset',
    source: 'groep',
    skin: 'table',
    sort: ['naam'],
    visible_fields: ['naam', 'soort', 'leden'],
  }),
  view({
    name: 'Acties',
    source_type: 'dataset',
    source: 'actie',
    skin: 'table',
    sort: ['-id'],
    visible_fields: ['titel', 'soort', 'groep_id', 'status', 'bron', 'gepland_op', 'sites'],
  }),
  view({
    name: 'Acties per status',
    source_type: 'dataset',
    source: 'actie',
    skin: 'board',
    sort: ['-id'],
    visible_fields: ['soort', 'groep_id', 'sites'],
  }),
  view({
    name: 'Te bevestigen',
    source_type: 'dataset',
    source: 'actie',
    skin: 'table',
    filters: { status: 'voorbereid' },
    sort: ['voorbereid_op'],
    visible_fields: ['titel', 'soort', 'groep_id', 'voorbereid_op', 'sites'],
  }),
  view({
    name: 'Onderhoudslog',
    source_type: 'dataset',
    source: 'onderhoud',
    skin: 'table',
    sort: ['-datum'],
    visible_fields: ['datum', 'site_id', 'soort', 'uitkomst', 'samenvatting', 'actie_id'],
  }),
  view({
    name: 'Projecten',
    source_type: 'dataset',
    source: 'project',
    skin: 'table',
    sort: ['naam'],
    visible_fields: ['naam', 'organisatie_id', 'repo'],
  }),
  view({
    name: 'Werkpakketten',
    source_type: 'dataset',
    source: 'werkpakket',
    skin: 'table',
    filters: { fase: { $nin: ['klaar', 'geparkeerd'] } },
    sort: ['-bijgewerkt'],
    visible_fields: ['project', 'naam', 'fase', 'laatste_stap', 'volgende_stap', 'geblokkeerd_door', 'bijgewerkt'],
  }),
  view({
    name: 'Per fase',
    source_type: 'dataset',
    source: 'werkpakket',
    skin: 'board',
    sort: ['-bijgewerkt'],
    visible_fields: ['project', 'laatste_stap', 'bijgewerkt'],
  }),
  view({
    name: 'Taken',
    source_type: 'dataset',
    source: 'taak',
    skin: 'table',
    filters: { status: 'open' },
    sort: ['deadline'],
    visible_fields: ['titel', 'deadline', 'wie', 'organisatie_id', 'site_id', 'status'],
  }),
  view({
    name: 'Op tafel',
    source_type: 'query',
    source: 'op_tafel',
    skin: 'table',
    sort: ['deadline'],
    visible_fields: ['soort', 'titel', 'onderwerp', 'deadline', 'status'],
  }),
  view({
    name: 'Agenda',
    source_type: 'query',
    source: 'agenda',
    skin: 'calendar',
    sort: ['datum', 'start_at'],
    visible_fields: [],
  }),
  view({
    name: 'Vandaag',
    source_type: 'query',
    source: 'agenda',
    skin: 'table',
    filters: { datum: { $period: 'today' } },
    sort: ['start_at'],
    visible_fields: ['titel', 'start_at', 'eind_at', 'soort'],
  }),
  view({
    name: 'Agendapunten',
    source_type: 'dataset',
    source: 'agendapunt',
    skin: 'table',
    sort: ['datum', 'start_at'],
    visible_fields: ['titel', 'datum', 'start_at', 'eind_at', 'soort', 'organisatie_id'],
  }),
  view({
    name: 'Organisaties',
    source_type: 'dataset',
    source: 'organisatie',
    skin: 'table',
    sort: ['naam'],
    visible_fields: ['naam', 'soort', 'notities'],
  }),
  // The page studio opens on: the four questions of a Monday morning (spec S12).
  view({
    name: 'Overzicht',
    skin: 'dashboard',
    visible_fields: [],
    layout: {
      sections: [
        {
          label: 'Nu',
          tiles: [
            { kind: 'progress', done: 'Sites in orde', total: 'Alle sites', label: 'Sites in orde' },
            { kind: 'stat', view: 'Storing', measure: 'count', tone: { above: 0, tone: 'bad' } },
            { kind: 'stat', view: 'Let op', measure: 'count', tone: { above: 0, tone: 'warn' } },
            {
              kind: 'stat',
              view: 'Op tafel',
              label: 'Wacht op jou',
              measure: 'count',
              tone: { above: 0, tone: 'warn' },
            },
          ],
        },
        {
          label: 'Waar we stopten',
          tiles: [
            {
              kind: 'list',
              view: 'Werkpakketten',
              rows: 5,
              columns: ['project', 'fase', 'laatste_stap', 'bijgewerkt'],
            },
            { kind: 'list', view: 'Sites met aandacht', rows: 5, columns: ['reden', 'laatste_check'] },
          ],
        },
        {
          label: 'Deze week',
          tiles: [
            { kind: 'week', view: 'Agenda' },
            { kind: 'list', view: 'Vandaag', rows: 5, columns: ['start_at', 'eind_at', 'soort'] },
          ],
        },
        {
          label: 'Op tafel',
          tiles: [
            {
              kind: 'list',
              view: 'Te bevestigen',
              rows: 5,
              set: { column: 'status', value: 'bevestigd', label: 'Bevestigen' },
            },
            { kind: 'list', view: 'Op tafel', rows: 8, set: { column: 'status', value: 'gedaan', label: 'Gedaan' } },
          ],
        },
      ],
      actions: [
        { create: 'actie', label: 'Nieuwe actie' },
        { create: 'taak', label: 'Nieuwe taak' },
        { create: 'agendapunt', label: 'Nieuw agendapunt' },
      ],
    },
  }),
]
