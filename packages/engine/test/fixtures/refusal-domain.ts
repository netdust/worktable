import { type Domain, defineDataset } from '../../src'

// Without REFUSAL_STEP the item table has one column; with it, a NOT NULL column without a default is added.
const columns = {
  label: { type: 'text', label: 'Label' },
  ...(process.env.REFUSAL_STEP ? { code: { type: 'text', label: 'Code' } } : {}),
} as const

const domain: Domain = {
  datasets: [
    defineDataset({ name: 'item', label: 'Entries', title: 'label', custom: false, columns: columns as never }),
  ],
  queries: [],
  seed: () => {},
  views: [],
}

export default domain
