import { ROLES } from './auth-tables'
import { type ColumnDecl, type DatasetDecl, type Domain, ICONS, type QueryDecl, TONES } from './declare'
import { reservedNames } from './engine-tables'
import { sourceOf, sourcesOf, writerOf } from './registry'

export class DomainError extends Error {
  constructor(
    readonly declaration: string,
    readonly bad: string,
    message: string,
  ) {
    super(`${declaration}: ${message}`)
    this.name = 'DomainError'
  }
}

const declared = (source: DatasetDecl | QueryDecl, column: string): boolean =>
  Object.hasOwn(source.columns, column) || (source.kind === 'dataset' && column === 'id')

function checkColumn(source: DatasetDecl | QueryDecl, what: string, column: string | undefined): void {
  if (column !== undefined && !declared(source, column)) {
    throw new DomainError(source.name, column, `${what} "${column}" is not a declared column`)
  }
}

function checkTitle(source: DatasetDecl | QueryDecl): void {
  if (typeof source.title === 'string') {
    checkColumn(source, 'title', source.title)
    return
  }
  const { via, else: fallback } = source.title
  checkColumn(source, 'title else', fallback)
  const target = source.columns[via]?.relation
  if (!target) throw new DomainError(source.name, via, `title via "${via}" is not a relation column`)
}

function checkTones(source: DatasetDecl | QueryDecl): void {
  for (const [column, decl] of Object.entries(source.columns)) {
    if (!decl.tones) continue
    if (!decl.options) throw new DomainError(source.name, column, `${column} declares tones but has no options`)
    for (const key of Object.keys(decl.tones)) {
      if (!Object.hasOwn(decl.options, key)) {
        throw new DomainError(source.name, key, `${column} has a tone for "${key}", which is not one of its options`)
      }
    }
    for (const tone of Object.values(decl.tones)) {
      if (!(TONES as readonly string[]).includes(tone)) {
        throw new DomainError(source.name, tone, `${column} has tone "${tone}", not one of ${TONES.join(', ')}`)
      }
    }
  }
}

function checkIcon(source: DatasetDecl | QueryDecl): void {
  const icon = source.icon
  if (icon !== undefined && !(ICONS as readonly string[]).includes(icon)) {
    throw new DomainError(source.name, icon, `icon "${icon}" is not one of ${ICONS.join(', ')}`)
  }
}

const MAX_NEW_LABEL = 60

function checkNewLabel(dataset: DatasetDecl): void {
  const label = dataset.new_label
  if (label === undefined || (typeof label === 'string' && label.trim() !== '' && label.length <= MAX_NEW_LABEL)) return
  throw new DomainError(dataset.name, String(label), `new_label must be words of 1 to ${MAX_NEW_LABEL} characters`)
}

function checkCreates(domain: Domain, query: QueryDecl): void {
  const dataset = query.creates
  if (dataset === undefined) return
  if (!domain.datasets.some((d) => d.name === dataset) || !writerOf(domain, dataset)?.create) {
    throw new DomainError(
      query.name,
      dataset,
      `creates "${dataset}", which is not a dataset with a writer that creates`,
    )
  }
}

function checkOf(domain: Domain, query: QueryDecl): void {
  const dataset = query.of
  if (dataset !== undefined && !domain.datasets.some((d) => d.name === dataset)) {
    throw new DomainError(query.name, dataset, `of "${dataset}", which is not a dataset`)
  }
}

function checkOwners(source: DatasetDecl | QueryDecl): void {
  const column = source.owners?.owner
  if (column === undefined || column === 'id' || source.columns[column]?.relation) return
  throw new DomainError(source.name, column, `owner column "${column}" is not id or a relation column`)
}

