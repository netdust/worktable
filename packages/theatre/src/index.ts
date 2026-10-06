import type { Domain } from '@worktable/engine'
import { sjabloonToepassen } from './actions'
import {
  activiteit,
  beschikbaarheid,
  organisatie,
  persoon,
  productie,
  rol,
  sjabloon,
  speelreeks,
  toewijzing,
} from './datasets'
import { dagplanning, productieDag, voorstellingen } from './queries'
import { seed, views } from './seed'
import {
  activiteitWriter,
  beschikbaarheidWriter,
  organisatieWriter,
  persoonWriter,
  productieWriter,
  rolWriter,
  sjabloonWriter,
  speelreeksWriter,
  toewijzingWriter,
} from './writers'

export { plandag } from './plandag'

const theatre: Domain = {
  datasets: [organisatie, productie, speelreeks, activiteit, persoon, toewijzing, beschikbaarheid, rol, sjabloon],
  queries: [productieDag, dagplanning, voorstellingen],
  writers: {
    organisatie: organisatieWriter,
    productie: productieWriter,
    activiteit: activiteitWriter,
    persoon: persoonWriter,
    toewijzing: toewijzingWriter,
    beschikbaarheid: beschikbaarheidWriter,
    rol: rolWriter,
    speelreeks: speelreeksWriter,
    sjabloon: sjabloonWriter,
  },
  actions: { sjabloon_toepassen: sjabloonToepassen },
  seed,
  views,
}

export default theatre
