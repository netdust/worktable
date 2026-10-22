import type { Writer } from '@worktable/engine'

const passThrough: Writer = { create: (values) => values, update: (values) => values, delete() {} }

export const writers: Record<string, Writer> = {
  organisatie: passThrough,
  site: passThrough,
  groep: passThrough,
  groep_lid: passThrough,
  actie: passThrough,
  actie_site: passThrough,
  onderhoud: passThrough,
  project: passThrough,
  werkpakket: passThrough,
  taak: passThrough,
  agendapunt: passThrough,
}