// A json column would serve every key in it; the owner column is the scope, never a value.
function checkOwnerVisible(source: DatasetDecl | QueryDecl): void {
  for (const [column, decl] of Object.entries(source.columns)) {
    if (!decl.owner_visible) continue
    if (decl.type === 'json')
      throw new DomainError(source.name, column, `${column} is json, so it is not owner_visible`)
    if (column === source.owners?.owner) {
      throw new DomainError(source.name, column, `${column} is the owner column, so it is not owner_visible`)
    }
  }
}

// Keys the engine adds to every row it answers.
const OVERWRITTEN = [
  ['title', 'the computed row title'],
  ['revision', 'the write reply'],
  ['links', "the row's link rows"],
  ['inherited', "the row's inherited lookups"],
] as const

function checkRelations(domain: Domain, source: DatasetDecl | QueryDecl): void {
  for (const [column, by] of OVERWRITTEN) {
    if (Object.hasOwn(source.columns, column)) {
      throw new DomainError(source.name, column, `a column named "${column}" would be overwritten by ${by}`)
    }
  }
  const names = new Set(domain.datasets.map((d) => d.name))
  for (const [column, decl] of Object.entries(source.columns)) {
    if (decl.relation && !names.has(decl.relation)) {
      throw new DomainError(source.name, decl.relation, `${column} relates to undeclared dataset "${decl.relation}"`)
    }
    const target = domain.datasets.find((d) => d.name === decl.relation)
    if (target && typeof target.title !== 'string') {
      throw new DomainError(
        source.name,
        column,
        `${column} relates to "${target.name}", whose title is through a relation`,
      )
    }
  }
}

// The key points back at the source's own rows: the dataset itself, or the dataset a query creates.
function checkLinks(domain: Domain, source: DatasetDecl | QueryDecl): void {
  for (const [name, link] of Object.entries(source.links ?? {})) {
    const at = (bad: string, message: string): DomainError =>
      new DomainError(source.name, bad, `link ${name} ${message}`)
    const linked = domain.datasets.find((d) => d.name === link.dataset)
    if (!linked) throw at(link.dataset, `reads undeclared dataset "${link.dataset}"`)
    if (declared(source, name)) throw at(name, 'has the name of a column')
    const own = source.kind === 'dataset' ? source.name : source.creates
    if (own === undefined) throw at(name, 'is on a query that declares no creates')
    if (linked.columns[link.key]?.relation !== own)
      throw at(link.key, `key "${link.key}" is not a relation to "${own}"`)
    if (!linked.columns[link.target]?.relation)
      throw at(link.target, `target "${link.target}" is not a relation column`)
    if (link.state !== undefined && !linked.columns[link.state]?.options) {
      throw at(link.state, `state "${link.state}" is not an options column`)
    }
  }
}

// Keys every row or write body already carries.
const LOOKUP_RESERVED = new Set([
  'id',
  'custom',
  'created_at',
  'updated_at',
  'deleted_at',
  'lookups',
  'inherited',
  'cells',
  'title',
  'links',
  'revision',
  'notices',
  'expect',
])

// One hop through a live relation; a boolean field is refused because the subquery answers 0 or 1.
function checkLookups(domain: Domain, dataset: DatasetDecl): void {
  for (const [name, lookup] of Object.entries(dataset.lookups ?? {})) {
    const at = (bad: string, message: string) => new DomainError(dataset.name, bad, `lookup ${name} ${message}`)
    if (dataset.owners) throw at(name, 'is on a dataset with owners, which reads only titles through a relation')
    if (LOOKUP_RESERVED.has(name)) throw at(name, 'has a name the engine uses on every row')
    if (declared(dataset, name) || Object.hasOwn(dataset.links ?? {}, name)) {
      throw at(name, 'has the name of a column or a link')
    }
    const target = domain.datasets.find((d) => d.name === dataset.columns[lookup.via]?.relation)
    if (!target) throw at(lookup.via, `via "${lookup.via}" is not a relation column`)
    const field = Object.hasOwn(target.columns, lookup.field) ? target.columns[lookup.field] : undefined
    if (!field) throw at(lookup.field, `field "${lookup.field}" is not a column of "${target.name}"`)
    if (field.type === 'json' || field.type === 'boolean') {
      throw at(lookup.field, `field "${lookup.field}" is ${field.type}`)
    }
    if (lookup.own === undefined) continue
    const own = Object.hasOwn(dataset.columns, lookup.own) ? dataset.columns[lookup.own] : undefined
    if (own?.type !== field.type || own.relation !== field.relation) {
      throw at(lookup.own, `own "${lookup.own}" is not a column of the field's type and relation`)
    }
  }
}

