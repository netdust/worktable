import { forbid, refuse, type WriteContext, type Writer } from '@worktable/engine'
import { soorten } from '../datasets'
import { localTime } from '../time'

const PREVIEW_HOURS = 24

type Values = Record<string, unknown>

// Read-only kinds run aangevraagd → bezig → klaar | mislukt, and cancel only from aangevraagd.
const readOnlyMoves = new Set(['aangevraagd>bezig', 'bezig>klaar', 'bezig>mislukt', 'aangevraagd>geannuleerd'])

const isBijwerken = (soort: unknown): boolean => soort === 'bijwerken'

function checkFit(soort: unknown, from: unknown, to: unknown): void {
  const fits = isBijwerken(soort) ? `${from}>${to}` !== 'aangevraagd>bezig' : readOnlyMoves.has(`${from}>${to}`)
  if (!fits) refuse('Deze stap past niet bij deze soort.')
}

function checkConfirmer(ctx: WriteContext): void {
  if ((ctx.actor.kind ?? 'user') !== 'user' || ctx.actor.role !== 'administrator') {
    forbid('Alleen Stefan bevestigt een update.')
  }
}

function checkFresh(voorbereidOp: unknown): void {
  const stamp = typeof voorbereidOp === 'string' ? Date.parse(voorbereidOp) : Number.NaN
  if (!(Date.now() - stamp <= PREVIEW_HOURS * 3_600_000)) refuse('Deze preview is verlopen.')
}

function checkNotFuture(soort: unknown, geplandOp: unknown): void {
  if (isBijwerken(soort) && typeof geplandOp === 'string' && geplandOp > localTime()) {
    refuse('Bijwerken kan niet vooruit gepland worden.')
  }
}

function checkFixed(values: Values, current: Values): void {
  for (const field of ['soort', 'groep_id']) {
    if (Object.hasOwn(values, field) && values[field] !== current[field]) refuse('Soort en groep liggen vast.')
  }
}

export const actieWriter: Writer = {
  create(values) {
    if (values.status !== undefined && values.status !== 'aangevraagd') refuse('Een actie begint als aangevraagd.')
    checkNotFuture(values.soort, values.gepland_op)
    const label = soorten[values.soort as keyof typeof soorten] ?? 'Actie'
    const titel = typeof values.titel === 'string' && values.titel.trim() !== '' ? values.titel : label
    return { ...values, titel }
  },

  update(values, ctx) {
    const current = ctx.current as Values
    checkFixed(values, current)
    checkNotFuture(current.soort, values.gepland_op)
    const to = values.status
    if (to === undefined || to === current.status) return values
    const undo = ctx.lifecycle?.kind === 'undo'
    if (to === 'bevestigd') {
      checkConfirmer(ctx)
      checkFresh(current.voorbereid_op)
    }
    if (!undo) checkFit(current.soort, current.status, to)
    return to === 'voorbereid' && !undo ? { ...values, voorbereid_op: localTime() } : values
  },

  delete() {},
}
