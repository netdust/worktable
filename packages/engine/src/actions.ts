import { inScope, scopeOf, visibleSource } from './access'
import { availableOf } from './available'
import {
  type ActionDecl,
  type ActionInput,
  type ActionResult,
  type ActionUpdate,
  type Actor,
  type DatasetDecl,
  type Domain,
  type Icon,
  type InputValue,
  isSelection,
  MAX_INPUT_TEXT,
  type SelectionActionDecl,
  type TransitionMode,
} from './declare'
import { ApiError, isRealDate } from './params'
import {
  applyWrite,
  contextOf,
  createAs,
  expectedOf,
  type Hooked,
  noneHooked,
  recordBatch,
  rowOf,
  type Store,
  sendAfterCommit,
  writableOf,
} from './writes'

type Values = Record<string, unknown>
type Step = { key: string; hooked: Hooked }

export interface ActionRun {
  batch_id: string
  created: { dataset: string; id: number }[]
  notices: string[]
}

export const MAX_SELECTION = 500

const badBody = (message: string) => new ApiError(400, 'bad_body', message)
const isId = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0

function actionOf(domain: Domain, name: string): ActionDecl | SelectionActionDecl {
  const action = domain.actions && Object.hasOwn(domain.actions, name) ? domain.actions[name] : undefined
  if (!action) throw new ApiError(404, 'unknown_action', `unknown action "${name}"`)
  return action
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

// A typed value as its input declares it; a relation input must name a record id.
function inputProblem(decl: ActionInput, value: unknown): string | null {
  if ('relation' in decl) return isId(value) ? null : 'must be a record id'
  if (value === undefined) return decl.required === false ? null : 'is required'
  if (decl.type === 'boolean') return typeof value === 'boolean' ? null : 'must be true or false'
  if (decl.type === 'date')
    return typeof value === 'string' && DAY.test(value) && isRealDate(value) ? null : 'must be a date YYYY-MM-DD'
  if (decl.type === 'text') {
    if (typeof value !== 'string') return 'must be text'
    return value.length > MAX_INPUT_TEXT ? `takes at most ${MAX_INPUT_TEXT} characters` : null
  }
  if (!Number.isSafeInteger(value)) return 'must be an integer'
  const n = value as number
  if (decl.min !== undefined && n < decl.min) return `must be at least ${decl.min}`
  if (decl.max !== undefined && n > decl.max) return `must be at most ${decl.max}`
  return null
}

function inputOf(action: ActionDecl | SelectionActionDecl, body: Values): Values {
  const input = body.input ?? {}
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw badBody('"input" must be an object')
  const given = input as Values
  for (const key of Object.keys(given)) {
    if (!Object.hasOwn(action.input, key)) throw badBody(`"input.${key}" is not an input of this action`)
  }
  for (const [key, decl] of Object.entries(action.input)) {
    const problem = inputProblem(decl, given[key])
    if (problem) throw badBody(`"input.${key}" ${problem}`)
  }
  return given
}

function idOf(body: Values): number {
  if ('ids' in body) throw badBody('this action takes "id", not "ids"')
  if (!isId(body.id)) throw badBody('"id" must be a record id')
  return body.id
}

// Refused whole before any record is read: a shape, a count or a repeat never reaches the store.
function idsOf(body: Values): number[] {
  if ('id' in body) throw badBody('this action takes "ids", not "id"')
  const ids = body.ids
  if (!Array.isArray(ids) || ids.length === 0) throw badBody('"ids" must be a non-empty list of record ids')
  if (ids.length > MAX_SELECTION) throw badBody(`"ids" takes at most ${MAX_SELECTION} record ids`)
  if (!ids.every(isId)) throw badBody('"ids" must hold record ids only')
  if (new Set(ids).size !== ids.length) throw badBody('"ids" must not repeat an id')
  return ids
}

// Read as GET /rows reads it: an unseen source is 404, and so is a record outside the caller's scope.
function readRecord(store: Store, dataset: string, id: number, actor: Actor): Values {
  const source = visibleSource(store.domain, dataset, actor)
  const record = contextOf(store, actor, null).find(dataset, id)
  if (!record || !inScope(scopeOf(actor, source), record)) {
    throw new ApiError(404, 'unknown_record', `unknown record ${id}`)
  }
  return record
}

// Judged on the record as the caller reads it, lookups included, so the grid's mark and this refusal agree.
function assertCondition(
  store: Store,
  name: string,
  action: ActionDecl | SelectionActionDecl,
  id: number,
  actor: Actor,
) {
  if (!action.when) return
  const source = visibleSource(store.domain, action.on, actor) as DatasetDecl
  const row = rowOf(store, source, id, scopeOf(actor, source))
  if (!availableOf(store.domain, source, row, actor)?.actions.includes(name)) {
    throw new ApiError(422, 'condition_not_met', `record ${id} does not meet the condition of "${name}"`)
  }
}

function updateAs(store: Store, actor: Actor, step: ActionUpdate, at: Step): void {
  const target = writableOf(store.domain, step.dataset, 'update', actor)
  const mode: TransitionMode = { kind: 'write', expect: expectedOf(target.dataset, step.expect) }
  applyWrite(store, target, 'update', step.id, step.values, actor, mode, at.hooked, at.key)
}

const inputsRead = (store: Store, action: ActionDecl | SelectionActionDecl, given: Values, actor: Actor) =>
  Object.fromEntries(
    Object.entries(action.input).map(([key, decl]) => [
      key,
      'relation' in decl ? readRecord(store, decl.relation, given[key] as number, actor) : given[key],
    ]),
  ) as Record<string, InputValue>

// Runs as the caller, never with the import's 'all' scope; one transaction, so any refusal rolls back every create.
function execute(store: Store, actor: Actor, result: () => ActionResult): ActionRun {
  const hooked = noneHooked()
  const run = store.sqlite
    .transaction((): Omit<ActionRun, 'notices'> => {
      const now = new Date().toISOString()
      const key = crypto.randomUUID()
      const answer = result()
      const { creates = [], updates = [] } = Array.isArray(answer) ? { creates: answer } : answer
      const at = { key, hooked }
      const created = creates.flatMap((step) => createAs(store, actor, step, at))
      for (const step of updates) updateAs(store, actor, step, at)
      recordBatch(store.sqlite, key, actor.id, 'action', now)
      return { batch_id: key, created }
    })
    .immediate()
  sendAfterCommit(store, hooked)
  return { ...run, notices: hooked.notices }
}

function runSingle(store: Store, name: string, action: ActionDecl, body: Values, actor: Actor): ActionRun {
  const id = idOf(body)
  const given = inputOf(action, body)
  return execute(store, actor, () => {
    const record = readRecord(store, action.on, id, actor)
    assertCondition(store, name, action, id, actor)
    const input = inputsRead(store, action, given, actor)
    return action.run(record, input, contextOf(store, actor, record))
  })
}

// Every id is read as the caller inside the transaction; one miss fails the run before `run` is called.
function runSelection(store: Store, name: string, action: SelectionActionDecl, body: Values, actor: Actor): ActionRun {
  const ids = idsOf(body)
  const given = inputOf(action, body)
  return execute(store, actor, () => {
    const records = ids.map((id) => readRecord(store, action.on, id, actor))
    for (const id of ids) assertCondition(store, name, action, id, actor)
    const input = inputsRead(store, action, given, actor)
    return action.run(records, input, contextOf(store, actor, null))
  })
}

export function runAction(store: Store, name: string, body: Values, actor: Actor): ActionRun {
  const action = actionOf(store.domain, name)
  visibleSource(store.domain, action.on, actor)
  return isSelection(action)
    ? runSelection(store, name, action, body, actor)
    : runSingle(store, name, action, body, actor)
}

export type ServedAction = {
  name: string
  many?: true
  opens?: true
  conditional?: true
  head?: { icon: Icon }
  handoff?: true
} & Pick<ActionDecl, 'label' | 'input'>

export function actionsOn(domain: Domain, dataset: string): ServedAction[] {
  return Object.entries(domain.actions ?? {})
    .filter(([, action]) => action.on === dataset)
    .map(([name, action]) => ({
      name,
      label: action.label,
      input: action.input,
      ...(isSelection(action) ? { many: true as const } : {}),
      ...(action.opens ? { opens: true as const } : {}),
      ...(action.when ? { conditional: true as const } : {}),
      ...(!isSelection(action) && action.head ? { head: action.head } : {}),
      ...(!isSelection(action) && action.handoff ? { handoff: true as const } : {}),
    }))
}
