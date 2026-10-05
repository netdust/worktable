import type { Model, Row, Schema, View } from '../types'

/** The Calais week as the rows API serves it — laika's words live in fixtures only. */
export const activity: Model = {
  key: 'activity',
  label: 'Activiteit',
  title_label: 'Titel',
  title_readonly: false,
  fields: {
    date: { type: 'date', label: 'Datum', required: true, fact: true },
    start: { type: 'text', label: 'Start', required: false, fact: true, description: 'HH:MM, 24-hour. Empty means all-day.' },
    end: { type: 'text', label: 'Einde', required: false, fact: true, description: 'HH:MM, 24-hour. Empty means all-day.' },
    kind: {
      type: 'select', label: 'Soort', required: true, fact: true,
      options: { travel: 'Reis', build: 'Opbouw', rehearsal: 'Repetitie', show: 'Voorstelling', meal: 'Maaltijd' },
    },
    status: {
      type: 'select', label: 'Status', required: true, fact: true,
      options: { confirmed: 'Bevestigd', option: 'Optie', cancelled: 'Geannuleerd' },
    },
    location: { type: 'relation', label: 'Locatie', required: false, fact: true, relation: { model: 'organisation', multiple: false } },
    place: { type: 'text', label: 'Plaats', required: false, fact: false, description: 'The room or spot when no organisation names it' },
    settled_by: { type: 'select', label: 'Geregeld door', required: false, fact: true, options: { company: 'Gezelschap', programmer: 'Programmator' } },
    notes: { type: 'textarea', label: 'Notities', required: false, fact: false },
    seats: { type: 'int', label: 'Plaatsen', required: false, fact: true },
    paid: { type: 'bool', label: 'Betaald', required: false, fact: true },
  },
}

/** Served merged over its table, as `Json::view` sends it. */
export const planning: View = {
  key: 'planning',
  label: 'Planning',
  table: 'planning',
  table_label: 'Planning',
  model: 'activity',
  type: 'grid',
  date_field: 'date',
  columns: ['title', 'date', 'start', 'end', 'kind', 'status', 'location', 'place', 'settled_by'],
  lookups: { location: ['title'] },
  rollups: { confirmed: { model: 'assignment', field: 'activity', count: true, filter: { status: 'confirmed' } } },
  filters: [],
  sort: ['date', 'start'],
  group: 'date',
}

const channel = { id: 12, title: 'Le Grenier, Calais', status: 'publish', fields: {} }

function row(id: number, title: string, date: string, start: string, kind: string, status: string, confirmed: number): Row {
  return {
    id, title, status: 'publish',
    fields: { date, start, end: '', kind, status, location: 12, place: 'Grote zaal', settled_by: '', notes: '' },
    lookups: { location: channel },
    rollups: { confirmed },
  }
}

export const calais: Row[] = [
  row(101, 'Auto Pavel + Sien', '2026-05-18', '07:30', 'travel', 'confirmed', 2),
  row(102, 'Montage', '2026-05-18', '10:00', 'build', 'confirmed', 4),
  row(103, 'Lunch bistrot', '2026-05-18', '13:00', 'meal', 'confirmed', 6),
  row(104, 'Repetitie', '2026-05-19', '10:00', 'rehearsal', 'confirmed', 12),
  row(105, 'Présentation interne', '2026-05-19', '16:30', 'show', 'option', 12),
  row(106, 'Diner door Rosalie', '2026-05-20', '18:00', 'meal', 'confirmed', 11),
]

export const schema: Schema = {
  models: { activity },
  tables: [
    { key: 'planning', label: 'Planning', model: 'activity', types: ['grid'] },
    { key: 'absences', label: 'Afwezigheden', model: 'absence', types: ['grid'] },
  ],
  views: [planning, { key: 'absences', label: 'Afwezigheden', model: 'absence', table: 'absences' }],
  writable: { activity: true },
}
