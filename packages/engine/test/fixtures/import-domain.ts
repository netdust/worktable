import type { DatasetDecl, Domain } from '../../src'
import { domain as base } from '../fixture'

// The fixture domain made importable: project gains a create writer and legacy_post_id, plat a create writer.
const withLegacy = (d: DatasetDecl): DatasetDecl =>
  d.name !== 'project'
    ? d
    : {
        ...d,
        columns: { ...d.columns, legacy_post_id: { type: 'integer', label: 'Legacy', nullable: true, readonly: true } },
      }

const accept = (values: Record<string, unknown>) => values

const domain: Domain = {
  ...base,
  datasets: base.datasets.map(withLegacy),
  writers: { ...base.writers, project: { create: accept, delete: () => {} }, plat: { create: accept } },
}

export default domain
