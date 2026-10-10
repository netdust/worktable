import { readFileSync } from 'node:fs'
import { defineQuery } from '@worktable/engine'

const count = (label: string) => ({ type: 'integer' as const, label })

export const productieDag = defineQuery({
  name: 'productie_dag',
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
