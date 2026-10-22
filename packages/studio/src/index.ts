import type { Domain } from '@worktable/engine'
import {
  actie,
  actieSite,
  agendapunt,
  groep,
  groepLid,
  onderhoud,
  organisatie,
  project,
  site,
  taak,
  werkpakket,
} from './datasets'
import { agenda, opTafel, sitesAandacht, sitesInOrde } from './queries'
import { seed, views } from './seed'
import { writers } from './writers'

const studio: Domain = {
  datasets: [organisatie, site, groep, groepLid, actie, actieSite, onderhoud, project, werkpakket, taak, agendapunt],
  queries: [sitesAandacht, sitesInOrde, opTafel, agenda],
  writers,
  space: { dataset: 'organisatie' },
  sections: [
    { label: 'Vloot', sources: ['site', 'groep', 'actie', 'onderhoud'] },
    { label: 'Werk', sources: ['project', 'werkpakket', 'taak', 'agendapunt', 'agenda', 'op_tafel'] },
    { label: 'Klanten', sources: ['organisatie'] },
  ],
  seed,
  views,
}

export default studio
