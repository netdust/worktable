import { type ActionCreate, type ActionDecl, refuse, type WriteContext } from '@worktable/engine'
import { validateItems } from './writers'

type Values = Record<string, unknown>

interface Item {
  soort: string
  omschrijving: string
  offset_dag: number
  start_tijd?: string
  duur?: number
  slots?: { rol: string; aantal: number }[]
}

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

// Naive local times: computed in UTC so no time zone shifts a day or an hour.
const at = (datum: string, tijd = '00:00'): number => Date.parse(`${datum}T${tijd}:00Z`)
const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10)
const minuteOf = (ms: number): string => new Date(ms).toISOString().slice(0, 16)

function days(start: string, end: string): string[] {
  const out: string[] = []
  for (let ms = at(start); ms <= at(end); ms += DAY) out.push(dayOf(ms))
  return out
}

function activiteitOf(reeks: Values, day: string, item: Item): Values {
  const datum = dayOf(at(day) + item.offset_dag * DAY)
  const start = item.start_tijd ? at(datum, item.start_tijd) : null
  return {
    productie_id: reeks.productie_id,
    speelreeks_id: reeks.id,
    soort: item.soort,
    omschrijving: item.omschrijving,
    datum,
    start_at: start === null ? null : minuteOf(start),
    eind_at: start === null || item.duur === undefined ? null : minuteOf(start + item.duur * MINUTE),
    locatie_id: null,
    status: 'optie',
  }
}

function slotsOf(item: Item, ctx: WriteContext): ((activiteitId: number) => ActionCreate[]) | undefined {
  if (!item.slots) return undefined
  const slots = item.slots.map(({ rol, aantal }) => ({ rol_id: ctx.findBy('rol', { naam: rol })?.id, aantal }))
  return (activiteit_id) =>
    slots.map((slot) => ({ dataset: 'toewijzing', values: { activiteit_id, ...slot, state: 'open' } }))
}

export const sjabloonToepassen: ActionDecl = {
  label: 'Sjabloon toepassen',
  on: 'speelreeks',
  input: { sjabloon_id: { relation: 'sjabloon', label: 'Sjabloon' } },
  run(reeks, input, ctx) {
    const sjabloon = input.sjabloon_id as Values
    if (ctx.exists('activiteit', { speelreeks_id: reeks.id })) {
      refuse(
        'Deze tourstop heeft al activiteiten. Maak de vorige toepassing ongedaan of verwijder die activiteiten, en pas het sjabloon dan opnieuw toe.',
      )
    }
    validateItems(sjabloon.items, ctx)
    const items = sjabloon.items as Item[]
    return days(String(reeks.start_datum), String(reeks.eind_datum)).flatMap((day) =>
      items.map((item) => {
        const children = slotsOf(item, ctx)
        return { dataset: 'activiteit', values: activiteitOf(reeks, day, item), ...(children && { children }) }
      }),
    )
  },
}

// A date or a local date-time N days later, the time of day kept.
function shifted(value: unknown, days: number): unknown {
  if (typeof value !== 'string') return value
  const [day = '', time] = value.split('T')
  const [y, m, d] = day.split('-').map(Number)
  const moved = new Date(Date.UTC(y as number, (m as number) - 1, (d as number) + days)).toISOString().slice(0, 10)
  return time === undefined ? moved : `${moved}T${time}`
}

const moved = (row: Values, columns: string[], days: number): Values =>
  Object.fromEntries(
    columns.filter((column) => row[column] != null).map((column) => [column, shifted(row[column], days)]),
  )

// The tourstop and every activity in it, N days later or earlier; the writers recompute plandag.
export const tourstopVerschuiven: ActionDecl = {
  label: 'Tourstop verschuiven',
  on: 'speelreeks',
  input: { dagen: { type: 'integer', label: 'Dagen', min: -365, max: 365 } },
  run(reeks, input, ctx) {
    const days = input.dagen as number
    const activities = ctx.findAll('activiteit', { speelreeks_id: reeks.id })
    return {
      updates: [
        { dataset: 'speelreeks', id: Number(reeks.id), values: moved(reeks, ['start_datum', 'eind_datum'], days) },
        ...activities.map((activity) => ({
          dataset: 'activiteit',
          id: Number(activity.id),
          values: moved(activity, ['datum', 'start_at', 'eind_at'], days),
        })),
      ],
    }
  },
}

const STILL_OPEN = { state: 'open' }

// Pencilled in, nothing mailed: one of an open row's places goes to the person, the rest stay open.
export const vulSlot: ActionDecl = {
  label: 'Open plek invullen',
  on: 'toewijzing',
  input: { persoon_id: { relation: 'persoon', label: 'Persoon' } },
  run(slot, input) {
    const filled = { persoon_id: (input.persoon_id as Values).id, state: 'voorlopig' }
    const aantal = Number(slot.aantal)
    if (aantal <= 1)
      return { updates: [{ dataset: 'toewijzing', id: Number(slot.id), values: filled, expect: STILL_OPEN }] }
    return {
      updates: [{ dataset: 'toewijzing', id: Number(slot.id), values: { aantal: aantal - 1 }, expect: STILL_OPEN }],
      creates: [
        {
          dataset: 'toewijzing',
          values: { activiteit_id: slot.activiteit_id, rol_id: slot.rol_id, aantal: 1, ...filled },
        },
      ],
    }
  },
}
