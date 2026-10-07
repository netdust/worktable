import { describe, expect, it } from 'vitest'
import { columnsFor } from './grid/columns'
import { defaults } from './grid/layout'
import { type EngineSchema, type EngineView, fromStoredView, rowsQuery, toEngineData, toRow, toSavedViews, toSchema, toStoredView } from './engine'
import { orderOf, show } from './grid/layout'

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
}

/** As `GET /api/views` serves them: the seeded ones are the dev actor's, and shared. */
const owned = { shared: true, owner_id: 0, mine: true, editable: true }
const views: EngineView[] = [
  {
    id: 1, name: 'Planning', source_type: 'dataset', source: 'activiteit', skin: 'table',
    filters: { status: 'bevestigd' }, sort: ['start_at'], group_by: 'plandag',
    visible_fields: ['productie_id', 'soort', 'start_at', 'status'], ...owned,
  },
  {
    id: 2, name: 'Per productie per dag', source_type: 'query', source: 'productie_dag', skin: 'table',
    filters: {}, sort: ['-productie'], group_by: null, visible_fields: ['productie', 'plandag'], ...owned,
  },
]

describe('toSchema: space, sections, facts and inherited', () => {
  const declared: EngineSchema = {
    sources: {
      season: { kind: 'dataset', label: 'Seizoenen', title: 'name', date: null, space: 'global', columns: { name: { type: 'text', label: 'Naam' } } },
      session: {
        kind: 'query', label: 'Sessies', title: 'name', date: 'day', space: 'scoped',
        group_facts: [{ kind: 'count', label: 'sessies' }, { kind: 'empty', column: 'room', label: 'zonder zaal' }],
        columns: {
          name: { type: 'text', label: 'Naam' },
          day: { type: 'date', label: 'Dag' },
          season_id: { type: 'integer', label: 'Seizoen', relation: 'season' },
          room: { type: 'text', label: 'Zaal', inherited: { flag: 'room_from', own: 'self' } },
          room_from: { type: 'text', label: 'Zaal van', options: { self: 'Eigen', block: 'Blok' } },
        },
      },
    },
    space: { model: 'season', field: 'season_id' },
    sections: [{ label: 'Werk', sources: ['session'] }],
  }

  it('maps the space, the sections, each table\'s space and facts, and a column\'s inherited', () => {
    const schema = toSchema(declared)

    expect(schema.space).toEqual({ model: 'season', field: 'season_id' })
    expect(schema.sections).toEqual([{ label: 'Werk', sources: ['session'] }])
    expect(schema.tables.map((t) => [t.key, t.space, t.facts])).toEqual([
      ['season', 'global', undefined],
      ['session', 'scoped', declared.sources.session.group_facts],
    ])
    expect(schema.models.session.fields.room.inherited).toEqual({ flag: 'room_from', own: 'self' })
    expect(schema.models.session.fields.room_from.inherited).toBeUndefined()
  })

  it('carries the table\'s space and facts onto its saved views', () => {
    const [view] = toSavedViews([{ ...views[0], id: 5, source: 'session', source_type: 'query', filters: {}, sort: [], visible_fields: [] }], declared.sources)

    expect(view).toMatchObject({ space: 'scoped', facts: declared.sources.session.group_facts })
  })

  it("maps an administrator's icon onto its table, and none where the engine serves null", () => {
    const iconed: EngineSchema = { sources: { ...declared.sources, season: { ...declared.sources.season, icon: 'star' }, session: { ...declared.sources.session, icon: null } } }
    const schema = toSchema(iconed)

    expect(schema.tables.map((t) => [t.key, t.icon])).toEqual([['season', 'star'], ['session', undefined]])
    expect('icon' in (schema.tables[1] ?? {})).toBe(false)
  })

  it('maps none of it for a domain that declares none', () => {
    const schema = toSchema(engine)

    expect('space' in schema).toBe(false)
    expect('sections' in schema).toBe(false)
    expect(schema.tables.some((t) => 'space' in t || 'facts' in t)).toBe(false)
    expect(Object.values(schema.models).flatMap((m) => Object.values(m.fields)).some((f) => 'inherited' in f)).toBe(false)
  })
})

