import { type DatasetDecl, refuse, type WriteContext, type Writer } from '@worktable/engine'
import { activiteit, organisatie, productie, toewijzing } from './datasets'
import { plandag } from './plandag'

const DAY_LINE_HOUR = 5

type Values = Record<string, unknown>
type Accept = (values: Values, ctx: WriteContext) => Values

const merged = (values: Values, ctx: WriteContext): Values => ({ ...ctx.current, ...values })

const filled = (value: unknown): boolean => typeof value === 'string' && value.trim() !== ''

function checkOption(dataset: DatasetDecl, field: string, values: Values, message: string): void {
  const value = values[field]
  if (value !== undefined && !Object.hasOwn(dataset.columns[field]?.options ?? {}, String(value))) refuse(message)
}

function checkLive(ctx: WriteContext, dataset: string, id: unknown, message: string): void {
  if (id !== undefined && id !== null && !ctx.find(dataset, id as number)) refuse(message)
}

const withSeconds = (at: string): string => (at.length === 16 ? `${at}:00` : at)

function checkOrder(values: Values, ctx: WriteContext): void {
  const { start_at, eind_at } = merged(values, ctx)
  if (typeof start_at === 'string' && typeof eind_at === 'string' && withSeconds(eind_at) < withSeconds(start_at)) {
    refuse('Einde ligt voor de start.')
  }
}

const writerOf = (accept: Accept): Writer => ({ create: accept, update: accept, delete() {} })

export const activiteitWriter = writerOf((values, ctx) => {
  checkOption(activiteit, 'status', values, 'Ongeldige status.')
  checkOption(activiteit, 'soort', values, 'Ongeldige soort.')
  checkLive(ctx, 'productie', values.productie_id, 'Productie bestaat niet.')
  checkLive(ctx, 'organisatie', values.locatie_id, 'Organisatie bestaat niet.')
  checkOrder(values, ctx)
  const start = values.start_at
  return typeof start === 'string' ? { ...values, plandag: plandag(start, DAY_LINE_HOUR) } : values
})

export const productieWriter = writerOf((values, ctx) => {
  if (!filled(merged(values, ctx).titel)) refuse('Titel is verplicht.')
  checkOption(productie, 'status', values, 'Ongeldige status.')
  checkLive(ctx, 'organisatie', values.organisatie_id, 'Organisatie bestaat niet.')
  return values
})

export const organisatieWriter = writerOf((values, ctx) => {
  if (!filled(merged(values, ctx).naam)) refuse('Naam is verplicht.')
  checkOption(organisatie, 'soort', values, 'Ongeldige soort.')
  return values
})

export const persoonWriter = writerOf((values, ctx) => {
  const { voornaam, achternaam } = merged(values, ctx)
  if (!filled(voornaam) || !filled(achternaam)) refuse('Voornaam en achternaam zijn verplicht.')
  if (filled(values.email) && !String(values.email).includes('@')) refuse('Ongeldig e-mailadres.')
  checkLive(ctx, 'organisatie', values.organisatie_id, 'Organisatie bestaat niet.')
  return { ...values, weergavenaam: `${String(voornaam).trim()} ${String(achternaam).trim()}` }
})

// Name-only rows are exempt from the duplicate rule: an external name is not a record to count.
function checkAssignee(values: Values, ctx: WriteContext): void {
  const { persoon_id, activiteit_id, naam } = merged(values, ctx)
  const hasPersoon = persoon_id !== null && persoon_id !== undefined
  if (hasPersoon && filled(naam)) refuse('Kies een persoon of een naam, niet allebei.')
  if (!hasPersoon && !filled(naam)) refuse('Kies een persoon of een naam.')
  if (!hasPersoon || activiteit_id === null || activiteit_id === undefined) return
  if (ctx.exists('toewijzing', { persoon_id, activiteit_id }, ctx.current?.id as number | undefined)) {
    refuse('Deze persoon is al toegewezen aan deze activiteit.')
  }
}

function switchAssignee(values: Values): void {
  const sets = (k: string) => Object.hasOwn(values, k)
  if (sets('persoon_id') && values.persoon_id != null && !sets('naam')) values.naam = null
  if (sets('naam') && filled(values.naam) && !sets('persoon_id')) values.persoon_id = null
}

export const toewijzingWriter = {
  create: (values, ctx) => toewijzingAccept(values, ctx),
  update(values, ctx) {
    switchAssignee(values)
    return toewijzingAccept(values, ctx)
  },
  delete() {},
} satisfies Writer

function toewijzingAccept(values: Values, ctx: WriteContext): Values {
  checkOption(toewijzing, 'state', values, 'Ongeldige status.')
  checkLive(ctx, 'activiteit', values.activiteit_id, 'Activiteit bestaat niet.')
  checkLive(ctx, 'persoon', values.persoon_id, 'Persoon bestaat niet.')
  checkAssignee(values, ctx)
  return values
}

export const beschikbaarheidWriter = writerOf((values, ctx) => {
  checkLive(ctx, 'persoon', values.persoon_id, 'Persoon bestaat niet.')
  checkOrder(values, ctx)
  return values
})
