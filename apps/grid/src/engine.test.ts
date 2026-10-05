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
    expect(toEngineData({ title: 'opbouw Gent', status: 'optie' }, 'omschrijving')).toEqual({ omschrijving: 'opbouw Gent', status: 'optie' })
  })
})

describe('toRow', () => {
  it('takes the title from the declared title column', () => {
    const row = toRow(
      {
        id: 3, productie_id: 1, omschrijving: 'opbouw Gent', soort: 'opbouw', plandag: '2026-10-12',
        custom: {}, lookups: { productie_id: { id: 1, title: 'De Kersentuin' } },
      },
      'omschrijving',
    )

    expect(row).toEqual({
      id: 3,
      title: 'opbouw Gent',
      status: '',
      fields: { productie_id: 1, soort: 'opbouw', plandag: '2026-10-12' },
      lookups: { productie_id: { id: 1, title: 'De Kersentuin', status: '', fields: {} } },
    })
  })

  it('keeps an empty relation empty, and a missing title as empty text', () => {
    const row = toRow({ id: 4, omschrijving: null, custom: {}, lookups: { productie_id: null } }, 'omschrijving')

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
