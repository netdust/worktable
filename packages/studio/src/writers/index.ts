import { forbid, type Writer } from '@worktable/engine'
import { actieWriter } from './actie'
import { actieSiteWriter } from './actie-site'
import { onderhoudWriter } from './onderhoud'
import { agendapuntWriter, organisatieWriter, projectWriter, taakWriter, werkpakketWriter } from './planning'
import { siteWriter } from './site'

// A service token can reach DELETE directly: a writer's own rules speak first, then no service deletes.
function noServiceDeletes(writer: Writer): Writer {
  const { delete: inner } = writer
  if (!inner) return writer
  return {
    ...writer,
    delete(ctx) {
      inner.call(writer, ctx)
      if (ctx.actor.kind === 'service') forbid('Een serviceaccount verwijdert geen rijen.')
    },
  }
}

const own: Record<string, Writer> = {
  organisatie: organisatieWriter,
  site: siteWriter,
  actie: actieWriter,
  actie_site: actieSiteWriter,
  onderhoud: onderhoudWriter,
  project: projectWriter,
  werkpakket: werkpakketWriter,
  taak: taakWriter,
  agendapunt: agendapuntWriter,
}

export const writers: Record<string, Writer> = Object.fromEntries(
  Object.entries(own).map(([name, writer]) => [name, noServiceDeletes(writer)]),
)
