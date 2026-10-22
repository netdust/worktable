import { forbid, refuse, type WriteContext, type Writer } from '@worktable/engine'

type Values = Record<string, unknown>

export const SYNCED_COLUMNS = [
  'naam',
  'domein',
  'hosting',
  'sla',
  'risico',
  'health_markers',
  'beheer',
  'staging',
  'in_registry',
]

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

const USER_COLUMNS = ['organisatie_id', 'smoke_urls', 'notities']

const isUser = (ctx: WriteContext): boolean => (ctx.actor.kind ?? 'user') === 'user'

function checkUnique(ctx: WriteContext, values: Values, exceptId?: number): void {
  if (values.naam !== undefined && ctx.exists('site', { naam: values.naam }, exceptId)) {
    refuse('Er is al een site met deze naam.')
  }
}

export const siteWriter: Writer = {
  create(values, ctx) {
    if (isUser(ctx)) forbid('Sites komen uit de registry.')
    checkUnique(ctx, values)
    return values
  },

  update(values, ctx) {
    if (isUser(ctx)) {
      if (Object.keys(values).some((key) => !USER_COLUMNS.includes(key))) {
        forbid('Registry- en gezondheidsgegevens schrijft alleen de worker.')
      }
      return values
    }
    checkUnique(ctx, values, (ctx.current as Values).id as number)
    return values
  },

  delete(ctx) {
    if (isUser(ctx)) forbid('Sites komen uit de registry.')
  },
}
