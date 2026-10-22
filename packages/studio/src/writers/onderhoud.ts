import { forbid, type WriteContext, type Writer } from '@worktable/engine'

type Values = Record<string, unknown>

const FIXED = 'Het onderhoudslog verandert niet.'

export const onderhoudWriter: Writer = {
  create(values, ctx: WriteContext) {
    if ((ctx.actor.kind ?? 'user') === 'user') forbid('Onderhoud schrijft alleen de worker.')
    const site = ctx.find('site', values.site_id as number) as Values | null
    return { ...values, organisatie_id: site?.organisatie_id ?? null }
  },

  update() {
    forbid(FIXED)
  },

  delete() {
    forbid(FIXED)
  },
}
