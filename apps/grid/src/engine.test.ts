import { describe, expect, it } from 'vitest'
import { columnsFor } from './grid/columns'
import { defaults } from './grid/layout'
import { type EngineSchema, rowsQuery, toEngineData, toRow, toSavedViews, toSchema } from './engine'

/** The theatre declarations and seeded views, trimmed to what the adapter reads. */
const engine: EngineSchema = {
  sources: {
    productie: {
      kind: 'dataset', label: 'Producties', title: 'titel', date: null,
      columns: { titel: { type: 'text', label: 'Titel' } },
    },
    activiteit: {
      kind: 'dataset', label: 'Activiteiten', title: 'omschrijving', date: 'plandag',
      columns: {
        productie_id: { type: 'integer', label: 'Productie', relation: 'productie' },
        soort: { type: 'text', label: 'Soort', options: { opbouw: 'Opbouw', repetitie: 'Repetitie' } },
        omschrijving: { type: 'text', label: 'Omschrijving', nullable: true },
        start_at: { type: 'datetime', label: 'Start' },
        plandag: { type: 'date', label: 'Plandag' },
        uren: { type: 'real', label: 'Uren', nullable: true },
        betaald: { type: 'boolean', label: 'Betaald', default: false },
        extra: { type: 'json', label: 'Extra', nullable: true },
        status: { type: 'text', label: 'Status', default: 'optie', options: { optie: 'Optie', bevestigd: 'Bevestigd' } },
      },
    },
    productie_dag: {
      kind: 'query', label: 'Per productie per dag', title: 'productie', date: 'plandag',
      columns: {
        id: { type: 'integer', label: 'Id' },
        productie: { type: 'text', label: 'Productie' },
        plandag: { type: 'date', label: 'Plandag' },
        activiteiten: { type: 'integer', label: 'Activiteiten' },
      },
    },
  },
  views: [
    {
      id: 1, name: 'Planning', source_type: 'dataset', source: 'activiteit', skin: 'table',
      filters: { status: 'bevestigd' }, sort: ['start_at'], group_by: 'plandag',
      visible_fields: ['productie_id', 'soort', 'start_at', 'status'],
    },
    {
      id: 2, name: 'Per productie per dag', source_type: 'query', source: 'productie_dag', skin: 'table',
      filters: {}, sort: ['-productie'], group_by: null, visible_fields: ['productie', 'plandag'],
    },
  ],
}

describe('toSchema', () => {
  it("maps a dataset's columns to model fields by type", () => {
    const fields = toSchema(engine).models.activiteit.fields

    expect(fields.start_at.type).toBe('text')
    expect(fields.extra.type).toBe('json')
    expect(fields.uren.type).toBe('float')
    expect(fields.betaald.type).toBe('bool')
    expect(fields.plandag.type).toBe('date')
    expect(fields.soort).toMatchObject({ type: 'select', options: { opbouw: 'Opbouw', repetitie: 'Repetitie' } })
    expect(fields.productie_id).toMatchObject({ type: 'relation', relation: { model: 'productie', multiple: false } })
    expect(toSchema(engine).models.productie_dag.fields.activiteiten.type).toBe('int')
    expect(toSchema(engine).models.productie.fields).toEqual({})
  })

  it('names the title column after its label and leaves it out of the fields', () => {
    const model = toSchema(engine).models.activiteit

    expect(model.title_label).toBe('Omschrijving')
    expect(model.fields.omschrijving).toBeUndefined()
  })

  it('declares one table per source a saved view uses, no starting views, nothing writable', () => {
    const schema = toSchema(engine)

    expect(schema.tables.map((t) => t.key)).toEqual(['activiteit', 'productie_dag'])
    expect(schema.tables[0]).toMatchObject({ label: 'Activiteiten', model: 'activiteit', date_field: 'plandag', types: ['grid'] })
    expect(schema.views).toEqual([])
    expect(schema.writable).toEqual({ productie: false, activiteit: false, productie_dag: false })
  })
})

