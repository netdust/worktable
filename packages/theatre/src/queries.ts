import { readFileSync } from 'node:fs'
import { defineQuery } from '@worktable/engine'
import { soorten } from './datasets'

const count = (label: string) => ({ type: 'integer' as const, label })

export const productieDag = defineQuery({
  name: 'productie_dag',
  label: 'Per productie per dag',
  icon: 'table',
  title: 'productie',
  date: 'plandag',
  calendar: { day: 'plandag', lanes: ['productie_id'] },
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

export const voorstellingen = defineQuery({
  name: 'voorstellingen',
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

const shown = (type: 'text' | 'date', label: string) => ({ type, label, nullable: true, owner_visible: true })

// A person's productions: names as text, since a link actor reads no lookups.
export const mijnProducties = defineQuery({
  name: 'mijn_producties',
  label: 'Mijn producties',
  icon: 'star',
  title: 'productie',
  date: 'laatste_dag',
  owners: { owner: 'persoon_id' },
  sql: readFileSync(new URL('./queries/mijn_producties.sql', import.meta.url), 'utf8'),
  columns: {
    id: { type: 'integer', label: 'Id' },
    persoon_id: { type: 'integer', label: 'Persoon', relation: 'persoon' },
    productie_id: { type: 'integer', label: 'Productie', relation: 'productie' },
    productie: { type: 'text', label: 'Productie', owner_visible: true },
    rollen: shown('text', 'Rollen'),
    vanaf: shown('date', 'Eerste dag'),
    laatste_dag: shown('date', 'Laatste dag'),
    toegang_vervalt: shown('date', 'Toegang tot'),
  },
})

const sqlOf = (name: string) => readFileSync(new URL(`./queries/${name}.sql`, import.meta.url), 'utf8')
const toActiviteit = (field: string) => ({ dataset: 'activiteit', field, key: 'activiteit_id' })

// A query column never relates to toewijzing, whose title goes through a relation: those ids are plain integers.
export const conflicten = defineQuery({
  name: 'conflicten',
  label: 'Conflicten',
  icon: 'flag',
  title: 'omschrijving',
  date: 'plandag',
  scoped: 'productie_id',
  sql: sqlOf('conflicten'),
  columns: {
    id: { type: 'integer', label: 'Id' },
    type: {
      type: 'text',
      label: 'Type',
      options: {
        overlap: 'Overlap',
        afwezig: 'Afwezig',
        onzeker: 'Onzeker',
        open_slot: 'Open plaats',
        onbevestigd: 'Onbevestigd',
        locatie_dubbel: 'Locatie dubbel',
      },
    },
    ernst: {
      type: 'text',
      label: 'Ernst',
      options: { conflict: 'Conflict', waarschuwing: 'Waarschuwing' },
      tones: { conflict: 'bad', waarschuwing: 'warn' },
    },
    persoon_id: { type: 'integer', label: 'Persoon', nullable: true, relation: 'persoon' },
    toewijzing_id: { type: 'integer', label: 'Toewijzing', nullable: true },
    ander_toewijzing_id: { type: 'integer', label: 'Andere toewijzing', nullable: true },
    activiteit_id: { type: 'integer', label: 'Activiteit', relation: 'activiteit' },
    ander_activiteit_id: { type: 'integer', label: 'Andere activiteit', nullable: true, relation: 'activiteit' },
    locatie_id: { type: 'integer', label: 'Locatie', nullable: true, relation: 'organisatie' },
    productie_id: { type: 'integer', label: 'Productie', relation: 'productie' },
    plandag: { type: 'date', label: 'Plandag' },
    omschrijving: { type: 'text', label: 'Omschrijving' },
  },
})

export const persoonDag = defineQuery({
  name: 'persoon_dag',
  label: 'Per persoon per dag',
  icon: 'user',
  title: 'omschrijving',
  date: 'plandag',
  calendar: { day: 'plandag', start: 'start_at', end: 'eind_at', lanes: ['persoon_id', 'productie_id'] },
  scoped: 'productie_id',
  sql: sqlOf('persoon_dag'),
  columns: {
    id: { type: 'integer', label: 'Id' },
    toewijzing_id: { type: 'integer', label: 'Toewijzing' },
    persoon_id: { type: 'integer', label: 'Persoon', relation: 'persoon' },
    activiteit_id: { type: 'integer', label: 'Activiteit', relation: 'activiteit' },
    productie_id: { type: 'integer', label: 'Productie', relation: 'productie' },
    rol_id: { type: 'integer', label: 'Rol', nullable: true, relation: 'rol' },
    omschrijving: { type: 'text', label: 'Omschrijving', nullable: true },
    soort: { type: 'text', label: 'Soort', ...soorten },
    plandag: { type: 'date', label: 'Plandag' },
    datum: { type: 'date', label: 'Datum' },
    start_at: { type: 'datetime', label: 'Start', nullable: true },
    eind_at: { type: 'datetime', label: 'Einde', nullable: true },
    locatie_id: { type: 'integer', label: 'Locatie', nullable: true, relation: 'organisatie' },
    state: {
      type: 'text',
      label: 'Status',
      writes: { dataset: 'toewijzing', field: 'state', key: 'toewijzing_id' },
    },
    beschikbaarheid: {
      type: 'text',
      label: 'Beschikbaarheid',
      nullable: true,
      options: { afwezig: 'Afwezig', onzeker: 'Onzeker', beschikbaar: 'Beschikbaar', voorkeur: 'Voorkeur' },
      tones: { afwezig: 'bad', onzeker: 'warn', beschikbaar: 'ok', voorkeur: 'sky' },
    },
    conflicten: { ...count('Conflicten'), badge: 'bad' },
  },
})

export const locatieDag = defineQuery({
  name: 'locatie_dag',
  label: 'Per locatie per dag',
  icon: 'pin',
  title: 'omschrijving',
  date: 'plandag',
  calendar: { day: 'plandag', start: 'start_at', end: 'eind_at', lanes: ['locatie_id', 'productie_id'] },
  scoped: 'productie_id',
  sql: sqlOf('locatie_dag'),
  columns: {
    id: { type: 'integer', label: 'Id' },
    activiteit_id: { type: 'integer', label: 'Activiteit', relation: 'activiteit' },
    locatie_id: { type: 'integer', label: 'Locatie', relation: 'organisatie' },
    productie_id: { type: 'integer', label: 'Productie', relation: 'productie' },
    omschrijving: { type: 'text', label: 'Omschrijving', nullable: true },
    soort: { type: 'text', label: 'Soort', ...soorten },
    plandag: { type: 'date', label: 'Plandag' },
    datum: { type: 'date', label: 'Datum' },
    start_at: { type: 'datetime', label: 'Start', nullable: true, writes: toActiviteit('start_at') },
    eind_at: { type: 'datetime', label: 'Einde', nullable: true, writes: toActiviteit('eind_at') },
    status: { type: 'text', label: 'Status', writes: toActiviteit('status') },
    conflicten: { ...count('Conflicten'), badge: 'bad' },
  },
})

export const kandidaten = defineQuery({
  name: 'kandidaten',
  label: 'Kandidaten',
  icon: 'users',
  title: 'naam',
  sql: sqlOf('kandidaten'),
  columns: {
    id: { type: 'integer', label: 'Id' },
    toewijzing_id: { type: 'integer', label: 'Open plaats' },
    persoon_id: { type: 'integer', label: 'Persoon', relation: 'persoon' },
    naam: { type: 'text', label: 'Naam' },
    activiteit_id: { type: 'integer', label: 'Activiteit', relation: 'activiteit' },
    rol_id: { type: 'integer', label: 'Rol', relation: 'rol' },
    voorkeur: { type: 'boolean', label: 'Voorkeur' },
    rang: { type: 'integer', label: 'Rang' },
  },
})

/** Who could take an assigned place instead: the same role, free, not on the activity yet; ranked as kandidaten ranks an open one. */
export const vervangers = defineQuery({
  name: 'vervangers',
  label: 'Vervangers',
  icon: 'users',
  title: 'naam',
  sql: sqlOf('vervangers'),
  columns: {
    id: { type: 'integer', label: 'Id' },
    toewijzing_id: { type: 'integer', label: 'Toewijzing' },
    persoon_id: { type: 'integer', label: 'Persoon', relation: 'persoon' },
    naam: { type: 'text', label: 'Naam' },
    activiteit_id: { type: 'integer', label: 'Activiteit', relation: 'activiteit' },
    rol_id: { type: 'integer', label: 'Rol', relation: 'rol' },
    voorkeur: { type: 'boolean', label: 'Voorkeur' },
    rang: { type: 'integer', label: 'Rang' },
  },
})

export const werklijst = defineQuery({
  name: 'werklijst',
  label: 'Werklijst',
  icon: 'check',
  title: 'titel',
  date: 'deadline',
  scoped: 'productie_id',
  sql: sqlOf('werklijst'),
  columns: {
    id: { type: 'integer', label: 'Id' },
    soort: {
      type: 'text',
      label: 'Soort',
      options: { taak: 'Taak', open_slot: 'Open plaats', onbeantwoord: 'Onbeantwoord', optie: 'Optie' },
    },
    persoon_id: { type: 'integer', label: 'Persoon', nullable: true, relation: 'persoon' },
    titel: { type: 'text', label: 'Titel' },
    deadline: { type: 'date', label: 'Deadline', nullable: true },
    taak_id: { type: 'integer', label: 'Taak', nullable: true, relation: 'taak' },
    status: {
      type: 'text',
      label: 'Status',
      nullable: true,
      writes: { dataset: 'taak', field: 'status', key: 'taak_id' },
    },
    productie_id: { type: 'integer', label: 'Productie', nullable: true, relation: 'productie' },
  },
})

// Each assignment with its activity's day and production, so a dashboard's places narrow to the chosen production.
export const plaatsen = defineQuery({
  name: 'plaatsen',
  label: 'Plaatsen',
  icon: 'users',
  title: 'wat',
  date: 'datum',
  scoped: 'productie_id',
  sql: sqlOf('plaatsen'),
  columns: {
    id: { type: 'integer', label: 'Id' },
    activiteit_id: { type: 'integer', label: 'Activiteit', relation: 'activiteit' },
    wat: { type: 'text', label: 'Activiteit' },
    rol_id: { type: 'integer', label: 'Rol', nullable: true, relation: 'rol' },
    persoon_id: { type: 'integer', label: 'Persoon', nullable: true, relation: 'persoon' },
    state: {
      type: 'text',
      label: 'Status',
      options: {
        open: 'Open',
        voorlopig: 'Voorlopig',
        uitgenodigd: 'Uitgenodigd',
        bevestigd: 'Bevestigd',
        geweigerd: 'Geweigerd',
        geannuleerd: 'Geannuleerd',
      },
    },
    datum: { type: 'date', label: 'Datum' },
    productie_id: { type: 'integer', label: 'Productie', relation: 'productie' },
  },
})
