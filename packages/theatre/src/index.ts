import type { Domain } from '@worktable/engine'
import { activiteit, beschikbaarheid, organisatie, persoon, productie, toewijzing } from './datasets'
import { dagplanning, productieDag, voorstellingen } from './queries'
import { seed, views } from './seed'
import {
  activiteitWriter,
  beschikbaarheidWriter,
  organisatieWriter,
  persoonWriter,
  productieWriter,
  toewijzingWriter,
} from './writers'

export { plandag } from './plandag'

const theatre: Domain = {
  datasets: [organisatie, productie, activiteit, persoon, toewijzing, beschikbaarheid],
  queries: [productieDag, dagplanning, voorstellingen],
  writers: {
    organisatie: organisatieWriter,
    productie: productieWriter,
    activiteit: activiteitWriter,
    persoon: persoonWriter,
    toewijzing: toewijzingWriter,
    beschikbaarheid: beschikbaarheidWriter,
  },
  seed,
  views,
}

export default theatre
