import type { Domain } from '@worktable/engine'
import { sjabloonToepassen, vulSlot } from './actions'
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
import { mijnProducties, productieDag, voorstellingen } from './queries'
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
  queries: [productieDag, voorstellingen, mijnProducties],
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
  actions: { sjabloon_toepassen: sjabloonToepassen, vul_slot: vulSlot },
  space: { dataset: 'productie' },
  // Section names and order are a draft, pending Stefan's approval.
  sections: [
    { label: 'Planning', sources: ['speelreeks', 'activiteit', 'toewijzing', 'beschikbaarheid'] },
    { label: 'Gegevens', sources: ['productie', 'persoon', 'organisatie'] },
    { label: 'Instellingen', sources: ['rol', 'sjabloon'] },
    { label: 'Overzichten', sources: ['productie_dag', 'voorstellingen', 'mijn_producties'] },
  ],
  seed,
  views,
}

export default theatre
