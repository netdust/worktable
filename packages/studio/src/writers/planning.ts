import { refuse, type WriteContext, type Writer } from '@worktable/engine'
import { localTime } from '../time'

type Values = Record<string, unknown>

const ONE_FEATURE = 'Er is al een feature voor deze repo en branch.'

const blank = (value: unknown): boolean => typeof value !== 'string' || value.trim() === ''

// A create always names its record; an update only when it sends the name, and never as blank text.
function checkNamed(values: Values, key: string, message: string, creating: boolean): void {
  if ((creating || Object.hasOwn(values, key)) && blank(values[key])) refuse(message)
}

const named = (key: string, message: string): Writer => ({
  create(values) {
    checkNamed(values, key, message, true)
    return values
  },
  update(values) {
    checkNamed(values, key, message, false)
    return values
  },
  delete() {},
})

export const organisatieWriter = named('naam', 'Een organisatie heeft een naam.')
export const agendapuntWriter = named('titel', 'Een agendapunt heeft een titel.')

const absent = (value: unknown): boolean => value === undefined || value === null

// A task without a client takes the one of what it is about, the most specific first, so the space switcher keeps it.
function clientOf(values: Values, ctx: WriteContext): unknown {
  const about: [string, unknown][] = [
    ['site', values.site_id],
    ['werkpakket', values.werkpakket_id],
    ['project', values.project_id],
  ]
  for (const [dataset, id] of about) {
    const found = absent(id) ? null : ctx.find(dataset, id as number)
    if (found && !absent(found.organisatie_id)) return found.organisatie_id
  }
  return null
}

const TAAK = 'Een taak heeft een titel.'

export const taakWriter: Writer = {
  create(values, ctx) {
    checkNamed(values, 'titel', TAAK, true)
    return absent(values.organisatie_id) ? { ...values, organisatie_id: clientOf(values, ctx) } : values
  },
  update(values) {
    checkNamed(values, 'titel', TAAK, false)
    return values
  },
  delete() {},
}

const PROJECT = 'Een project heeft een naam.'

export const projectWriter: Writer = {
  create(values, ctx) {
    checkNamed(values, 'naam', PROJECT, true)
    if (!absent(values.organisatie_id)) return values
    const intern = ctx.findBy('organisatie', { soort: 'intern' })
    return intern ? { ...values, organisatie_id: intern.id } : values
  },
  update(values) {
    checkNamed(values, 'naam', PROJECT, false)
    return values
  },
  delete() {},
}

const FEATURE = 'Een feature heeft een naam.'

// A feature belongs to its project's client, and takes the project's repo when it names none.
function fromProject(values: Values, ctx: WriteContext): Values {
  const current = ctx.current as Values | null
  const project = ctx.find('project', (values.project_id ?? current?.project_id) as number)
  if (!project) return values
  const repo = current === null && blank(values.repo) ? { repo: project.repo } : {}
  return { ...values, ...repo, organisatie_id: project.organisatie_id }
}

function checkOneFeature(values: Values, ctx: WriteContext): void {
  const current = (ctx.current as Values | null) ?? {}
  const repo = values.repo ?? current.repo
  const branch = values.branch ?? current.branch
  if (blank(repo) || blank(branch)) return
  if (ctx.exists('werkpakket', { repo, branch }, current.id as number | undefined)) refuse(ONE_FEATURE)
}

function featureOf(values: Values, ctx: WriteContext, creating: boolean): Values {
  checkNamed(values, 'naam', FEATURE, creating)
  const own = fromProject(values, ctx)
  checkOneFeature(own, ctx)
  return { ...own, bijgewerkt: localTime() }
}

export const werkpakketWriter: Writer = {
  create: (values, ctx) => featureOf(values, ctx, true),
  update: (values, ctx) => featureOf(values, ctx, false),
  delete() {},
}
