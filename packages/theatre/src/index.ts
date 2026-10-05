import type { Domain } from '@worktable/engine'
import { activiteit, productie } from './datasets'
import { dagplanning, productieDag } from './queries'
import { seed, views } from './seed'
import { activiteitWriter } from './writers'

export { plandag } from './plandag'

const theatre: Domain = {
  datasets: [productie, activiteit],
  queries: [productieDag, dagplanning],
  writers: { activiteit: activiteitWriter },
  seed,
  views,
}

export default theatre
