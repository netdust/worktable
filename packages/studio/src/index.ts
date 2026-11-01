import type { Domain } from '@worktable/engine'
import { actions } from './actions'
import { actie, actieSite, agendapunt, onderhoud, organisatie, project, site, taak, werkpakket } from './datasets'
import { agenda, opTafel, sitesAandacht, sitesInOrde } from './queries'
import { seed, views } from './seed'
import { writers } from './writers'

const studio: Domain = {
  datasets: [organisatie, site, actie, actieSite, onderhoud, project, werkpakket, taak, agendapunt],
  queries: [sitesAandacht, sitesInOrde, opTafel, agenda],
  writers,
  actions,
  space: { dataset: 'organisatie' },
  sections: [
    { label: 'Vloot', sources: ['site'] },
    { label: 'Werk', sources: ['project', 'werkpakket', 'taak'] },
    { label: 'Planning', sources: ['agendapunt'] },
    { label: 'Logboek', sources: ['actie', 'onderhoud'] },
    { label: 'Klanten', sources: ['organisatie'] },
  ],
  seed,
  views,
}

export default studio
