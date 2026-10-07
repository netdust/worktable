import { readFileSync } from 'node:fs'
import { defineQuery } from '@worktable/engine'
import { dagFacts, soorten } from './datasets'

const count = (label: string) => ({ type: 'integer' as const, label })

export const productieDag = defineQuery({
  name: 'productie_dag',
  of: 'activiteit',
  label: 'Per productie per dag',
  icon: 'table',
  title: 'productie',
  date: 'plandag',
  scoped: 'productie_id',
  sql: readFileSync(new URL('./queries/productie_dag.sql', import.meta.url), 'utf8'),
  columns: {
    id: { type: 'integer', label: 'Id' },
    productie_id: { type: 'integer', label: 'Productie', relation: 'productie' },
    productie: { type: 'text', label: 'Productie' },
    plandag: { type: 'date', label: 'Plandag' },
    activiteiten: count('Activiteiten'),
    voorstellingen: count('Voorstellingen'),
    repetities: count('Repetities'),
    opbouw: count('Opbouw'),
    afbouw: count('Afbouw'),
    reis: count('Reis'),
    overnachting: count('Overnachting'),
    maaltijd: count('Maaltijd'),
    vergadering: count('Vergadering'),
    andere: count('Andere'),
  },
})

const writesActiviteit = (field: string) => ({ dataset: 'activiteit', field, key: 'activiteit_id' })

export const dagplanning = defineQuery({
  name: 'dagplanning',
  of: 'activiteit',
  label: 'Dagplanning',
  icon: 'query',
  title: 'omschrijving',
  date: 'plandag',
  scoped: 'productie_id',
  group_facts: dagFacts,
  creates: 'activiteit',
  sql: readFileSync(new URL('./queries/dagplanning.sql', import.meta.url), 'utf8'),
  columns: {
    id: { type: 'integer', label: 'Id' },
    activiteit_id: { type: 'integer', label: 'Activiteit' },
    productie_id: { type: 'integer', label: 'Productie', relation: 'productie' },
    productie: { type: 'text', label: 'Productie' },
    omschrijving: { type: 'text', label: 'Omschrijving', nullable: true, writes: writesActiviteit('omschrijving') },
    soort: { type: 'text', label: 'Soort', ...soorten, writes: writesActiviteit('soort') },
    datum: { type: 'date', label: 'Datum', writes: writesActiviteit('datum') },
    start_at: { type: 'datetime', label: 'Start', nullable: true, writes: writesActiviteit('start_at') },
    eind_at: { type: 'datetime', label: 'Einde', nullable: true, writes: writesActiviteit('eind_at') },
    plandag: { type: 'date', label: 'Plandag' },
    status: { type: 'text', label: 'Status', writes: writesActiviteit('status') },
    locatie_id: {
      type: 'integer',
      label: 'Locatie',
      nullable: true,
      relation: 'organisatie',
      writes: writesActiviteit('locatie_id'),
      inherited: { flag: 'locatie_bron', own: 'eigen' },
    },
    locatie_bron: {
      type: 'text',
      label: 'Locatie van',
      nullable: true,
      readonly: true,
      options: { eigen: 'Eigen', speelreeks: 'Tourstop' },
    },
  },
})

export const voorstellingen = defineQuery({
  name: 'voorstellingen',
  of: 'activiteit',
  label: 'Voorstellingen',
  icon: 'table',
  title: 'productie',
  date: 'datum',
  sql: readFileSync(new URL('./queries/voorstellingen.sql', import.meta.url), 'utf8'),
  columns: {
    id: { type: 'integer', label: 'Id' },
    productie: { type: 'text', label: 'Productie' },
    datum: { type: 'date', label: 'Datum' },
    start: { type: 'text', label: 'Aanvang', nullable: true },
    venue: { type: 'text', label: 'Venue', nullable: true },
    adres: { type: 'text', label: 'Adres', nullable: true },
  },
})
