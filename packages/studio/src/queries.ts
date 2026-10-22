import { readFileSync } from 'node:fs'
import { defineQuery } from '@worktable/engine'
import { actie, agendapunt, gezondheden, taak } from './datasets'

const sqlOf = (name: string) => readFileSync(new URL(`./queries/${name}.sql`, import.meta.url), 'utf8')
const klant = { type: 'integer' as const, label: 'Organisatie', nullable: true, relation: 'organisatie' }

export const sitesAandacht = defineQuery({
  name: 'sites_aandacht',
  label: 'Sites met aandacht',
  icon: 'flag',
  title: 'naam',
  of: 'site',
  scoped: 'organisatie_id',
  sql: sqlOf('sites_aandacht'),
  columns: {
    id: { type: 'integer', label: 'Id' },
    naam: { type: 'text', label: 'Naam' },
    gezondheid: { type: 'text', label: 'Gezondheid', ...gezondheden },
    reden: {
      type: 'text',
      label: 'Reden',
      options: {
        storing: 'Storing',
        let_op: 'Let op',
        oud: 'Oude check',
        nooit: 'Nooit gecheckt',
        weg: 'Niet in registry',
      },
      tones: { storing: 'bad', let_op: 'warn', oud: 'amber', nooit: 'grey', weg: 'slate' },
    },
    laatste_check: { type: 'datetime', label: 'Laatste check', nullable: true },
    organisatie_id: klant,
  },
})

export const sitesInOrde = defineQuery({
  name: 'sites_in_orde',
  label: 'Sites in orde',
  icon: 'check',
  title: 'naam',
  of: 'site',
  scoped: 'organisatie_id',
  sql: sqlOf('sites_in_orde'),
  columns: {
    id: { type: 'integer', label: 'Id' },
    naam: { type: 'text', label: 'Naam' },
    gezondheid: { type: 'text', label: 'Gezondheid', ...gezondheden },
    laatste_check: { type: 'datetime', label: 'Laatste check', nullable: true },
    organisatie_id: klant,
  },
})

export const opTafel = defineQuery({
  name: 'op_tafel',
  label: 'Op tafel',
  icon: 'check',
  title: 'titel',
  date: 'deadline',
  scoped: 'organisatie_id',
  sql: sqlOf('op_tafel'),
  columns: {
    id: { type: 'integer', label: 'Id' },
    soort: {
      type: 'text',
      label: 'Soort',
      options: { taak: 'Taak', bevestigen: 'Bevestigen', mislukt: 'Mislukt' },
      tones: { bevestigen: 'amber', mislukt: 'bad' },
    },
    titel: { type: 'text', label: 'Titel' },
    onderwerp: { type: 'text', label: 'Onderwerp', nullable: true },
    deadline: { type: 'date', label: 'Deadline', nullable: true },
    taak_id: { type: 'integer', label: 'Taak', nullable: true, relation: taak.name },
    actie_id: { type: 'integer', label: 'Actie', nullable: true, relation: actie.name },
    status: {
      type: 'text',
      label: 'Status',
      nullable: true,
      writes: { dataset: 'taak', field: 'status', key: 'taak_id' },
    },
    organisatie_id: klant,
  },
})

export const agenda = defineQuery({
  name: 'agenda',
  label: 'Agenda',
  icon: 'calendar',
  title: 'titel',
  date: 'datum',
  calendar: { day: 'datum', start: 'start_at', end: 'eind_at', lanes: ['organisatie_id'] },
  scoped: 'organisatie_id',
  creates: agendapunt.name,
  sql: sqlOf('agenda'),
  columns: {
    id: { type: 'integer', label: 'Id' },
    titel: { type: 'text', label: 'Titel' },
    datum: { type: 'date', label: 'Datum' },
    start_at: { type: 'datetime', label: 'Start', nullable: true },
    eind_at: { type: 'datetime', label: 'Einde', nullable: true },
    soort: {
      type: 'text',
      label: 'Soort',
      options: {
        afspraak: 'Afspraak',
        deadline: 'Deadline',
        herinnering: 'Herinnering',
        onderhoud: 'Onderhoud',
        taak: 'Taak',
      },
      tones: { deadline: 'warn', herinnering: 'sky', onderhoud: 'violet', taak: 'teal' },
    },
    organisatie_id: klant,
    agendapunt_id: { type: 'integer', label: 'Agendapunt', nullable: true, relation: agendapunt.name },
    actie_id: { type: 'integer', label: 'Actie', nullable: true, relation: actie.name },
    taak_id: { type: 'integer', label: 'Taak', nullable: true, relation: taak.name },
  },
})
