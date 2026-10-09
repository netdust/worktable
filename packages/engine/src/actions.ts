import { inScope, scopeOf, visibleSource } from './access'
import type { ActionCreate, ActionDecl, ActionUpdate, Actor, Domain, TransitionMode } from './declare'
import { ApiError } from './params'
import {
  applyWrite,
  contextOf,
  expectedOf,
  type Hooked,
  noneHooked,
  recordBatch,
  type Store,
  sendAfterCommit,
  writableOf,
} from './writes'

type Values = Record<string, unknown>
type Step = { key: string; hooked: Hooked }
const WRITE: TransitionMode = { kind: 'write' }

export interface ActionRun {
  batch_id: string
  created: { dataset: string; id: number }[]
  notices: string[]
}

const badBody = (message: string) => new ApiError(400, 'bad_body', message)
const isId = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0

function actionOf(domain: Domain, name: string): ActionDecl {
  const action = domain.actions && Object.hasOwn(domain.actions, name) ? domain.actions[name] : undefined
  if (!action) throw new ApiError(404, 'unknown_action', `unknown action "${name}"`)
  return action
}

function idsOf(action: ActionDecl, body: Values): { id: number; input: Record<string, number> } {
  const input = body.input ?? {}
  if (!isId(body.id)) throw badBody('"id" must be a record id')
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw badBody('"input" must be an object')
  const given = input as Values
  for (const key of Object.keys(given)) {
    if (!Object.hasOwn(action.input, key)) throw badBody(`"input.${key}" is not an input of this action`)
  }
  for (const key of Object.keys(action.input)) {
    if (!isId(given[key])) throw badBody(`"input.${key}" must be a record id`)
  }
  return { id: body.id, input: given as Record<string, number> }
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

type Done = { dataset: string; id: number }

// Every write joins the action's batch; a create then makes its children under the id it got.
function createAs(store: Store, actor: Actor, step: ActionCreate, at: Step): Done[] {
  const target = writableOf(store.domain, step.dataset, 'create', actor)
  const { id } = applyWrite(store, target, 'create', null, step.values, actor, WRITE, at.hooked, at.key)
  const children = (step.then?.(id) ?? []).flatMap((child) => createAs(store, actor, child, at))
  return [{ dataset: step.dataset, id }, ...children]
}

function updateAs(store: Store, actor: Actor, step: ActionUpdate, at: Step): void {
  const target = writableOf(store.domain, step.dataset, 'update', actor)
  const mode: TransitionMode = { kind: 'write', expect: expectedOf(target.dataset, step.expect) }
  applyWrite(store, target, 'update', step.id, step.values, actor, mode, at.hooked, at.key)
}

// Runs as the caller, never with the import's 'all' scope; one transaction, so any refusal rolls back every create.
export function runAction(store: Store, name: string, body: Values, actor: Actor): ActionRun {
  const action = actionOf(store.domain, name)
  visibleSource(store.domain, action.on, actor)
  const ids = idsOf(action, body)
  const hooked = noneHooked()
  const run = store.sqlite
    .transaction((): Omit<ActionRun, 'notices'> => {
      const record = readRecord(store, action.on, ids.id, actor)
      const input = Object.fromEntries(
        Object.entries(action.input).map(([key, { relation }]) => [
          key,
          readRecord(store, relation, ids.input[key] as number, actor),
        ]),
      )
      const now = new Date().toISOString()
      const key = crypto.randomUUID()
      const result = action.run(record, input, contextOf(store, actor, record))
      const { creates = [], updates = [] } = Array.isArray(result) ? { creates: result } : result
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

export function actionsOn(domain: Domain, dataset: string): ({ name: string } & Pick<ActionDecl, 'label' | 'input'>)[] {
  return Object.entries(domain.actions ?? {})
    .filter(([, action]) => action.on === dataset)
    .map(([name, { label, input }]) => ({ name, label, input }))
}
