import type { Domain } from '@worktable/engine'
import { sjabloonToepassen, tourstopVerschuiven, vulSlot } from './actions'
import {
  activiteit,
  beschikbaarheid,
  organisatie,
  persoon,
  persoonRol,
  productie,
  rol,
  sjabloon,
  speelreeks,
  taak,
  toewijzing,
} from './datasets'
import {
  conflicten,
  kandidaten,
  locatieDag,
  mijnProducties,
  persoonDag,
  plaatsen,
  productieDag,
  vervangers,
  voorstellingen,
  werklijst,
} from './queries'
import { seed, views } from './seed'
import {
  activiteitWriter,
  beschikbaarheidWriter,
  organisatieWriter,
  persoonRolWriter,
  persoonWriter,
  productieWriter,
  rolWriter,
  sjabloonWriter,
  speelreeksWriter,
  taakWriter,
  toewijzingWriter,
} from './writers'

export { plandag } from './plandag'

const theatre: Domain = {
  datasets: [
    organisatie,
    productie,
    speelreeks,
    activiteit,
    persoon,
    toewijzing,
    beschikbaarheid,
    rol,
    sjabloon,
    persoonRol,
    taak,
  ],
  queries: [
    conflicten,
    persoonDag,
    locatieDag,
    kandidaten,
    werklijst,
    plaatsen,
    productieDag,
    voorstellingen,
    mijnProducties,
  ],
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
    persoon_rol: persoonRolWriter,
    taak: taakWriter,
  },
  actions: { sjabloon_toepassen: sjabloonToepassen, vul_slot: vulSlot, tourstop_verschuiven: tourstopVerschuiven },
  space: { dataset: 'productie' },
  // Section names and order are a draft, pending Stefan's approval.
  sections: [
    { label: 'Planning', sources: ['speelreeks', 'activiteit', 'toewijzing', 'beschikbaarheid', 'taak'] },
    { label: 'Gegevens', sources: ['productie', 'persoon', 'persoon_rol', 'organisatie'] },
    { label: 'Instellingen', sources: ['rol', 'sjabloon'] },
    {
      label: 'Overzichten',
      sources: [
        'conflicten',
        'persoon_dag',
        'locatie_dag',
        'kandidaten',
        'werklijst',
        'plaatsen',
        'productie_dag',
        'voorstellingen',
        'mijn_producties',
      ],
    },
  ],
  seed,
  views,
}

export default theatre
