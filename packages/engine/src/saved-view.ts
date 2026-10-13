import { defineDataset } from './declare'

export const savedView = defineDataset({
  name: 'saved_view',
  label: 'Saved view',
  title: 'name',
  custom: false,
  columns: {
    name: { type: 'text', label: 'Name' },
    source_type: {
      type: 'text',
      label: 'Source type',
      options: { dataset: 'dataset', query: 'query' },
      nullable: true,
    },
    source: { type: 'text', label: 'Source', nullable: true },
    skin: {
      type: 'text',
      label: 'Skin',
      default: 'table',
      options: {
        table: 'table',
        calendar: 'calendar',
        matrix: 'matrix',
        list: 'list',
        board: 'board',
        timeline: 'timeline',
        gallery: 'gallery',
        dashboard: 'dashboard',
      },
    },
    layout: { type: 'json', label: 'Layout', nullable: true },
    filters: { type: 'json', label: 'Filters', default: '{}' },
    sort: { type: 'json', label: 'Sort', default: '[]' },
    group_by: { type: 'text', label: 'Group by', nullable: true },
    visible_fields: { type: 'json', label: 'Visible fields', default: '[]' },
    owner_id: { type: 'integer', label: 'Owner', nullable: true },
    shared: { type: 'boolean', label: 'Shared', default: false },
    share_token: { type: 'text', label: 'Share token', nullable: true },
    format: { type: 'text', label: 'Format', default: 'html', options: { html: 'html', ical: 'ical', pdf: 'pdf' } },
    public: { type: 'boolean', label: 'Public', default: false },
    for_owners: { type: 'boolean', label: 'For owners', default: false },
  },
})
