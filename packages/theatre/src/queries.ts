import { readFileSync } from 'node:fs'
import { defineQuery } from '@worktable/engine'

const count = (label: string) => ({ type: 'integer' as const, label })

export const productieDag = defineQuery({
  name: 'productie_dag',
  label: 'Per productie per dag',
  title: 'productie',
  date: 'plandag',
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
  label: 'Dagplanning',
  title: 'omschrijving',
  date: 'plandag',
  sql: readFileSync(new URL('./queries/dagplanning.sql', import.meta.url), 'utf8'),
  columns: {
    id: { type: 'integer', label: 'Id' },
    activiteit_id: { type: 'integer', label: 'Activiteit' },
    productie_id: { type: 'integer', label: 'Productie', relation: 'productie' },
    productie: { type: 'text', label: 'Productie' },
    omschrijving: { type: 'text', label: 'Omschrijving', nullable: true },
    soort: { type: 'text', label: 'Soort' },
    start_at: { type: 'datetime', label: 'Start', writes: writesActiviteit('start_at') },
    plandag: { type: 'date', label: 'Plandag' },
    status: { type: 'text', label: 'Status', writes: writesActiviteit('status') },
  },
})