describe('writes', () => {
  /** The theatre's writable shapes: activiteit has a writer, dagplanning maps status to it, productie has none. */
  const writes: EngineSchema = {
    sources: {
      productie: { ...engine.sources.productie, writable: false },
      activiteit: {
        ...engine.sources.activiteit, writable: true,
        columns: { ...engine.sources.activiteit.columns, plandag: { type: 'date', label: 'Plandag', readonly: true } },
      },
      dagplanning: {
        kind: 'query', label: 'Dagplanning', title: 'omschrijving', date: 'plandag', writable: true,
        columns: {
          id: { type: 'integer', label: 'Id' },
          activiteit_id: { type: 'integer', label: 'Activiteit' },
          omschrijving: { type: 'text', label: 'Omschrijving', nullable: true },
          productie: { type: 'text', label: 'Productie' },
          status: { type: 'text', label: 'Status', writes: { dataset: 'activiteit', field: 'status', key: 'activiteit_id' } },
        },
      },
    },
    views: [],
  }
  const editable = (source: string) => {
    const model = toSchema(writes).models[source]
    const view = { key: source, label: source, table: source, model: source }
    return Object.fromEntries(columnsFor(model, view, toSchema(writes).writable[source]).map((c) => [c.id, c.editable]))
  }

  it('a readonly column and an unmapped query column are not editable', () => {
    expect(toSchema(writes).writable).toEqual({ productie: false, activiteit: true, dagplanning: true })
    expect(editable('activiteit')).toMatchObject({ title: true, status: true, plandag: false })
    expect(editable('dagplanning')).toMatchObject({ title: false, status: true, activiteit_id: false, productie: false })
    expect(editable('productie')).toMatchObject({ title: false })
  })

  it('the title field maps to the title column on write', () => {
    expect(toEngineData({ title: 'opbouw Gent', status: 'optie' }, writes.sources.activiteit, writes.sources)).toEqual({ omschrijving: 'opbouw Gent', status: 'optie' })
  })

  it("a mapped query column takes its target's options and relation, unless it declares its own", () => {
    const own: EngineSchema = {
      ...writes,
      sources: {
        ...writes.sources,
        dagplanning: {
          ...writes.sources.dagplanning,
          columns: {
            ...writes.sources.dagplanning.columns,
            soort: { type: 'text', label: 'Soort', options: { reis: 'Reis' }, writes: { dataset: 'activiteit', field: 'soort', key: 'activiteit_id' } },
            productie_id: { type: 'integer', label: 'Productie', writes: { dataset: 'activiteit', field: 'productie_id', key: 'activiteit_id' } },
          },
        },
      },
    }
    const fields = toSchema(own).models.dagplanning.fields
    const status = columnsFor(toSchema(own).models.dagplanning, { key: 'd', label: 'd', table: 'dagplanning', model: 'dagplanning' }, true).find((c) => c.id === 'status')

    expect(fields.status).toMatchObject({ type: 'select', options: { optie: 'Optie', bevestigd: 'Bevestigd' } })
    expect(status?.text?.({ id: 40, title: '', status: '', fields: { status: 'optie' } })).toBe('Optie')
    expect(fields.soort).toMatchObject({ type: 'select', options: { reis: 'Reis' } })
    expect(fields.productie_id).toMatchObject({ type: 'relation', relation: { model: 'productie', multiple: false } })
  })
})

describe('toRow', () => {
  it('takes the title the engine gives', () => {
    const row = toRow({
      id: 3, productie_id: 1, omschrijving: 'opbouw Gent', soort: 'opbouw', plandag: '2026-10-12', title: 'opbouw Gent',
      custom: {}, lookups: { productie_id: { id: 1, title: 'De Kersentuin' } },
    })

    expect(row).toEqual({
      id: 3,
      title: 'opbouw Gent',
      status: '',
      fields: { productie_id: 1, omschrijving: 'opbouw Gent', soort: 'opbouw', plandag: '2026-10-12' },
      lookups: { productie_id: { id: 1, title: 'De Kersentuin', status: '', fields: {} } },
    })
  })

  it('keeps an empty relation empty, and a missing title as empty text', () => {
    const row = toRow({ id: 4, omschrijving: null, title: '', custom: {}, lookups: { productie_id: null } })

    expect(row.title).toBe('')
    expect(row.lookups).toEqual({ productie_id: null })
  })
})

