import { describe, expect, it } from 'vitest'
import type { Link, Model, Schema } from '../../types'
import { activity, schema as theatre } from '../calais.test.data'
import { type Column, columnsFor } from '../columns'
import { inboundOf, linkedOf } from './derive'
import { panesOf } from './panes'

const field = (type: string, extra: object = {}) => ({ type, label: type, required: false, fact: false, ...extra }) as unknown as Model['fields'][string]
const column = (id: string, kind: string, label = id): Column => ({ id, kind, label, text: () => '' }) as unknown as Column
const link = (dataset: string, target_dataset: string): Link => ({ item: 'Regel', dataset, key: 'host_id', target: 'ding_id', target_dataset })

// An invented domain: a host with two long texts, pointed at by two dated tables.
const host = { key: 'host', label: 'Hosts', fields: { naam: field('text'), memo: field('textarea'), log: field('textarea') } } as unknown as Model
const pointing = (key: string) => ({ key, label: key, fields: { host_id: field('relation', { relation: { model: 'host', multiple: false } }) } }) as unknown as Model
const schema = {
  models: { host, beurt: pointing('beurt'), klus: pointing('klus') },
  tables: [
    { key: 'hosts', label: 'Hosts', model: 'host', icon: 'box' },
    { key: 'beurten', label: 'Beurten', model: 'beurt', date_field: 'op', icon: 'clock' },
    { key: 'klussen', label: 'Klussen', model: 'klus', date_field: 'op' },
  ],
  views: [],
  writable: {},
} as unknown as Schema

const none = { longs: [], links: [], inbound: [], history: false, files: false, schema }

describe('the drawer splits into panes from the shapes it reads', () => {
  it('orders Gegevens, Notities, the inbound tables and Geschiedenis, keyed by shape and named by the schema', () => {
    const panes = panesOf({ ...none, longs: [column('memo', 'longtext'), column('log', 'longtext')], inbound: inboundOf(schema, 'host'), history: true })
    expect(panes.map((p) => p.key)).toEqual(['fields', 'notes', 'inbound:beurt:host_id', 'inbound:klus:host_id', 'history'])
    expect(panes.map((p) => p.label)).toEqual(['Gegevens', 'Notities', 'Beurten', 'Klussen', 'Geschiedenis'])
    expect(panes.map((p) => p.kind)).toEqual(['fields', 'notes', 'inbound', 'inbound', 'history'])
    // A table's own icon where it declares one, else the generic table.
    expect(panes[2].icon.displayName).toBe('Clock')
    expect(panes[3].icon.displayName).toBe('Table2')
  })

  it('keeps the first link in Gegevens and gives every later link its own pane, after Notities', () => {
    const links = [
      { key: 'mensen', column: column('mensen', 'links', 'Mensen'), link: link('rol', 'host') },
      { key: 'spullen', column: column('spullen', 'links', 'Spullen'), link: link('lading', 'beurt') },
    ]
    const panes = panesOf({ ...none, longs: [column('memo', 'longtext')], links, files: true })
    expect(panes.map((p) => p.key)).toEqual(['fields', 'notes', 'link:spullen', 'files'])
    expect(panes[2].label).toBe('Spullen')
    expect(panes[2].icon.displayName).toBe('Clock')
    expect(panes[3].label).toBe('Bijlagen')
  })

  it('leaves out a pane with nothing to show: no long text, no history, no files', () => {
    expect(panesOf(none).map((p) => p.key)).toEqual(['fields'])
  })

  it("gives another domain's record the same kinds of panes from its own shapes", () => {
    const people = field('links', { label: 'Mensen', link: link('assignment', 'person') })
    const model = { ...activity, fields: { ...activity.fields, people } } as Model
    const columns = columnsFor(model, { ...theatre.views[0], columns: undefined }, false)
    const panes = panesOf({ ...none, longs: columns.filter((c) => c.kind === 'longtext'), links: linkedOf(columns, model), history: true, schema: theatre })
    expect(panes.map((p) => p.kind)).toEqual(['fields', 'notes', 'history'])
  })
})
