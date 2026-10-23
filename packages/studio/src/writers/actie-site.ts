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
const FIXED_FIELDS = ['voorstel', 'site_id', 'actie_id']
const CONFIRMED_STATUSES = ['bevestigd', 'bezig', 'klaar', 'deels']

const parentOf = (ctx: WriteContext, id: unknown): Values | null => (ctx.find('actie', id as number) as Values) ?? null

const isOpen = (parent: Values): boolean => parent.status === 'aangevraagd' || parent.status === 'voorbereiden'

const isPerson = (ctx: WriteContext): boolean => (ctx.actor.kind ?? 'user') === 'user'

function closedMessage(parent: Values): string {
  if (parent.status === 'voorbereid') return FROZEN
  const confirmed = parent.soort === 'bijwerken' && CONFIRMED_STATUSES.includes(parent.status as string)
  return confirmed ? CONFIRMED : CLOSED
}

const isSet = (value: unknown): boolean => value !== undefined && value !== null

// A request takes sites only before the worker claims it; an expired preview (voorbereid_op set) is already claimed.
function checkCanJoin(parent: Values | null): void {
  if (!parent) return
  if (parent.status !== 'aangevraagd' || isSet(parent.voorbereid_op)) refuse(closedMessage(parent))
}

function checkUnique(ctx: WriteContext, actieId: unknown, siteId: unknown, exceptId?: number): void {
  if (!isSet(actieId) || !isSet(siteId)) return
  if (ctx.exists('actie_site', { actie_id: actieId, site_id: siteId }, exceptId)) refuse(UNIQUE)
}

function checkFields(values: Values, current: Values, parent: Values): void {
  for (const field of FIXED_FIELDS) {
    if (Object.hasOwn(values, field) && values[field] !== current[field]) refuse(closedMessage(parent))
  }
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
  if (from === 'te_bevestigen' && to === 'overgeslagen' && parent.status !== 'bezig') refuse(SERVICE_SKIP)
  if (!isOpen(parent) && (from === 'overgeslagen' || to === 'te_bevestigen')) refuse(closedMessage(parent))
}

function checkState(current: Values, to: unknown, parent: Values, ctx: WriteContext): void {
  if (to === undefined || to === current.state) return
  if (isPerson(ctx)) checkPersonState(current, to, parent)
  else checkServiceState(current, to, parent)
}

function checkChange(values: Values, current: Values, parent: Values, ctx: WriteContext): void {
  if (parent.status === 'bevestigd') {
    for (const [field, value] of Object.entries(values)) {
      if (value !== current[field]) refuse(CONFIRMED)
    }
  }
  if (!isOpen(parent)) checkFields(values, current, parent)
  if (
    parent.status === 'voorbereid' &&
    Object.hasOwn(values, 'samenvatting') &&
    values.samenvatting !== current.samenvatting
  ) {
    refuse(FROZEN)
  }
  checkState(current, values.state, parent, ctx)
}

export const actieSiteWriter: Writer = {
  create(values, ctx) {
    checkCanJoin(parentOf(ctx, values.actie_id))
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
    if (parent && parent.status !== 'aangevraagd') refuse(closedMessage(parent))
  },
}
