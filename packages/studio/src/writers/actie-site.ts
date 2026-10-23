import { refuse, type WriteContext, type Writer } from '@worktable/engine'

type Values = Record<string, unknown>

const FROZEN = 'Het voorstel ligt vast sinds de preview.'
const CONFIRMED = 'Een bevestigde update verandert niet meer.'
const CLOSED = 'De sites van deze opdracht liggen vast.'
const UNIQUE = 'Deze site hoort al bij deze opdracht.'
const BUTTONS = 'Een site zet je alleen tijdens de preview op Niet nu of Toch wel.'
const NO_PREVIEW = 'Deze site heeft geen preview en kan niet terug.'
const SKIPPED = 'Deze site is bewust overgeslagen en kan niet terug.'
const SERVICE_SKIP = 'Een site met preview slaat de worker pas over bij het bijwerken.'
const SERVICE_RESTORE = 'Alleen Stefan zet een overgeslagen site terug.'
const SET_FIELDS = ['site_id', 'actie_id']
const TEXTS = ['samenvatting', 'resultaat']
const ONLY_CONFIRMED = 'Alleen een bevestigde site wordt bijgewerkt.'
const NEW_STATE = 'Een site begint als wacht, of overgeslagen met een reden.'
const NEW_VOORSTEL = 'Een nieuwe site heeft nog geen voorstel.'
const KEEP_REASON = 'De reden van een overgeslagen site blijft staan.'
const CONFIRMED_STATUSES = ['bevestigd', 'bezig', 'klaar', 'deels']

const parentOf = (ctx: WriteContext, id: unknown): Values | null => (ctx.find('actie', id as number) as Values) ?? null

const isOpen = (parent: Values): boolean => parent.status === 'aangevraagd' || parent.status === 'voorbereiden'

const isWorking = (parent: Values): boolean => isOpen(parent) || parent.status === 'bezig'

const isPerson = (ctx: WriteContext): boolean => (ctx.actor.kind ?? 'user') === 'user'

function closedMessage(parent: Values): string {
  if (parent.status === 'voorbereid') return FROZEN
  const confirmed = parent.soort === 'bijwerken' && CONFIRMED_STATUSES.includes(parent.status as string)
  return confirmed ? CONFIRMED : CLOSED
}

const isSet = (value: unknown): boolean => value !== undefined && value !== null

// The set of sites is open only before the worker claims the request; an expired preview (voorbereid_op set) is claimed.
const unclaimed = (parent: Values): boolean => parent.status === 'aangevraagd' && !isSet(parent.voorbereid_op)

function checkCanJoin(parent: Values | null): void {
  if (parent && !unclaimed(parent)) refuse(closedMessage(parent))
}

function checkUnique(ctx: WriteContext, actieId: unknown, siteId: unknown, exceptId?: number): void {
  if (!isSet(actieId) || !isSet(siteId)) return
  if (ctx.exists('actie_site', { actie_id: actieId, site_id: siteId }, exceptId)) refuse(UNIQUE)
}

const changes = (values: Values, current: Values, field: string): boolean =>
  Object.hasOwn(values, field) && values[field] !== current[field]

function checkFields(values: Values, current: Values, parent: Values): void {
  if (!isOpen(parent) && changes(values, current, 'voorstel')) refuse(closedMessage(parent))
  if (!unclaimed(parent) && SET_FIELDS.some((field) => changes(values, current, field))) refuse(closedMessage(parent))
}

const hasPreview = (voorstel: unknown): boolean =>
  typeof voorstel === 'string' && voorstel.trim() !== '' && voorstel.trim() !== '[]'

// Mirrors "Toch wel": a preview to go back to, and no resultaat (any value, blank included, is a reason).
function checkRestorable(current: Values): void {
  if (!hasPreview(current.voorstel)) refuse(NO_PREVIEW)
  if (isSet(current.resultaat)) refuse(SKIPPED)
}

function checkPersonState(current: Values, to: unknown, parent: Values): void {
  if (parent.status !== 'voorbereid') refuse(BUTTONS)
  const drop = current.state === 'te_bevestigen' && to === 'overgeslagen'
  const restore = current.state === 'overgeslagen' && to === 'te_bevestigen'
  if (restore) checkRestorable(current)
  else if (!drop) refuse(BUTTONS)
}

function checkServiceState(current: Values, to: unknown, parent: Values): void {
  const from = current.state
  if (from === 'overgeslagen' && to === 'te_bevestigen') refuse(SERVICE_RESTORE)
  if (parent.status === 'voorbereid') refuse(FROZEN)
  const skip = from === 'te_bevestigen' && to === 'overgeslagen'
  if (skip && parent.status !== 'bezig' && parent.status !== 'voorbereiden') refuse(SERVICE_SKIP)
  if (!isOpen(parent) && (from === 'overgeslagen' || to === 'te_bevestigen')) refuse(closedMessage(parent))
}

function checkState(current: Values, to: unknown, parent: Values, ctx: WriteContext): void {
  if (to === undefined || to === current.state) return
  if (isPerson(ctx)) checkPersonState(current, to, parent)
  else checkServiceState(current, to, parent)
  if (to === 'bezig' && parent.soort === 'bijwerken' && current.state !== 'te_bevestigen') refuse(ONLY_CONFIRMED)
}

function checkKeepsReason(values: Values, current: Values): void {
  if (current.state === 'overgeslagen' && isSet(current.resultaat) && changes(values, current, 'resultaat')) {
    refuse(KEEP_REASON)
  }
}

function checkNew(values: Values): void {
  const state = values.state
  const reason = typeof values.resultaat === 'string' && values.resultaat.trim() !== ''
  const starts = state === undefined || state === 'wacht' || (state === 'overgeslagen' && reason)
  if (!starts) refuse(NEW_STATE)
  if (isSet(values.voorstel)) refuse(NEW_VOORSTEL)
}

function checkChange(values: Values, current: Values, parent: Values, ctx: WriteContext): void {
  if (parent.status === 'bevestigd') {
    for (const [field, value] of Object.entries(values)) {
      if (value !== current[field]) refuse(CONFIRMED)
    }
  }
  checkFields(values, current, parent)
  if (!isWorking(parent) && TEXTS.some((field) => changes(values, current, field))) refuse(closedMessage(parent))
  checkKeepsReason(values, current)
  checkState(current, values.state, parent, ctx)
}

export const actieSiteWriter: Writer = {
  create(values, ctx) {
    checkCanJoin(parentOf(ctx, values.actie_id))
    checkNew(values)
    checkUnique(ctx, values.actie_id, values.site_id)
    return values
  },

  update(values, ctx) {
    const current = ctx.current as Values
    const moved = Object.hasOwn(values, 'actie_id') && values.actie_id !== current.actie_id
    const parent = parentOf(ctx, current.actie_id)
    if (parent) checkChange(values, current, parent, ctx)
    if (moved) checkCanJoin(parentOf(ctx, values.actie_id))
    const actieId = values.actie_id ?? current.actie_id
    const siteId = values.site_id ?? current.site_id
    if (moved || (Object.hasOwn(values, 'site_id') && values.site_id !== current.site_id)) {
      checkUnique(ctx, actieId, siteId, current.id as number)
    }
    return values
  },

  delete(ctx) {
    const parent = parentOf(ctx, (ctx.current as Values).actie_id)
    checkCanJoin(parent)
  },
}
