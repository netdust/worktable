import type { Writer } from '@worktable/engine'
import { actieWriter } from './actie'
import { actieSiteWriter } from './actie-site'

const passThrough: Writer = { create: (values) => values, update: (values) => values, delete() {} }

export const writers: Record<string, Writer> = {
  organisatie: passThrough,
  site: passThrough,
  groep: passThrough,
  groep_lid: passThrough,
  actie: actieWriter,
  actie_site: actieSiteWriter,
  onderhoud: passThrough,
  project: passThrough,
  werkpakket: passThrough,
  taak: passThrough,
  agendapunt: passThrough,
}
