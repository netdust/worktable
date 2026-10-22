import type { Writer } from '@worktable/engine'
import { actieWriter } from './actie'

const passThrough: Writer = { create: (values) => values, update: (values) => values, delete() {} }

export const writers: Record<string, Writer> = {
  organisatie: passThrough,
  site: passThrough,
  groep: passThrough,
  groep_lid: passThrough,
  actie: actieWriter,
  actie_site: passThrough,
  onderhoud: passThrough,
  project: passThrough,
  werkpakket: passThrough,
  taak: passThrough,
  agendapunt: passThrough,
}
