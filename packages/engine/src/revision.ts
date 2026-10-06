import { defineDataset } from './declare'

export const revision = defineDataset({
  name: 'revision',
  label: 'Revision',
  title: 'field',
  custom: false,
  columns: {
    entity: { type: 'text', label: 'Entity' },
    record_id: { type: 'integer', label: 'Record' },
    field: { type: 'text', label: 'Field' },
    old: { type: 'text', label: 'Old', nullable: true },
    new: { type: 'text', label: 'New', nullable: true },
    actor_id: { type: 'integer', label: 'Actor' },
    at: { type: 'datetime', label: 'At' },
    batch_id: { type: 'text', label: 'Batch' },
  },
  indexes: [['entity', 'record_id'], ['batch_id']],
})
