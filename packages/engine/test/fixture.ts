import { Database } from 'bun:sqlite'
import { type Domain, defineDataset, defineQuery, migrate, seedDomain } from '../src'

const project = defineDataset({
  name: 'project',
  label: 'Projecten',
  title: 'naam',
  custom: true,
  columns: { naam: { type: 'text', label: 'Naam' } },
})

const taak = defineDataset({
  name: 'taak',
  label: 'Taken',
  title: 'omschrijving',
  date: 'dag',
  custom: true,
  columns: {
    project_id: { type: 'integer', label: 'Project', relation: 'project' },
    omschrijving: { type: 'text', label: 'Omschrijving' },
    status: { type: 'text', label: 'Status', options: { open: 'Open', klaar: 'Klaar' } },
    prio: { type: 'integer', label: 'Prio', nullable: true },
    start_at: { type: 'datetime', label: 'Start' },
    dag: { type: 'date', label: 'Dag' },
    afgerond: { type: 'boolean', label: 'Afgerond', default: false },
  },
})

const plat = defineDataset({
  name: 'plat',
  label: 'Plat',
  title: 'naam',
  custom: false,
  columns: { naam: { type: 'text', label: 'Naam' } },
})

const perProject = defineQuery({
  name: 'per_project',
  label: 'Per project',
  title: 'naam',
  date: 'dag',
  sql: `SELECT MIN(t.id) AS id, t.project_id, p.naam, t.dag, COUNT(*) AS aantal
        FROM taak t JOIN project p ON p.id = t.project_id WHERE t.deleted_at IS NULL GROUP BY t.project_id, t.dag`,
  columns: {
    id: { type: 'integer', label: 'Id' },
    project_id: { type: 'integer', label: 'Project', relation: 'project' },
    naam: { type: 'text', label: 'Naam' },
    dag: { type: 'date', label: 'Dag' },
    aantal: { type: 'integer', label: 'Aantal' },
  },
})

export const domain: Domain = {
  datasets: [project, taak, plat],
  queries: [perProject],
  seed: (insert) => {
    insert('project', [{ naam: 'Alfa', custom: { kleur: 'rood', labels: ['a', 'b'] } }, { naam: 'Beta' }])
    insert('taak', [
      {
        project_id: 1,
        omschrijving: 'een',
        status: 'open',
        prio: 2,
        start_at: '2026-10-12T09:00',
        dag: '2026-10-12',
        custom: { kleur: 'rood', labels: ['a', 'b'] },
      },
      {
        project_id: 1,
        omschrijving: 'twee',
        status: 'klaar',
        prio: 1,
        start_at: '2026-10-12T08:00',
        dag: '2026-10-12',
        afgerond: true,
        custom: { kleur: 'blauw', labels: 'a' },
      },
      {
        project_id: 2,
        omschrijving: 'drie',
        status: 'open',
        prio: null,
        start_at: '2026-10-14T10:00',
        dag: '2026-10-14',
      },
      { project_id: 2, omschrijving: 'vier', status: 'open', prio: 5, start_at: '2026-10-15T10:00', dag: '2026-10-15' },
    ])
    insert('plat', [{ naam: 'x' }])
  },
  views: [
    {
      name: 'Open',
      source_type: 'dataset',
      source: 'taak',
      skin: 'table',
      filters: { status: 'open' },
      sort: ['start_at'],
      group_by: 'dag',
      visible_fields: ['omschrijving'],
    },
  ],
}

export function freshDb(): Database {
  const sqlite = new Database(':memory:')
  migrate(sqlite, domain)
  seedDomain(sqlite, domain)
  return sqlite
}
