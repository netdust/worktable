import type { Domain } from '@worktable/engine'
import { fiche } from './datasets'
import { zichtbareFiches } from './queries'
import { seed, views } from './seed'
import { ficheWriter } from './writers'

const ficheDomain: Domain = {
  datasets: [fiche],
  queries: [zichtbareFiches],
  writers: { fiche: ficheWriter },
  seed,
  views,
}

export default ficheDomain
