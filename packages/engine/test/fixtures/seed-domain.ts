import { type Domain, defineDataset, refuse, type WriteContext } from '../../src'
import { domain as base } from '../fixture'

// The fixture domain with two config datasets: badge, whose writer derives and refuses, and kit, which points at it.
const badge = defineDataset({
  name: 'badge',
  label: 'Badges',
  title: 'name',
  custom: false,
  config: true,
  columns: {
    name: { type: 'text', label: 'Name' },
    size: { type: 'integer', label: 'Size', readonly: true },
    maker: { type: 'text', label: 'Maker', readonly: true },
  },
})

const kit = defineDataset({
  name: 'kit',
  label: 'Kits',
  title: 'name',
  custom: false,
  config: true,
  columns: {
    name: { type: 'text', label: 'Name' },
    badge_id: { type: 'integer', label: 'Badge', relation: 'badge' },
  },
})

function deriveBadge(values: Record<string, unknown>, ctx: WriteContext): Record<string, unknown> {
  const name = String(values.name)
  if (name === 'bad') refuse('a badge may not be called bad')
  return { ...values, size: name.length, maker: `${ctx.actor.id}:${ctx.actor.role}` }
}

export const badgeRows: Record<string, unknown>[] = [{ name: 'gold' }, { name: 'silver', size: 99 }]

export function seedDomainWith(rows: Record<string, unknown>[]): Domain {
  return {
    ...base,
    datasets: [...base.datasets, badge, kit],
    writers: { ...base.writers, badge: { create: deriveBadge }, kit: { create: (values) => values } },
    seed: (insert) => {
      base.seed(insert)
      insert('badge', rows)
      insert('kit', [{ name: 'starter', badge_id: 1 }])
    },
    views: [
      ...base.views,
      {
        name: 'Badges',
        source_type: 'dataset',
        source: 'badge',
        skin: 'table',
        filters: {},
        sort: ['name'],
        group_by: null,
        visible_fields: ['name', 'size'],
      },
    ],
  }
}

export default seedDomainWith(badgeRows)