function checkWrites(
  domain: Domain,
  query: QueryDecl,
  column: string,
  writes: NonNullable<ColumnDecl['writes']>,
): void {
  const target = domain.datasets.find((d) => d.name === writes.dataset)
  const at = (name: string, message: string): DomainError => new DomainError(query.name, name, `${column} ${message}`)
  if (!target) throw at(writes.dataset, `writes to undeclared dataset "${writes.dataset}"`)
  if (!Object.hasOwn(target.columns, writes.field))
    throw at(writes.field, `writes to undeclared field "${writes.field}"`)
  if (target.columns[writes.field]?.readonly) throw at(writes.field, `writes to readonly field "${writes.field}"`)
  if (!declared(query, writes.key)) throw at(writes.key, `has key "${writes.key}", not a column of the query`)
  if (!writerOf(domain, writes.dataset)?.update) {
    throw at(writes.dataset, `writes to "${writes.dataset}", which has no writer with update`)
  }
}

function checkMatrix(domain: Domain, join: DatasetDecl, downs: Set<string>): void {
  const m = join.matrix
  if (!m) return
  const at = (bad: string, message: string): DomainError => new DomainError(join.name, bad, `matrix ${message}`)
  const relation = (what: string, column: string): string => {
    const target = join.columns[column]?.relation
    if (!target) throw at(column, `${what} "${column}" is not a relation column of "${join.name}"`)
    return target
  }
  const downTarget = relation('down', m.down)
  relation('across', m.across)
  for (const [what, column] of [
    ['label', m.label],
    ['note', m.note],
  ] as const) {
    if (column !== undefined && join.columns[column]?.type !== 'text') {
      throw at(column, `${what} "${column}" is not a text column`)
    }
  }
  const options = join.columns[m.cell]?.options
  if (!options) throw at(m.cell, `cell "${m.cell}" is not an options column`)
  const option = (what: string, key: string): void => {
    if (!Object.hasOwn(options, key)) throw at(key, `${what} "${key}" is not an option of "${m.cell}"`)
  }
  for (const key of Object.values(m.keys)) option('key', key)
  for (const key of Object.keys(m.marks)) option('mark', key)
  option('count', m.count)
  if (downs.has(downTarget)) throw at(m.down, `down source "${downTarget}" already has a matrix`)
  downs.add(downTarget)
  if (m.away) checkAway(domain, join, m, m.away, at)
  if (m.open) checkOpen(domain, join, m, m.open, at)
}

// The fill acts on the open row itself, and its one input is the record it puts across.
function checkOpen(
  domain: Domain,
  join: DatasetDecl,
  m: NonNullable<DatasetDecl['matrix']>,
  open: NonNullable<NonNullable<DatasetDecl['matrix']>['open']>,
  at: (bad: string, message: string) => DomainError,
): void {
  if (!join.columns[open.match]?.relation) {
    throw at(open.match, `open match "${open.match}" is not a relation column of "${join.name}"`)
  }
  if (join.columns[open.count]?.type !== 'integer') {
    throw at(open.count, `open count "${open.count}" is not an integer column`)
  }
  const action = domain.actions && Object.hasOwn(domain.actions, open.fill) ? domain.actions[open.fill] : undefined
  if (!action) throw at(open.fill, `open fill "${open.fill}" is not a declared action`)
  if (action.on !== join.name)
    throw at(open.fill, `open fill "${open.fill}" acts on "${action.on}", not "${join.name}"`)
  const across = join.columns[m.across]?.relation
  const inputs = Object.values(action.input)
  if (inputs.length !== 1 || inputs[0]?.relation !== across) {
    throw at(open.fill, `open fill "${open.fill}" must take one input, a "${across}"`)
  }
}

