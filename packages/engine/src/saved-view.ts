import { defineDataset } from './declare'

export const savedView = defineDataset({
  name: 'saved_view',
  label: 'Weergave',
  title: 'name',
  custom: false,
  columns: {
    name: { type: 'text', label: 'Naam' },
    source_type: { type: 'text', label: 'Brontype', options: { dataset: 'dataset', query: 'query' } },
    source: { type: 'text', label: 'Bron' },
    skin: {
      type: 'text',
      label: 'Skin',
      default: 'table',
      options: { table: 'table', calendar: 'calendar', matrix: 'matrix', list: 'list', board: 'board' },
    },
    filters: { type: 'json', label: 'Filters', default: '{}' },
    sort: { type: 'json', label: 'Sortering', default: '[]' },
    group_by: { type: 'text', label: 'Groepering', nullable: true },
    visible_fields: { type: 'json', label: 'Zichtbare velden', default: '[]' },
    scope: { type: 'text', label: 'Bereik', default: 'shared' },
    owner_id: { type: 'integer', label: 'Eigenaar', nullable: true },
    share_token: { type: 'text', label: 'Deeltoken', nullable: true },
    format: { type: 'text', label: 'Formaat', default: 'html', options: { html: 'html', ical: 'ical', pdf: 'pdf' } },
    public: { type: 'boolean', label: 'Openbaar', default: false },
  },
})
