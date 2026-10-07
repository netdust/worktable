import type { Domain } from '../../src'
import base from './seed-domain'

// The badge writer fails with a plain Error, not a refusal.
const crash: Domain = {
  ...base,
  writers: {
    ...base.writers,
    badge: {
      create: () => {
        throw new Error('disk on fire')
      },
    },
  },
}

export default crash