function checkAway(
  domain: Domain,
  join: DatasetDecl,
  m: NonNullable<DatasetDecl['matrix']>,
  away: NonNullable<NonNullable<DatasetDecl['matrix']>['away']>,
  at: (bad: string, message: string) => DomainError,
): void {
  const target = domain.datasets.find((d) => d.name === away.dataset)
  if (!target) throw at(away.dataset, `away dataset "${away.dataset}" is not declared`)
  if (!target.date) throw at(away.dataset, `away dataset "${away.dataset}" declares no date`)
  const across = join.columns[m.across]?.relation
  if (target.columns[away.across]?.relation !== across) {
    throw at(away.across, `away across "${away.across}" is not a relation to "${across}"`)
  }
  for (const [what, column] of [
    ['label', away.label],
    ['end', away.end],
  ] as const) {
    if (!Object.hasOwn(target.columns, column)) throw at(column, `away ${what} "${column}" is not a declared column`)
  }
}

function checkLifecycle(dataset: DatasetDecl): void {
  const lifecycle = dataset.lifecycle
  if (!lifecycle) return
  const at = (bad: string, message: string) => new DomainError(dataset.name, bad, `lifecycle ${message}`)
  const options = dataset.columns[lifecycle.column]?.options
  if (!options) throw at(lifecycle.column, `column "${lifecycle.column}" is not an options column`)
  const checkOption = (what: string, key: string) => {
    if (!Object.hasOwn(options, key)) throw at(key, `${what} "${key}" is not an option of "${lifecycle.column}"`)
  }
  for (const { from, to, roles, label } of lifecycle.transitions) {
    if (from !== '*') for (const key of from) checkOption('from', key)
    checkOption('to', to)
    if (label !== undefined && (typeof label !== 'string' || label.trim() === '')) {
      throw at(to, `label of the transition to "${to}" must be a non-empty string`)
    }
    for (const role of roles) if (!Object.hasOwn(ROLES, role)) throw at(role, `role "${role}" is not a role`)
  }
  for (const key of Object.keys(lifecycle.hooks ?? {})) checkOption('hook', key)
  for (const column of lifecycle.token_projection ?? []) {
    checkColumn(dataset, 'token_projection column', column)
    if (!dataset.columns[column]?.owner_visible)
      throw at(column, `token_projection column "${column}" is not owner_visible`)
  }
}

function checkRecordLink(dataset: DatasetDecl): void {
  const link = dataset.record_link
  if (!link) return
  if (!dataset.owners?.owner) throw new DomainError(dataset.name, 'record_link', 'record_link needs an owner column')
  const { email } = link
  if (email !== undefined && dataset.columns[email]?.type !== 'text') {
    throw new DomainError(dataset.name, email, `record_link email "${email}" is not a text column`)
  }
}

const ACTION_NAME = /^[a-z][a-z0-9_]*$/

function checkActions(domain: Domain): void {
  const datasets = new Set(domain.datasets.map((d) => d.name))
  for (const [name, action] of Object.entries(domain.actions ?? {})) {
    if (!ACTION_NAME.test(name)) throw new DomainError(name, name, `action name must match ${ACTION_NAME}`)
    if (!datasets.has(action.on) || !writerOf(domain, action.on)) {
      throw new DomainError(name, action.on, `action on "${action.on}", which is not a dataset with a writer`)
    }
    for (const [key, { relation }] of Object.entries(action.input)) {
      if (!datasets.has(relation)) throw new DomainError(name, key, `input ${key} relates to undeclared "${relation}"`)
    }
  }
}

