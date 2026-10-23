import type { SelectionActionDecl } from '@worktable/engine'
import { soorten } from './datasets'

type Soort = keyof typeof soorten
type Values = Record<string, unknown>

const NOT_IN_REGISTRY = 'niet in registry'
const GONE = 'Niet meer in de registry'

const titelOf = (soort: Soort, records: Values[]): string =>
  `${soorten[soort]} · ${records.length === 1 ? records[0]?.naam : `${records.length} sites`}`

const skipOf = (record: Values): Values =>
  record.in_registry === false ? { state: 'overgeslagen', resultaat: NOT_IN_REGISTRY, samenvatting: GONE } : {}

const linkOf = (actie: number, record: Values): { dataset: string; values: Values } => ({
  dataset: 'actie_site',
  values: { actie_id: actie, site_id: record.id, ...skipOf(record) },
})

const make = (soort: Soort, label: string): SelectionActionDecl => ({
  label,
  on: 'site',
  many: true,
  opens: true,
  input: {},
  run: (records) => ({
    creates: [
      {
        dataset: 'actie',
        values: { soort, titel: titelOf(soort, records) },
        children: (id) => records.map((record) => linkOf(id, record)),
      },
    ],
  }),
})

export const actions: Record<string, SelectionActionDecl> = {
  gezondheidscheck: make('gezondheidscheck', 'Gezondheid checken'),
  malwarescan: make('malwarescan', 'Malware scannen'),
  bijwerken: make('bijwerken', 'Bijwerken'),
  smoketest: make('smoketest', 'Smoketest draaien'),
}