describe('toSavedViews', () => {
  it('builds the arrangement: Planning opens with the status chip bevestigd, sort start_at, group plandag', () => {
    const planning = toSavedViews(engine)[0]

    expect(planning.arrangement.filters).toEqual([{ field: 'status', value: 'bevestigd' }])
    expect(planning.arrangement.sort).toEqual([{ id: 'start_at', desc: false }])
    expect(planning.arrangement.group).toBe('plandag')
    expect(planning.arrangement.hidden).toEqual(['plandag', 'uren', 'betaald', 'extra'])
  })

  it("Planning's SavedView has key '1', label 'Planning', table 'activiteit', date_field 'plandag'", () => {
    expect(toSavedViews(engine)[0]).toMatchObject({
      key: '1', id: 1, label: 'Planning', table: 'activiteit', table_label: 'Activiteiten', model: 'activiteit',
      date_field: 'plandag', type: 'grid', starting: false, shared: true, mine: false, editable: false,
    })
  })

  it("sorts on the title column as the grid's title, descending on a leading -", () => {
    expect(toSavedViews(engine)[1].arrangement.sort).toEqual([{ id: 'title', desc: true }])
  })

  it('reads $eq chips and leaves other operators out', () => {
    const views = toSavedViews({ ...engine, views: [{ ...engine.views[0], filters: { soort: { $eq: 'opbouw' }, plandag: { $gte: '2026-10-01' } } }] })

    expect(views[0].arrangement.filters).toEqual([{ field: 'soort', value: 'opbouw' }])
  })
})

describe('rowsQuery', () => {
  const view = toSavedViews(engine)[0]
  const layout = { ...defaults(view), filters: [] }

  it("maps a title sort to the source's title column and drops lookups.* and rollups.* ids", () => {
    const sort = [{ id: 'title', desc: false }, { id: 'lookups.productie_id.titel', desc: false }, { id: 'rollups.uren', desc: true }, { id: 'start_at', desc: true }]

    expect(rowsQuery(view, { ...layout, sort }, {}, 'omschrijving').sort).toBe('omschrijving,-start_at')
  })

  it('sends chips as $eq filter JSON, sort with - for desc, group and the window', () => {
    const query = rowsQuery(
      view,
      { ...layout, filters: [{ field: 'status', value: 'bevestigd' }, { field: 'productie_id', value: '1' }], sort: [{ id: 'start_at', desc: true }], group: 'plandag' },
      { from: '2026-10-12', to: '2026-10-18' },
      'omschrijving',
    )

    expect(query).toEqual({
      filter: JSON.stringify({ status: { $eq: 'bevestigd' }, productie_id: { $eq: '1' } }),
      sort: '-start_at',
      group: 'plandag',
      from: '2026-10-12',
      to: '2026-10-18',
    })
  })

  it('sends nothing for an empty layout and no window', () => {
    expect(rowsQuery(view, { ...layout, sort: [], group: null }, {}, 'omschrijving')).toEqual({})
  })
})

