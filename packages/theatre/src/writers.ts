import { refuse, type WriteContext, type Writer } from '@worktable/engine'
import { activiteit } from './datasets'
import { plandag } from './plandag'

const DAY_LINE_HOUR = 5

type Values = Record<string, unknown>

function checkOption(field: 'status' | 'soort', values: Values, message: string): void {
  const value = values[field]
  if (value !== undefined && !Object.hasOwn(activiteit.columns[field]?.options ?? {}, String(value))) refuse(message)
}

function checkProductie(values: Values, ctx: WriteContext): void {
  const id = values.productie_id
  if (id !== undefined && !ctx.find('productie', id as number)) refuse('Productie bestaat niet.')
}

const withSeconds = (at: string): string => (at.length === 16 ? `${at}:00` : at)

function checkOrder(values: Values, ctx: WriteContext): void {
  const { start_at, eind_at } = { ...ctx.current, ...values }
  if (typeof start_at === 'string' && typeof eind_at === 'string' && withSeconds(eind_at) < withSeconds(start_at)) {
    refuse('Einde ligt voor de start.')
  }
}

function accept(values: Values, ctx: WriteContext): Values {
  checkOption('status', values, 'Ongeldige status.')
  checkOption('soort', values, 'Ongeldige soort.')
  checkProductie(values, ctx)
  checkOrder(values, ctx)
  const start = values.start_at
  return typeof start === 'string' ? { ...values, plandag: plandag(start, DAY_LINE_HOUR) } : values
}

export const activiteitWriter: Writer = {
  create: accept,
  update: accept,
  delete() {},
}
