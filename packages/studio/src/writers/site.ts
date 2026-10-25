import { forbid, refuse, type WriteContext, type Writer } from '@worktable/engine'

type Values = Record<string, unknown>

export const SYNCED_COLUMNS = ['naam', 'in_registry']

export const HEALTH_COLUMNS = [
  'gezondheid',
  'statuscode',
  'responstijd_ms',
  'wp_versie',
  'php_versie',
  'updates_plugins',
  'updates_themas',
  'updates_core',
  'tls_dagen',
  'laatste_check',
]

export const STUDIO_COLUMNS = ['organisatie_id', 'sla', 'smoke_urls', 'notities', 'bekende_admins']

const SLA_OWN = 'De SLA is van studio: de worker zet ze alleen bij een nieuwe site.'

const isUser = (ctx: WriteContext): boolean => (ctx.actor.kind ?? 'user') === 'user'

function checkUnique(ctx: WriteContext, values: Values): void {
  if (typeof values.naam === 'string' && ctx.exists('site', { naam: values.naam })) {
    refuse('Er is al een site met deze naam.')
  }
}

// The worker finds a confirmed link's production site by its name, so a name never changes; the sync resends it as is.
function checkNameKept(values: Values, current: Values): void {
  if (Object.hasOwn(values, 'naam') && values.naam !== current.naam) refuse('De naam van een site ligt vast.')
}

export const siteWriter: Writer = {
  create(values, ctx) {
    if (isUser(ctx)) forbid('Sites komen uit de registry.')
    checkUnique(ctx, values)
    return values
  },

  update(values, ctx) {
    if (isUser(ctx)) {
      if (Object.keys(values).some((key) => !STUDIO_COLUMNS.includes(key))) {
        forbid('Registry- en gezondheidsgegevens schrijft alleen de worker.')
      }
      return values
    }
    if (Object.hasOwn(values, 'sla')) forbid(SLA_OWN)
    checkNameKept(values, ctx.current as Values)
    return values
  },
}
