import { type ActionCreate, type ActionDecl, refuse, type SelectionActionDecl } from '@worktable/engine'
import { soorten } from './datasets'

type Soort = keyof typeof soorten
type Values = Record<string, unknown>

const NOT_IN_REGISTRY = 'niet in registry'
const GONE = 'Niet meer in de registry'
const ALL_GONE = 'Geen van deze sites staat nog in de registry.'
const NO_PLUGIN = 'geen plugin'
const WITHOUT_PLUGIN = 'Geen studio-plugin'

const titelOf = (soort: Soort, records: Values[]): string =>
  `${soorten[soort]} · ${records.length === 1 ? records[0]?.naam : `${records.length} sites`}`

const skipOf = (record: Values, needsPlugin: boolean): Values => {
  if (record.in_registry === false) return { state: 'overgeslagen', resultaat: NOT_IN_REGISTRY, samenvatting: GONE }
  if (needsPlugin && record.plugin !== true)
    return { state: 'overgeslagen', resultaat: NO_PLUGIN, samenvatting: WITHOUT_PLUGIN }
  return {}
}

const linkOf = (actie: number, record: Values, needsPlugin = false): ActionCreate => ({
  dataset: 'actie_site',
  values: { actie_id: actie, site_id: record.id, ...skipOf(record, needsPlugin) },
})

/** An action of the studio plugin: offered where a site has it, a site without it is skipped, and the engine refuses a selection with none. */
const makePlugin = (soort: Soort, label: string): SelectionActionDecl => ({
  label,
  on: 'site',
  many: true,
  opens: true,
  input: {},
  when: { plugin: true, in_registry: true },
  skip: true,
  run: (records) => ({
    creates: [
      {
        dataset: 'actie',
        values: { soort, titel: titelOf(soort, records) },
        children: (id) => records.map((record) => linkOf(id, record, true)),
      },
    ],
  }),
})

const make = (soort: Soort, label: string): SelectionActionDecl => ({
  label,
  on: 'site',
  many: true,
  opens: true,
  input: {},
  run: (records) => {
    if (records.every((record) => record.in_registry === false)) refuse(ALL_GONE)
    return {
      creates: [
        {
          dataset: 'actie',
          values: { soort, titel: titelOf(soort, records) },
          children: (id) => records.map((record) => linkOf(id, record)),
        },
      ],
    }
  },
})

/** The drawer's login button: one inloggen actie for the open site, its link handed back to the person who clicked. */
const inloggen: ActionDecl = {
  label: 'Inloggen',
  on: 'site',
  input: {},
  head: { icon: 'log-in' },
  handoff: true,
  when: { plugin: true, in_registry: true },
  run: (record) => ({
    creates: [
      {
        dataset: 'actie',
        values: { soort: 'inloggen', titel: titelOf('inloggen', [record]) },
        children: (id) => [linkOf(id, record)],
      },
    ],
  }),
}

export const actions: Record<string, SelectionActionDecl | ActionDecl> = {
  inloggen,
  gezondheidscheck: make('gezondheidscheck', 'Gezondheid checken'),
  malwarescan: make('malwarescan', 'Malware scannen'),
  bijwerken: make('bijwerken', 'Bijwerken'),
  smoketest: make('smoketest', 'Smoketest draaien'),
  plugin_installeren: make('plugin_installeren', 'Studio-plugin installeren'),
  cache_legen: makePlugin('cache_legen', 'Cache legen'),
  cron_draaien: makePlugin('cron_draaien', 'Cron draaien'),
  onderhoudsmodus_aan: makePlugin('onderhoudsmodus_aan', 'Onderhoudsmodus aan'),
  onderhoudsmodus_uit: makePlugin('onderhoudsmodus_uit', 'Onderhoudsmodus uit'),
}
