import { type ActionDecl, refuse } from '@worktable/engine'
import { validateItems } from './writers'

type Values = Record<string, unknown>

interface Item {
  soort: string
  omschrijving: string
  offset_dag: number
  start_tijd?: string
  duur?: number
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

export const sjabloonToepassen: ActionDecl = {
  label: 'Sjabloon toepassen',
  on: 'speelreeks',
  input: { sjabloon_id: { relation: 'sjabloon', label: 'Sjabloon' } },
  run(reeks, { sjabloon_id }, ctx) {
    if (ctx.exists('activiteit', { speelreeks_id: reeks.id })) {
      refuse(
        'Deze tourstop heeft al activiteiten. Maak de vorige toepassing ongedaan of verwijder die activiteiten, en pas het sjabloon dan opnieuw toe.',
      )
    }
    validateItems(sjabloon_id?.items)
    const items = sjabloon_id?.items as Item[]
    return days(String(reeks.start_datum), String(reeks.eind_datum)).flatMap((day) =>
      items.map((item) => ({ dataset: 'activiteit', values: activiteitOf(reeks, day, item) })),
    )
  },
}