// A config seed never points at demo rows.
function checkConfig(domain: Domain, dataset: DatasetDecl): void {
  if (!dataset.config) return
  for (const [column, decl] of Object.entries(dataset.columns)) {
    const target = domain.datasets.find((d) => d.name === decl.relation)
    if (target && !target.config) {
      throw new DomainError(dataset.name, column, `${column} relates to "${target.name}", which is not config`)
    }
  }
}

function checkSpace(domain: Domain): void {
  const space = domain.space?.dataset
  if (space !== undefined && !domain.datasets.some((d) => d.name === space)) {
    throw new DomainError('space', space, `space dataset "${space}" is not declared`)
  }
  let field: string | undefined
  for (const source of sourcesOf(domain)) {
    const column = source.scoped
    if (column === undefined) continue
    if (space === undefined)
      throw new DomainError(source.name, column, `scoped "${column}", but the domain declares no space`)
    if (source.columns[column]?.relation !== space) {
      throw new DomainError(source.name, column, `scoped "${column}" is not a relation column to "${space}"`)
    }
    if (field !== undefined && column !== field) {
      throw new DomainError(source.name, column, `scoped "${column}", but another source is scoped by "${field}"`)
    }
    field = column
  }
  if (space !== undefined && field === undefined)
    throw new DomainError('space', space, 'no source is scoped to the space')
}

function checkSections(domain: Domain): void {
  const seen = new Set<string>()
  for (const { label, sources } of domain.sections ?? []) {
    for (const name of sources) {
      const source = sourceOf(domain, name)
      if (!source) throw new DomainError(label, name, `section lists unknown source "${name}"`)
      if (source.kind === 'query' && source.of !== undefined) {
        throw new DomainError(label, name, `section lists query "${name}", which sits under "${source.of}"`)
      }
      if (seen.has(name)) throw new DomainError(label, name, `"${name}" is listed in more than one place`)
      seen.add(name)
    }
  }
}

function checkFacts(source: DatasetDecl | QueryDecl): void {
  for (const fact of source.group_facts ?? []) {
    if (fact.kind !== 'count') checkColumn(source, 'fact column', fact.column)
    const where = fact.kind === 'empty' ? undefined : fact.where
    for (const column of Object.keys(where ?? {})) checkColumn(source, 'fact where', column)
  }
}

export function validateDomain(domain: Domain): void {
  for (const source of sourcesOf(domain)) {
    if (reservedNames.has(source.name)) {
      throw new DomainError(source.name, source.name, `"${source.name}" is an engine table name`)
    }
    checkTitle(source)
    checkColumn(source, 'date', source.date)
    checkRelations(domain, source)
    checkOwners(source)
    checkOwnerVisible(source)
    checkTones(source)
    checkIcon(source)
    checkFacts(source)
    checkLinks(domain, source)
  }
  checkSpace(domain)
  checkSections(domain)
  const downs = new Set<string>()
  for (const dataset of domain.datasets) {
    if (dataset.checks) throw new DomainError(dataset.name, 'checks', 'checks are for engine tables only')
    if (Object.hasOwn(dataset.columns, 'expect')) {
      throw new DomainError(dataset.name, 'expect', '"expect" is reserved: PATCH reads it as the expected state')
    }
    checkMatrix(domain, dataset, downs)
    checkNewLabel(dataset)
    checkLifecycle(dataset)
    checkRecordLink(dataset)
    checkConfig(domain, dataset)
    checkLookups(domain, dataset)
    for (const index of dataset.indexes ?? []) for (const column of index) checkColumn(dataset, 'index column', column)
  }
  for (const query of domain.queries) {
    checkCreates(domain, query)
    checkOf(domain, query)
    for (const [column, decl] of Object.entries(query.columns)) {
      if (decl.writes) checkWrites(domain, query, column, decl.writes)
    }
  }
  checkActions(domain)
}