describe('toSchema: a query over a dataset', () => {
  const over: EngineSchema = { sources: { ...engine.sources, productie_dag: { ...engine.sources.productie_dag, of: 'activiteit' } } }

  it("carries `of` onto the query's table and its saved views, and keeps the view's table and model the query", () => {
    const table = toSchema(over).tables.find((t) => t.key === 'productie_dag')
    const [view] = toSavedViews([views[1]], over.sources)

    expect(table?.of).toBe('activiteit')
    expect([view.of, view.table, view.model]).toEqual(['activiteit', 'productie_dag', 'productie_dag'])
  })

  it('carries no `of` where the engine serves none', () => {
    expect(toSchema(engine).tables.map((t) => t.of)).toEqual([undefined, undefined, undefined])
  })
})

describe('toSchema', () => {
  it("maps a dataset's columns to model fields by type", () => {
    const fields = toSchema(engine).models.activiteit.fields

    expect(fields.start_at.type).toBe('datetime')
    expect(toSchema(engine).models.activiteit.title_required).toBe(false)
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

  it('declares a table for every source, no starting views, nothing writable', () => {
    const schema = toSchema(engine)

    expect(schema.tables.map((t) => t.key)).toEqual(['productie', 'activiteit', 'productie_dag'])
    expect(schema.tables[1]).toMatchObject({ label: 'Activiteiten', model: 'activiteit', date_field: 'plandag', types: ['grid'] })
    expect(schema.views).toEqual([])
    expect(schema.writable).toEqual({ productie: false, activiteit: false, productie_dag: false })
  })

  it("carries a dataset's actions to its model, and none where it declares none", () => {
    const apply = { name: 'sjabloon_toepassen', label: 'Sjabloon toepassen', input: { sjabloon_id: { relation: 'sjabloon', label: 'Sjabloon' } } }
    const schema = toSchema({ sources: { ...engine.sources, productie: { ...engine.sources.productie, actions: [apply] }, activiteit: { ...engine.sources.activiteit, actions: [] } } })

    expect(schema.models.productie.actions).toEqual([apply])
    expect(schema.models.activiteit).not.toHaveProperty('actions')
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

  it('a cleared nullable datetime goes on the wire as null, never as an empty string', () => {
    const source = { ...writes.sources.activiteit, columns: { ...writes.sources.activiteit.columns, start_at: { type: 'datetime' as const, label: 'Start', nullable: true } } }
    expect(toEngineData({ start_at: '' }, source, writes.sources)).toEqual({ start_at: null })
  })

  it("a mapped query column reads the options the engine serves on it, and its target's relation", () => {
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

    expect(fields.status).toMatchObject({ type: 'text' })
    expect(status?.text?.({ id: 40, title: '', status: '', fields: { status: 'optie' } })).toBe('optie')
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
  const saved = () => toSavedViews(views, engine.sources)

  it('builds the arrangement: Planning opens with the status chip bevestigd, sort start_at, group plandag', () => {
    const planning = saved()[0]

    expect(planning.arrangement.filters).toEqual([{ field: 'status', value: 'bevestigd' }])
    expect(planning.arrangement.sort).toEqual([{ id: 'start_at', desc: false }])
    expect(planning.arrangement.group).toBe('plandag')
    expect(planning.arrangement.hidden).toEqual(['plandag', 'uren', 'betaald', 'extra'])
    expect(planning.arrangement.order).toEqual(['title', 'productie_id', 'soort', 'start_at', 'status'])
  })

  it("Planning's SavedView has key '1', label 'Planning', table 'activiteit', date_field 'plandag', and the engine's owner flags", () => {
    expect(saved()[0]).toMatchObject({
      key: '1', id: 1, label: 'Planning', table: 'activiteit', table_label: 'Activiteiten', model: 'activiteit',
      date_field: 'plandag', type: 'grid', starting: false, shared: true, owner: { id: 0, name: '' }, mine: true, editable: true,
    })
    const foreign = toSavedViews([{ ...views[0], shared: false, owner_id: 7, mine: false, editable: false }], engine.sources)[0]
    expect(foreign).toMatchObject({ shared: false, owner: { id: 7, name: '' }, mine: false, editable: false })
  })

  it("sorts on the title column as the grid's title, descending on a leading -", () => {
    expect(saved()[1].arrangement.sort).toEqual([{ id: 'title', desc: true }])
  })

  it('reads $eq chips and keeps every other filter as fixed: an operator beside $eq, $in, a range, a custom key', () => {
    const filters = {
      soort: { $eq: 'opbouw' }, plandag: { $gte: '2026-10-01' }, status: { $in: ['optie', 'bevestigd'], $eq: 'optie' }, 'custom.zaal': { $in: ['groot'] },
    }
    const [view] = toSavedViews([{ ...views[0], filters }], engine.sources)

    expect(view.arrangement.filters).toEqual([{ field: 'soort', value: 'opbouw' }, { field: 'status', value: 'optie' }])
    expect(view.fixed).toEqual({ plandag: { $gte: '2026-10-01' }, status: { $in: ['optie', 'bevestigd'] }, 'custom.zaal': { $in: ['groot'] } })
  })

  it('leaves out a view whose source is not served', () => {
    expect(toSavedViews([{ ...views[0], source: 'gone' }], engine.sources)).toEqual([])
  })
})

describe('an arrangement on the wire', () => {
  const activiteit = engine.sources.activiteit
  const planning = views[0]

  it('round-trips: chips, sort, group, the visible columns in order, the title column first', () => {
    const { arrangement, fixed } = fromStoredView(planning, activiteit)
    const stored = toStoredView(arrangement, fixed, activiteit)

    expect(stored).toEqual({
      filters: { status: { $eq: 'bevestigd' } },
      sort: ['start_at'],
      group_by: 'plandag',
      visible_fields: ['omschrijving', 'productie_id', 'soort', 'start_at', 'status'],
    })
    expect(fromStoredView({ ...planning, ...stored }, activiteit)).toEqual({ arrangement, fixed })
  })

  it('keeps the title column where the view stores it, through a read and a save', () => {
    const later = { ...planning, visible_fields: ['start_at', 'omschrijving', 'soort', 'status'] }
    const { arrangement, fixed } = fromStoredView(later, activiteit)

    expect(arrangement.order).toEqual(['start_at', 'title', 'soort', 'status'])
    expect(toStoredView(arrangement, fixed, activiteit).visible_fields).toEqual(['start_at', 'omschrijving', 'soort', 'status'])
    const moved = { ...arrangement, order: ['soort', 'start_at', 'title', 'status'] }
    expect(toStoredView(moved, fixed, activiteit).visible_fields).toEqual(['soort', 'start_at', 'omschrijving', 'status'])
  })

  it('keeps a reorder and drops what only the grid keeps: widths, picks, matrix keys, lookups and the title id', () => {
    const { arrangement } = fromStoredView(planning, activiteit)
    const changed = {
      ...arrangement, order: ['title', 'status', 'lookups.productie_id.titel', 'productie_id', 'soort', 'start_at'], hidden: [...arrangement.hidden, 'record:5', 'name:lieve'],
      widths: [{ id: 'status', width: 90 }], picked: [5], sort: [{ id: 'title', desc: true }, { id: 'rollups.uren', desc: false }],
    }

    expect(toStoredView(changed, {}, activiteit)).toEqual({
      filters: { status: { $eq: 'bevestigd' } },
      sort: ['-omschrijving'],
      group_by: 'plandag',
      visible_fields: ['omschrijving', 'status', 'productie_id', 'soort', 'start_at'],
    })
  })

  it('loses a hidden column\'s place: shown again after a re-read, it comes last', () => {
    const { arrangement } = fromStoredView(planning, activiteit)
    const hidden = { ...arrangement, hidden: [...arrangement.hidden, 'soort'] }
    const reread = fromStoredView({ ...planning, ...toStoredView(hidden, {}, activiteit) }, activiteit).arrangement
    const fields = ['productie_id', 'soort', 'start_at', 'status']

    expect(orderOf({ ...arrangement, widths: {} }, fields)).toEqual(['productie_id', 'soort', 'start_at', 'status'])
    expect(orderOf(show({ ...reread, widths: {} }, 'soort'), fields)).toEqual(['productie_id', 'start_at', 'status', 'soort'])
  })

  it('merges a chip and a fixed filter per key: both conditions survive a Save', () => {
    const seeded = { ...planning, filters: { status: { $in: ['optie', 'bevestigd'] } } }
    const { arrangement, fixed } = fromStoredView(seeded, activiteit)

    expect(toStoredView(arrangement, fixed, activiteit).filters).toEqual({ status: { $in: ['optie', 'bevestigd'] } })
    const chipped = { ...arrangement, filters: [{ field: 'status', value: 'optie' }, { field: 'soort', value: 'opbouw' }] }
    expect(toStoredView(chipped, fixed, activiteit).filters).toEqual({ status: { $in: ['optie', 'bevestigd'], $eq: 'optie' }, soort: { $eq: 'opbouw' } })
  })

  it("keeps a via-title source's else column as an ordinary column, with no title column", () => {
    const toewijzing = { ...engine.sources.productie, title: 'naam', title_via: 'persoon_id', columns: { persoon_id: { type: 'integer' as const, label: 'Persoon', relation: 'productie' }, naam: { type: 'text' as const, label: 'Naam' } } }
    const view = { ...planning, source: 'toewijzing', filters: {}, sort: ['naam'], group_by: null, visible_fields: ['naam'] }
    const { arrangement, fixed } = fromStoredView(view, toewijzing)

    expect(arrangement.hidden).toEqual(['persoon_id'])
    expect(toStoredView(arrangement, fixed, toewijzing)).toEqual({ filters: {}, sort: ['naam'], group_by: null, visible_fields: ['naam'] })
  })
})

describe('rowsQuery', () => {
  const view = toSavedViews(views, engine.sources)[0]
  const layout = { ...defaults(view), filters: [] }

  it("maps a title sort to the source's title column and drops lookups.* and rollups.* ids", () => {
    const sort = [{ id: 'title', desc: false }, { id: 'lookups.productie_id.titel', desc: false }, { id: 'rollups.uren', desc: true }, { id: 'start_at', desc: true }]

    expect(rowsQuery(view, { ...layout, sort }, {}, 'omschrijving').sort).toBe('omschrijving,-start_at')
  })

  it('keeps a chip and a fixed filter on the same key, and a fixed filter alone', () => {
    const fixed = { status: { $in: ['optie', 'bevestigd'] }, soort: { $ne: 'repetitie' } }
    const query = rowsQuery({ ...view, fixed }, { ...layout, filters: [{ field: 'status', value: 'bevestigd' }] }, {}, 'omschrijving')

    expect(JSON.parse(query.filter)).toEqual({ status: { $in: ['optie', 'bevestigd'], $eq: 'bevestigd' }, soort: { $ne: 'repetitie' } })
    expect(JSON.parse(rowsQuery({ ...view, fixed }, layout, {}, 'omschrijving').filter)).toEqual(fixed)
  })

  it('lets a chip win over a bare fixed value on the same key: both are $eq', () => {
    const query = rowsQuery({ ...view, fixed: { status: null } }, { ...layout, filters: [{ field: 'status', value: 'optie' }] }, {}, 'omschrijving')

    expect(JSON.parse(query.filter)).toEqual({ status: { $eq: 'optie' } })
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
  }
  const theatreViews: EngineView[] = [
    { id: 4, name: 'Toewijzingen per activiteit', source_type: 'dataset', source: 'activiteit', skin: 'matrix', filters: {}, sort: [], group_by: null, visible_fields: ['status'], ...owned },
    { id: 8, name: 'Toewijzingen', source_type: 'dataset', source: 'toewijzing', skin: 'table', filters: {}, sort: ['naam'], group_by: null, visible_fields: ['activiteit_id', 'persoon_id', 'naam', 'state'], ...owned },
  ]

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
    expect(toSavedViews(theatreViews, theatre.sources)[0]).toMatchObject({ key: '4', type: 'matrix', join: { model: 'toewijzing' }, away: { model: 'beschikbaarheid' } })
    expect(toSavedViews(theatreViews, theatre.sources)[1].type).toBe('grid')
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
    const toewijzingen = toSavedViews(theatreViews, theatre.sources)[1]

    expect(toewijzingen.arrangement.sort).toEqual([{ id: 'naam', desc: false }])
    expect(toewijzingen.arrangement.hidden).toEqual(['notitie'])
    expect(toEngineData({ title: 'Lotte', naam: 'Gastmuzikant' }, theatre.sources.toewijzing, theatre.sources)).toEqual({ naam: 'Gastmuzikant' })
    expect(toEngineData({ persoon_id: [5], activiteit_id: [2] }, theatre.sources.toewijzing, theatre.sources)).toEqual({ persoon_id: 5, activiteit_id: 2 })
  })

  it('never sends the title of a via-title source as sort or group', () => {
    const layout = { ...defaults(toSavedViews(theatreViews, theatre.sources)[1]), filters: [], sort: [{ id: 'title', desc: false }, { id: 'naam', desc: true }], group: 'title' }

    expect(rowsQuery({}, layout, {}, null)).toEqual({ sort: '-naam' })
  })
})

describe('links', () => {
  const MENSEN = {
    label: 'Mensen', item: 'Toewijzing', dataset: 'toewijzing', key: 'activiteit_id', target: 'persoon_id', target_dataset: 'persoon',
    state: { options: { uitgenodigd: 'Uitgenodigd', bevestigd: 'Bevestigd' }, tones: { uitgenodigd: 'warn' as const, bevestigd: 'ok' as const }, default: 'uitgenodigd' },
  }
  const dag = {
    kind: 'query' as const, label: 'Dagplanning', title: 'omschrijving', date: 'plandag',
    columns: {
      omschrijving: { type: 'text' as const, label: 'Omschrijving' },
      locatie_id: { type: 'integer' as const, label: 'Locatie', nullable: true },
      status: { type: 'text' as const, label: 'Status' },
    },
    links: { mensen: MENSEN },
  }
  const stored = {
    id: 9, name: 'Dagplanning', source_type: 'query' as const, source: 'dagplanning', skin: 'table' as const,
    filters: {}, sort: [], group_by: null, visible_fields: ['omschrijving', 'locatie_id', 'mensen', 'status'],
    shared: true, owner_id: -1, mine: false, editable: false,
  }

  it('makes a link a field of type links, with what the cell needs', () => {
    const { models } = toSchema({ sources: { dagplanning: dag } } as unknown as EngineSchema)
    expect(models.dagplanning?.fields.mensen).toEqual({
      type: 'links', label: 'Mensen', required: false, fact: false,
      link: { item: 'Toewijzing', dataset: 'toewijzing', key: 'activiteit_id', target: 'persoon_id', target_dataset: 'persoon', state: MENSEN.state },
    })
  })

  it("puts a row's links among its fields", () => {
    const people = [{ id: 7, target: 3, title: 'Lotte', state: 'bevestigd' }]
    const row = toRow({ id: 1, omschrijving: 'x', title: 'x', custom: {}, lookups: {}, links: { mensen: people } })
    expect(row.fields).toEqual({ omschrijving: 'x', mensen: people })
  })

  it('keeps a link in a saved view: shown in place, and hidden', () => {
    const { arrangement, fixed } = fromStoredView(stored, dag)
    expect(arrangement.order).toEqual(['title', 'locatie_id', 'mensen', 'status'])
    expect(toStoredView(arrangement, fixed, dag).visible_fields).toEqual(['omschrijving', 'locatie_id', 'mensen', 'status'])
    const hidden = { ...arrangement, hidden: [...arrangement.hidden, 'mensen'] }
    expect(toStoredView(hidden, fixed, dag).visible_fields).toEqual(['omschrijving', 'locatie_id', 'status'])
  })
})
