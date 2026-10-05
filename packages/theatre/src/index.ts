import type { Domain } from '@worktable/engine'
import { activiteit, productie } from './datasets'
import { productieDag } from './queries'
import { seed, views } from './seed'

export { plandag } from './plandag'

const theatre: Domain = { datasets: [productie, activiteit], queries: [productieDag], seed, views }

export default theatre
