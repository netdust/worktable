import { refuse, type WriteContext, type Writer } from '@worktable/engine'

type Values = Record<string, unknown>

const FROZEN = 'Het voorstel ligt vast sinds de preview.'
const CONFIRMED = 'Een bevestigde update verandert niet meer.'
const FIXED_FIELDS = ['voorstel', 'site_id', 'actie_id']

const parentOf = (ctx: WriteContext, id: unknown): Values | null => (ctx.find('actie', id as number) as Values) ?? null

const isOpen = (parent: Values): boolean => parent.status === 'aangevraagd' || parent.status === 'voorbereiden'

const frozenMessage = (parent: Values): string => (parent.status === 'voorbereid' ? FROZEN : CONFIRMED)

function checkCanJoin(parent: Values | null): void {
  if (!parent || isOpen(parent)) return
  const readOnlyRun = parent.soort !== 'bijwerken' && parent.status === 'bezig'
  if (!readOnlyRun) refuse(frozenMessage(parent))
}

function checkUnique(ctx: WriteContext, actieId: unknown, siteId: unknown, exceptId?: number): void {
  if (ctx.exists('actie_site', { actie_id: actieId, site_id: siteId }, exceptId)) {
    refuse('Deze site hoort al bij deze actie.')
  }
}

function checkFields(values: Values, current: Values, parent: Values): void {
  for (const field of FIXED_FIELDS) {
    if (Object.hasOwn(values, field) && String(values[field]) !== String(current[field])) refuse(frozenMessage(parent))
  }
}

function checkState(from: unknown, to: unknown, parent: Values): void {
  if (to === undefined || to === from) return
  if (parent.status === 'voorbereid') {
    if (from !== 'te_bevestigen' || to !== 'overgeslagen') refuse(FROZEN)
    return
  }
  if (parent.status === 'bevestigd') refuse(CONFIRMED)
  if (from === 'overgeslagen' || to === 'te_bevestigen') refuse(CONFIRMED)
}

function checkChange(values: Values, current: Values, parent: Values): void {
  if (isOpen(parent)) return
  checkFields(values, current, parent)
  if (parent.status === 'bevestigd') {
    for (const [field, value] of Object.entries(values)) {
      if (value !== current[field]) refuse(CONFIRMED)
    }
  }
  checkState(current.state, values.state, parent)
}

export const actieSiteWriter: Writer = {
  create(values, ctx) {
    checkCanJoin(parentOf(ctx, values.actie_id))
    checkUnique(ctx, values.actie_id, values.site_id)
    return values
  },

  update(values, ctx) {
    const current = ctx.current as Values
    const moved = Object.hasOwn(values, 'actie_id') && String(values.actie_id) !== String(current.actie_id)
    const parent = parentOf(ctx, current.actie_id)
    if (parent) checkChange(values, current, parent)
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
    if (parent && !isOpen(parent)) refuse(frozenMessage(parent))
  },
}
