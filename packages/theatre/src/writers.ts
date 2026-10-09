import { type DatasetDecl, forbid, refuse, type WriteContext, type Writer } from '@worktable/engine'
import { activiteit, organisatie, persoon, productie, rol, speelreeks, toewijzing } from './datasets'
import { plandag } from './plandag'

const DAY_LINE_HOUR = 5

type Values = Record<string, unknown>
type Accept = (values: Values, ctx: WriteContext) => Values

const merged = (values: Values, ctx: WriteContext): Values => ({ ...ctx.current, ...values })

const filled = (value: unknown): boolean => typeof value === 'string' && value.trim() !== ''

function checkOption(dataset: DatasetDecl, field: string, values: Values, message: string): void {
  const value = values[field]
  if (value === undefined || (value === null && dataset.columns[field]?.nullable)) return
  if (!Object.hasOwn(dataset.columns[field]?.options ?? {}, String(value))) refuse(message)
}

function checkRequired(values: Values, ctx: WriteContext, field: string, message: string): void {
  if (merged(values, ctx)[field] == null) refuse(message)
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

// With a time, datum is the day of start_at and plandag follows the day line; without one, both are datum.
// On a create a set start_at decides datum; only an update refuses a datum that disagrees with it.
function withDay(values: Values, ctx: WriteContext): Values {
  const { start_at, eind_at, datum } = merged(values, ctx)
  if (typeof start_at === 'string') {
    const day = start_at.slice(0, 10)
    if (ctx.current) {
      if (Object.hasOwn(values, 'datum') && values.datum !== day)
        refuse('Datum volgt de start. Wijzig Start om de dag te verplaatsen.')
      if (!Object.hasOwn(values, 'start_at')) return values
    }
    return { ...values, datum: day, plandag: plandag(start_at, DAY_LINE_HOUR) }
  }
  if (eind_at != null) {
    const clearsStart = Object.hasOwn(values, 'start_at') && ctx.current?.start_at != null
    refuse(clearsStart ? 'Wis eerst Einde: een einde heeft een start nodig.' : 'Een einde heeft een start nodig.')
  }
  if (datum == null) refuse('Datum is verplicht.')
  const touched = Object.hasOwn(values, 'datum') || Object.hasOwn(values, 'start_at')
  return touched ? { ...values, plandag: datum } : values
}

const writerOf = (accept: Accept): Required<Writer> => ({ create: accept, update: accept, delete() {} })

// An owner plans nothing but its own absences; the engine has already scoped the row to it.
function forPlanners(writer: Required<Writer>, what: string): Required<Writer> {
  const check = (ctx: WriteContext) => {
    if (ctx.actor.role === 'owner') forbid(`Alleen de planning wijzigt ${what}.`)
  }
  return {
    create(values, ctx) {
      check(ctx)
      return writer.create(values, ctx)
    },
    update(values, ctx) {
      check(ctx)
      return writer.update(values, ctx)
    },
    delete(ctx) {
      check(ctx)
      writer.delete(ctx)
    },
  }
}

export const activiteitWriter = forPlanners(
  writerOf((values, ctx) => {
    checkOption(activiteit, 'status', values, 'Ongeldige status.')
    checkOption(activiteit, 'soort', values, 'Ongeldige soort.')
    checkOption(activiteit, 'bron', values, 'Ongeldige bron.')
    checkRequired(values, ctx, 'productie_id', 'Productie is verplicht.')
    checkLive(ctx, 'productie', values.productie_id, 'Productie bestaat niet.')
    checkLive(ctx, 'organisatie', values.locatie_id, 'Organisatie bestaat niet.')
    checkLive(ctx, 'speelreeks', values.speelreeks_id, 'Speelreeks bestaat niet.')
    checkOrder(values, ctx)
    return withDay(values, ctx)
  }),
  'activiteiten',
)

export const productieWriter = forPlanners(
  writerOf((values, ctx) => {
    if (!filled(merged(values, ctx).titel)) refuse('Titel is verplicht.')
    checkOption(productie, 'status', values, 'Ongeldige status.')
    checkLive(ctx, 'organisatie', values.organisatie_id, 'Organisatie bestaat niet.')
    return values
  }),
  'producties',
)

export const organisatieWriter = forPlanners(
  writerOf((values, ctx) => {
    checkParameters(values, ctx)
    if (!filled(merged(values, ctx).naam)) refuse('Naam is verplicht.')
    checkOption(organisatie, 'soort', values, 'Ongeldige soort.')
    return values
  }),
  'organisaties',
)

export const persoonWriter = forPlanners(
  writerOf((values, ctx) => {
    const { voornaam, achternaam } = merged(values, ctx)
    if (!filled(voornaam) || !filled(achternaam)) refuse('Voornaam en achternaam zijn verplicht.')
    if (filled(values.email) && !String(values.email).includes('@')) refuse('Ongeldig e-mailadres.')
    checkOption(persoon, 'contract_type', values, 'Ongeldig contracttype.')
    checkLive(ctx, 'organisatie', values.organisatie_id, 'Organisatie bestaat niet.')
    return { ...values, weergavenaam: `${String(voornaam).trim()} ${String(achternaam).trim()}` }
  }),
  'personen',
)

const isSet = (value: unknown): boolean => value !== null && value !== undefined

// An open slot is a role waiting for someone. Name-only rows are exempt from the duplicate rule: an external name is not a record to count.
function checkAssignee(values: Values, ctx: WriteContext): void {
  const { persoon_id, activiteit_id, naam, rol_id, state } = merged(values, ctx)
  const hasPersoon = isSet(persoon_id)
  if (hasPersoon && filled(naam)) refuse('Kies een persoon of een naam, niet allebei.')
  if (state === 'open' && (hasPersoon || filled(naam))) refuse('Een open plaats heeft nog geen persoon of naam.')
  if (!hasPersoon && !filled(naam)) {
    if (state !== 'open') refuse('Kies een persoon of een naam.')
    if (!isSet(rol_id)) refuse('Een open plek heeft een rol nodig.')
    return
  }
  if (!hasPersoon || !isSet(activiteit_id)) return
  if (ctx.exists('toewijzing', { persoon_id, activiteit_id }, ctx.current?.id as number | undefined)) {
    refuse('Deze persoon is al toegewezen aan deze activiteit.')
  }
}

function switchAssignee(values: Values): void {
  const sets = (k: string) => Object.hasOwn(values, k)
  if (sets('persoon_id') && values.persoon_id != null && !sets('naam')) values.naam = null
  if (sets('naam') && filled(values.naam) && !sets('persoon_id')) values.persoon_id = null
}

// A row with no one on it is an open slot, whatever state was asked; else the given state, else the column default.
function stateOnCreate(values: Values): Values {
  return !isSet(values.persoon_id) && !filled(values.naam) ? { ...values, state: 'open' } : values
}

const toewijzingPlanned = forPlanners(
  {
    create: (values, ctx) => toewijzingAccept(stateOnCreate(values), ctx),
    update(values, ctx) {
      switchAssignee(values)
      return toewijzingAccept(values, ctx)
    },
    delete() {},
  },
  'toewijzingen',
)

// The person answers its own invitation: the engine has scoped the row to it and judged the transition.
const answersInvite = (values: Values, ctx: WriteContext): boolean =>
  ctx.actor.role === 'owner' && Object.hasOwn(values, 'state') && Object.keys(values).every((key) => key === 'state')

export const toewijzingWriter: Required<Writer> = {
  ...toewijzingPlanned,
  update: (values, ctx) =>
    answersInvite(values, ctx) ? toewijzingAccept(values, ctx) : toewijzingPlanned.update(values, ctx),
}

function toewijzingAccept(values: Values, ctx: WriteContext): Values {
  checkOption(toewijzing, 'state', values, 'Ongeldige status.')
  checkRequired(values, ctx, 'activiteit_id', 'Activiteit is verplicht.')
  checkLive(ctx, 'activiteit', values.activiteit_id, 'Activiteit bestaat niet.')
  checkLive(ctx, 'persoon', values.persoon_id, 'Persoon bestaat niet.')
  checkLive(ctx, 'rol', values.rol_id, 'Rol bestaat niet.')
  checkAssignee(values, ctx)
  return values
}

export const beschikbaarheidWriter = writerOf((values, ctx) => {
  checkRequired(values, ctx, 'persoon_id', 'Persoon is verplicht.')
  checkRequired(values, ctx, 'start_at', 'Start is verplicht.')
  checkRequired(values, ctx, 'eind_at', 'Einde is verplicht.')
  checkLive(ctx, 'persoon', values.persoon_id, 'Persoon bestaat niet.')
  checkOrder(values, ctx)
  return values
})

const DEFAULT_MAX_DAGEN = 31
const MAX_DAGEN_CEILING = 366
const DAY_MS = 86_400_000

// The cap is the own organisation's parameter, reached through the productie it produces.
function maxDagen(ctx: WriteContext, productieId: unknown): number {
  const producer = productieId == null ? null : ctx.find('productie', productieId as number)
  const eigen = producer?.organisatie_id == null ? null : ctx.find('organisatie', producer.organisatie_id as number)
  const cap = eigen?.soort === 'eigen' ? (eigen.parameters as Values | null)?.max_speelreeks_dagen : undefined
  const max = Number.isInteger(cap) && (cap as number) > 0 ? (cap as number) : DEFAULT_MAX_DAGEN
  return Math.min(max, MAX_DAGEN_CEILING)
}

// Only a write that moves the span or its producer checks it, so a lowered cap never blocks a rename.
function checkSpan(values: Values, ctx: WriteContext): void {
  if (!['start_datum', 'eind_datum', 'productie_id'].some((k) => Object.hasOwn(values, k))) return
  const { start_datum, eind_datum, productie_id } = merged(values, ctx)
  if (typeof start_datum !== 'string' || typeof eind_datum !== 'string') return
  if (eind_datum < start_datum) refuse('Einde ligt voor de start.')
  const dagen = (Date.parse(eind_datum) - Date.parse(start_datum)) / DAY_MS + 1
  const max = maxDagen(ctx, productie_id)
  if (dagen > max) refuse(`Een tourstop duurt hoogstens ${max} dagen.`)
}

export const speelreeksWriter = forPlanners(
  writerOf((values, ctx) => {
    if (!filled(merged(values, ctx).naam)) refuse('Naam is verplicht.')
    checkOption(speelreeks, 'status', values, 'Ongeldige status.')
    checkRequired(values, ctx, 'productie_id', 'Productie is verplicht.')
    checkRequired(values, ctx, 'start_datum', 'Start is verplicht.')
    checkRequired(values, ctx, 'eind_datum', 'Einde is verplicht.')
    checkLive(ctx, 'productie', values.productie_id, 'Productie bestaat niet.')
    checkLive(ctx, 'organisatie', values.locatie_id, 'Locatie bestaat niet.')
    checkSpan(values, ctx)
    return values
  }),
  'tourstops',
)

const KLEUR = /^#[0-9a-fA-F]{6}$/

// Sending a value unchanged is no write of it, so an editor may echo a whole row.
const changes = (values: Values, ctx: WriteContext, k: string): boolean =>
  Object.hasOwn(values, k) && JSON.stringify(values[k]) !== JSON.stringify(ctx.current?.[k] ?? null)

function checkRates(values: Values, ctx: WriteContext): void {
  if (ctx.actor.role === 'administrator') return
  if (changes(values, ctx, 'dagtarief') || changes(values, ctx, 'uurtarief')) {
    forbid('Alleen een beheerder wijzigt tarieven.')
  }
}

function checkParameters(values: Values, ctx: WriteContext): void {
  if (ctx.actor.role !== 'administrator' && changes(values, ctx, 'parameters')) {
    forbid('Alleen een beheerder wijzigt parameters.')
  }
}

export const rolWriter = forPlanners(
  writerOf((values, ctx) => {
    checkRates(values, ctx)
    if (!filled(merged(values, ctx).naam)) refuse('Naam is verplicht.')
    checkOption(rol, 'categorie', values, 'Ongeldige categorie.')
    if (values.kleur != null && !KLEUR.test(String(values.kleur))) refuse('Ongeldige kleur.')
    return values
  }),
  'rollen',
)

const MAX_ITEMS = 50
const MAX_OFFSET_DAG = 366
const TIJD = /^([01]\d|2[0-3]):[0-5]\d$/

function checkSlot(slot: unknown, at: (message: string) => never, ctx: WriteContext): void {
  if (typeof slot !== 'object' || slot === null || Array.isArray(slot)) at('ongeldige plaats.')
  const { rol, aantal } = slot as Values
  if (typeof rol !== 'string' || !ctx.findBy('rol', { naam: rol })) at(`de rol "${String(rol)}" bestaat niet.`)
  if (!Number.isInteger(aantal) || (aantal as number) <= 0) at('een plaats heeft een aantal van minstens 1 nodig.')
}

function checkItem(item: unknown, n: number, ctx: WriteContext): void {
  const at = (message: string): never => refuse(`Item ${n}: ${message}`)
  if (typeof item !== 'object' || item === null || Array.isArray(item)) at('ongeldig item.')
  const { soort, omschrijving, offset_dag, start_tijd, duur, locatie_regel } = item as Values
  if (!Object.hasOwn(activiteit.columns.soort?.options ?? {}, String(soort))) at('ongeldige soort.')
  if (!filled(omschrijving)) at('omschrijving is verplicht.')
  if (!Number.isInteger(offset_dag) || (offset_dag as number) < 0 || (offset_dag as number) > MAX_OFFSET_DAG) {
    at('ongeldige dag.')
  }
  if (start_tijd != null && (typeof start_tijd !== 'string' || !TIJD.test(start_tijd))) at('ongeldige starttijd.')
  if (duur != null && start_tijd == null) at('een duur heeft een starttijd nodig.')
  if (duur != null && (!Number.isInteger(duur) || (duur as number) <= 0)) at('ongeldige duur.')
  if (locatie_regel !== 'speelreeks') at('ongeldige locatieregel.')
  const { slots } = item as Values
  if (slots === undefined) return
  if (!Array.isArray(slots)) at('plaatsen moeten een lijst zijn.')
  for (const slot of slots as unknown[]) checkSlot(slot, at, ctx)
}

export function validateItems(items: unknown, ctx: WriteContext): void {
  if (!Array.isArray(items)) refuse('Items moeten een lijst zijn.')
  if (items.length > MAX_ITEMS) refuse(`Een sjabloon heeft hoogstens ${MAX_ITEMS} items.`)
  for (const [i, item] of items.entries()) checkItem(item, i + 1, ctx)
}

// Create only: without update or delete the grid shows Sjabloon read-only.
export const sjabloonWriter: Writer = {
  create(values, ctx) {
    if (ctx.actor.role === 'owner') forbid('Alleen de planning wijzigt sjablonen.')
    if (!filled(values.naam)) refuse('Naam is verplicht.')
    validateItems(values.items, ctx)
    return values
  },
}