describe('the matrix and titles through a relation', () => {
  /** Theatre's matrix: toewijzing joins activiteit to persoon; beschikbaarheid says who is away. */
  const theatre: EngineSchema = {
    sources: {
      persoon: { kind: 'dataset', label: 'Personen', title: 'weergavenaam', date: null, writable: true, columns: { weergavenaam: { type: 'text', label: 'Weergavenaam' } } },
      activiteit: { ...engine.sources.activiteit, writable: true, matrix_join: 'toewijzing' },
      toewijzing: {
        kind: 'dataset', label: 'Toewijzingen', title: 'naam', title_via: 'persoon_id', date: null, writable: true, deletable: true,
        columns: {
          activiteit_id: { type: 'integer', label: 'Activiteit', relation: 'activiteit' },
          persoon_id: { type: 'integer', label: 'Persoon', relation: 'persoon', nullable: true },
          naam: { type: 'text', label: 'Naam', nullable: true },
          state: { type: 'text', label: 'Status', options: { uitgenodigd: 'Uitgenodigd', bevestigd: 'Bevestigd' } },
          notitie: { type: 'text', label: 'Notitie', nullable: true },
        },
        matrix: {
          down: 'activiteit_id', across: 'persoon_id', label: 'naam', cell: 'state', note: 'notitie',
          keys: { u: 'uitgenodigd', b: 'bevestigd' }, marks: { uitgenodigd: '?', bevestigd: '✓' }, count: 'bevestigd',
          away: { dataset: 'beschikbaarheid', across: 'persoon_id', label: 'reden', end: 'eind_at' },
        },
      },
      beschikbaarheid: {
        kind: 'dataset', label: 'Beschikbaarheden', title: 'reden', title_via: 'persoon_id', date: 'start_at', writable: true,
        columns: {
          persoon_id: { type: 'integer', label: 'Persoon', relation: 'persoon' },
          start_at: { type: 'datetime', label: 'Start' },
          eind_at: { type: 'datetime', label: 'Einde' },
          reden: { type: 'text', label: 'Reden', nullable: true },
        },
      },
    },
    views: [
      { id: 4, name: 'Toewijzingen per activiteit', source_type: 'dataset', source: 'activiteit', skin: 'matrix', filters: {}, sort: [], group_by: null, visible_fields: ['status'] },
      { id: 8, name: 'Toewijzingen', source_type: 'dataset', source: 'toewijzing', skin: 'table', filters: {}, sort: ['naam'], group_by: null, visible_fields: ['activiteit_id', 'persoon_id', 'naam', 'state'] },
    ],
  }

  it("builds the down source's table with the join and away from the join dataset's matrix", () => {
    const table = toSchema(theatre).tables.find((t) => t.key === 'activiteit')

    expect(table).toMatchObject({
      types: ['grid', 'matrix'],
      join: {
        model: 'toewijzing', row_field: 'activiteit_id', column_field: 'persoon_id', name_field: 'naam', cell_field: 'state', note_field: 'notitie',
        keys: { u: 'uitgenodigd', b: 'bevestigd' }, marks: { uitgenodigd: '?', bevestigd: '✓' }, count: 'bevestigd',
      },
      away: { table: 'beschikbaarheid', model: 'beschikbaarheid', column_field: 'persoon_id', label_field: 'reden', date_field: 'start_at', end_field: 'eind_at' },
    })
    expect(toSchema(theatre).tables.find((t) => t.key === 'toewijzing')).toMatchObject({ types: ['grid'] })
  })

  it('opens a matrix-skinned saved view as a matrix, with its table\'s join', () => {
    expect(toSavedViews(theatre)[0]).toMatchObject({ key: '4', type: 'matrix', join: { model: 'toewijzing' }, away: { model: 'beschikbaarheid' } })
    expect(toSavedViews(theatre)[1].type).toBe('grid')
  })

  it("takes the row's title from the engine and its cells as rollups.cells", () => {
    const row = toRow({
      id: 2, omschrijving: 'repetitie Gent', title: 'repetitie Gent', custom: {}, lookups: {},
      cells: [{ id: 4, activiteit_id: 2, persoon_id: 1, naam: null, state: 'bevestigd', title: 'Lotte Verhaegen', custom: {}, lookups: { persoon_id: { id: 1, title: 'Lotte Verhaegen' } } }],
    })

    expect(row.title).toBe('repetitie Gent')
    expect(row.fields.cells).toBeUndefined()
    expect(row.rollups?.cells).toEqual([
      { id: 4, title: 'Lotte Verhaegen', status: '', fields: { activiteit_id: 2, persoon_id: 1, naam: null, state: 'bevestigd' }, lookups: { persoon_id: { id: 1, title: 'Lotte Verhaegen', status: '', fields: {} } } },
    ])
    expect(toRow({ id: 3, custom: {}, lookups: {} }).title).toBe('')
  })

  it('on Toewijzing naam is an editable field and the title is not, nor sortable', () => {
    const schema = toSchema(theatre)
    const model = schema.models.toewijzing
    const columns = columnsFor(model, { key: 't', label: 't', table: 'toewijzing', model: 'toewijzing' }, schema.writable.toewijzing)
    const byId = Object.fromEntries(columns.map((c) => [c.id, c]))

    expect(model.title_readonly).toBe(true)
    expect(model.title_label).toBe('Persoon / Naam')
    expect(model.fields.naam).toMatchObject({ type: 'text', label: 'Naam' })
    expect(byId.naam.editable).toBe(true)
    expect(byId.title.editable).toBe(false)
    expect(byId.title.sortable).toBe(false)
    expect(byId.naam.sortable).not.toBe(false)
  })

  it("keeps naam as naam in a via-title view's arrangement and on the wire, and never writes the title", () => {
    const toewijzingen = toSavedViews(theatre)[1]

    expect(toewijzingen.arrangement.sort).toEqual([{ id: 'naam', desc: false }])
    expect(toewijzingen.arrangement.hidden).toEqual(['notitie'])
    expect(toEngineData({ title: 'Lotte', naam: 'Gastmuzikant' }, theatre.sources.toewijzing, theatre.sources)).toEqual({ naam: 'Gastmuzikant' })
    expect(toEngineData({ persoon_id: [5], activiteit_id: [2] }, theatre.sources.toewijzing, theatre.sources)).toEqual({ persoon_id: 5, activiteit_id: 2 })
  })

  it('never sends the title of a via-title source as sort or group', () => {
    const layout = { ...defaults(toSavedViews(theatre)[1]), filters: [], sort: [{ id: 'title', desc: false }, { id: 'naam', desc: true }], group: 'title' }

    expect(rowsQuery({}, layout, {}, null)).toEqual({ sort: '-naam' })
  })
})
