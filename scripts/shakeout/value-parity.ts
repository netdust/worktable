// Value-level parity: Laika's WordPress tables read directly, against engine.db, joined on legacy id.
// stdout and the summary carry counts and column names only; row values go to the 0600 detail file.
import { Database } from 'bun:sqlite'
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { SQL } from 'bun'
import {
  activityStatus,
  activityTimes,
  assignmentNote,
  assignmentState,
  compare,
  duplicateLosers,
  type Expected,
  kindSoort,
  organisationSoort,
  PLACEHOLDER_PRODUCTIE,
  relationId,
  splitName,
  type Tally,
  text,
  translationGroup,
} from './value-parity-rules'

const { values: args } = parseArgs({
  options: {
    'laika-dir': { type: 'string', default: join(homedir(), 'Sites', 'laika-planning-model') },
    'mysql-url': { type: 'string' },
    engine: { type: 'string', default: join(homedir(), 'laika-export', 'engine.db') },
    'out-dir': { type: 'string', default: join(homedir(), 'laika-export', 'shakeout') },
    lang: { type: 'string', default: 'nl' },
    own: { type: 'string' },
  },
})

const LANG = args.lang as string
const TYPES = ['activity', 'assignment', 'absence', 'person', 'organisation', 'production']
const GONE = new Set(['trash', 'auto-draft'])

// Each compared column says whether it follows an approved rule or a judgment call, so a mismatch class is explainable.
const LABELS: Record<string, Record<string, string>> = {
  activiteit: {
    productie: 'rule: production relation, none → placeholder 0',
    soort: 'rule: kind map',
    omschrijving: 'rule: post title (trimmed, empty → null)',
    datum: 'rule: WP date',
    start_at: 'rule: date+start, null without a start',
    eind_at: 'rule: end rolls past midnight; dropped without a start',
    plandag: 'rule: datum untimed, else day line 05:00',
    locatie: 'rule: location relation',
    plaats: 'rule: place (trimmed)',
    status: 'rule: status map',
    notities: 'rule: notes (trimmed)',
    custom: 'rule: {laika_soort, laika_verrekening?}',
    verrekening_default: 'judgment: settled_by goes to custom, column stays null',
    bron: "judgment: every imported row is 'plan'",
    speelreeks_id: 'judgment: no series in Laika, null',
  },
  toewijzing: {
    activiteit: 'rule: activity relation',
    persoon: 'rule: person relation, translation → source language',
    naam: 'judgment: name dropped when a person is set',
    state: 'rule: status map, maybe → uitgenodigd',
    notitie: "rule: note, maybe appends 'Laika: maybe'",
    custom: 'judgment: empty custom',
  },
  beschikbaarheid: {
    persoon: 'rule: person relation',
    start_at: 'rule: from T00:00',
    eind_at: 'rule: to T23:59',
    reden: 'rule: reason (trimmed)',
    custom: 'judgment: empty custom',
  },
  persoon: {
    voornaam: 'rule: name split, first token always voornaam',
    achternaam: 'rule: name split, particles attach, single token → (onbekend)',
    weergavenaam: 'rule: voornaam + achternaam',
    email: 'rule: email meta',
    telefoon: 'rule: phone meta',
    dietary: 'rule: dietary meta',
    custom: 'judgment: {laika_core_team} when core team',
  },
  organisatie: {
    soort: args.own
      ? 'rule: role order, own from --own'
      : 'judgment: role order, own taken from the engine row marked eigen',
    laika_rollen: 'rule: role slugs, sorted',
  },
}

type Post = { id: number; type: string; status: string; title: string; meta: Record<string, string> }

function mysqlUrl(): string {
  if (args['mysql-url']) return args['mysql-url']
  const run = Bun.spawnSync(['ddev', 'describe', '-j'], { cwd: args['laika-dir'], stdout: 'pipe', stderr: 'pipe' })
  if (run.exitCode !== 0) throw new Error('ddev describe failed; pass --mysql-url')
  const db = JSON.parse(run.stdout.toString()).raw.dbinfo
  return `mysql://${db.username}:${db.password}@127.0.0.1:${db.published_port}/${db.dbname}`
}

async function readLaika() {
  // One connection, so the read-only session holds for every query.
  const sql = new SQL({ url: mysqlUrl(), max: 1 })
  try {
    await sql.unsafe('SET SESSION TRANSACTION READ ONLY')
    const [ro] = (await sql.unsafe('SELECT @@session.transaction_read_only AS ro')) as { ro: number }[]
    if (Number(ro?.ro) !== 1) throw new Error('the Laika session is not read-only; refusing to continue')
    const types = TYPES.map((t) => `'${t}'`).join(',')
    const posts = (await sql.unsafe(
      `SELECT ID AS id, post_type AS type, post_status AS status, post_title AS title FROM wp_posts WHERE post_type IN (${types}) ORDER BY ID`,
    )) as Omit<Post, 'meta'>[]
    const meta = (await sql.unsafe(
      `SELECT m.post_id AS id, m.meta_key AS k, m.meta_value AS v FROM wp_postmeta m JOIN wp_posts p ON p.ID = m.post_id
       WHERE p.post_type IN (${types}) AND m.meta_key LIKE '\\_atelier\\_%' ORDER BY m.meta_id`,
    )) as { id: number; k: string; v: string }[]
    const terms = (await sql.unsafe(
      `SELECT r.object_id AS id, tt.taxonomy AS tax, t.slug AS slug, tt.description AS description
       FROM wp_term_relationships r JOIN wp_term_taxonomy tt ON tt.term_taxonomy_id = r.term_taxonomy_id
       JOIN wp_terms t ON t.term_id = tt.term_id JOIN wp_posts p ON p.ID = r.object_id
       WHERE p.post_type IN (${types}) AND tt.taxonomy IN ('language', 'post_translations', 'organisation_role')`,
    )) as { id: number; tax: string; slug: string; description: string }[]
    return { posts, meta, terms }
  } finally {
    await sql.close()
  }
}

function buildSource(raw: Awaited<ReturnType<typeof readLaika>>) {
  const posts = new Map<number, Post>()
  for (const p of raw.posts) posts.set(Number(p.id), { ...p, id: Number(p.id), meta: {} })
  for (const m of raw.meta) {
    const post = posts.get(Number(m.id))
    if (post) post.meta[m.k.replace(`_atelier_${post.type}_`, '')] = m.v
  }
  const language = new Map<number, string>()
  const group = new Map<number, Record<string, number>>()
  const roles = new Map<number, string[]>()
  for (const t of raw.terms) {
    const id = Number(t.id)
    if (t.tax === 'language') language.set(id, t.slug)
    if (t.tax === 'post_translations') group.set(id, translationGroup(t.description))
    if (t.tax === 'organisation_role') roles.set(id, [...(roles.get(id) ?? []), t.slug].sort())
  }
  return { posts, language, group, roles }
}

type Source = ReturnType<typeof buildSource>

function sourceSide(src: Source) {
  const ofType = (type: string) => [...src.posts.values()].filter((p) => p.type === type)
  // A translatable record is exported when it is in the source language and not trashed.
  const isRecord = (p: Post | undefined): p is Post =>
    !!p &&
    !GONE.has(p.status) &&
    src.language.get(p.id) === LANG &&
    ['person', 'organisation', 'production'].includes(p.type)
  const sourceLanguageId = (id: number): number | null => {
    const g = src.group.get(id)
    const target = g ? (g[LANG] ?? null) : src.language.get(id) === LANG ? id : null
    return target !== null && isRecord(src.posts.get(target)) ? target : null
  }
  // How often each rule's edge case occurs in the source, so a zero mismatch count is not vacuous.
  const exercised: Record<string, number> = {}
  const saw = (rule: string, when: unknown) => {
    if (when) exercised[rule] = (exercised[rule] ?? 0) + 1
  }
  const published = (type: string) => ofType(type).filter((p) => p.status === 'publish')
  const unpublished: Record<string, number> = {}
  for (const t of ['activity', 'assignment', 'absence']) unpublished[t] = ofType(t).length - published(t).length

  const entities = (type: string, ds: string) => {
    const rows = ofType(type).filter(isRecord)
    return { rows, ids: new Set(rows.map((p) => p.id)), ds }
  }
  const persons = entities('person', 'persoon')
  const orgs = entities('organisation', 'organisatie')

  // A relation that is set but cannot land on an exported record refuses the row.
  const link = (raw: unknown, translatable: boolean, exported: Set<number>): number | null | 'refused' => {
    const id = relationId(raw)
    if (id === null) return null
    const target = translatable ? sourceLanguageId(id) : id
    return target !== null && exported.has(target) ? target : 'refused'
  }

  const activiteit = new Map<number, Expected>()
  const activityDrops = new Map<number, string>()
  const productions = new Set(
    ofType('production')
      .filter(isRecord)
      .map((p) => p.id),
  )
  for (const p of published('activity')) {
    const m = p.meta
    const date = text(m.date) ?? ''
    const start = text(m.start)
    const end = text(m.end)
    const productie = link(m.production, true, productions)
    const locatie = link(m.location, true, orgs.ids)
    const status = activityStatus(m.status ?? '')
    const soort = kindSoort(m.kind ?? '')
    const time = /^([01]\d|2[0-3]):[0-5]\d$/
    const drop = !/^\d{4}-\d{2}-\d{2}$/.test(date)
      ? 'invalid date'
      : (start && !time.test(start)) || (end && !time.test(end))
        ? 'invalid time'
        : productie === 'refused' || locatie === 'refused'
          ? 'relation target not exported'
          : status === null || soort === null
            ? 'unmapped status or kind'
            : null
    if (drop) activityDrops.set(p.id, drop)
    const settled = text(m.settled_by)
    saw('activiteit: untimed (start_at null, plandag = datum)', !start)
    saw('activiteit: end without a start (end dropped)', !start && end)
    saw('activiteit: end before start (rolls to next day)', start && end && end < start)
    saw('activiteit: start before the day line', start && Number(start.slice(0, 2)) < 5)
    saw('activiteit: no production (placeholder 0)', productie === null)
    saw('activiteit: settled_by kept in custom', settled)
    activiteit.set(p.id, {
      productie: productie === 'refused' ? null : (productie ?? PLACEHOLDER_PRODUCTIE),
      soort,
      omschrijving: text(p.title),
      ...activityTimes(date, start, end),
      locatie: locatie === 'refused' ? null : locatie,
      plaats: text(m.place),
      status,
      notities: text(m.notes),
      custom: JSON.stringify({ laika_soort: m.kind ?? '', ...(settled ? { laika_verrekening: settled } : {}) }),
      verrekening_default: null,
      bron: 'plan',
      speelreeks_id: null,
    })
  }
  const exportedActivities = new Set([...activiteit.keys()].filter((id) => !activityDrops.has(id)))

  const toewijzing = new Map<number, Expected>()
  const assignmentDrops = new Map<number, string>()
  const pairs: { id: number; persoon: number | null; activiteit: number | null }[] = []
  for (const p of published('assignment')) {
    const m = p.meta
    const act = link(m.activity, false, exportedActivities)
    const persoon = link(m.person, true, persons.ids)
    const naam = text(m.name)
    const status = m.status ?? ''
    const state = assignmentState(status)
    const drop =
      act === null || act === 'refused'
        ? 'activity missing or not exported'
        : persoon === 'refused'
          ? 'person not exported'
          : persoon === null && naam === null
            ? 'neither person nor name'
            : state === null
              ? 'unmapped status'
              : null
    if (drop) assignmentDrops.set(p.id, drop)
    else pairs.push({ id: p.id, persoon: persoon as number | null, activiteit: act as number })
    const person = persoon === 'refused' ? null : persoon
    saw("toewijzing: maybe (state uitgenodigd, note 'Laika: maybe')", status === 'maybe')
    saw('toewijzing: person and name (name dropped)', person !== null && naam !== null)
    saw('toewijzing: name only', person === null && naam !== null)
    saw('toewijzing: person via a translation', person !== null && person !== relationId(m.person))
    toewijzing.set(p.id, {
      activiteit: act === 'refused' ? null : act,
      persoon: person,
      naam: person === null ? naam : null,
      state,
      notitie: assignmentNote(text(m.note), status),
      custom: '{}',
    })
  }
  for (const id of duplicateLosers(pairs)) {
    assignmentDrops.set(id, 'duplicate (persoon, activiteit), newer row')
    saw('toewijzing: duplicate pair, newer row dropped', true)
  }

  const beschikbaarheid = new Map<number, Expected>()
  const absenceDrops = new Map<number, string>()
  for (const p of published('absence')) {
    const m = p.meta
    const from = text(m.from) ?? ''
    const to = text(m.to) ?? ''
    const persoon = link(m.person, true, persons.ids)
    const day = /^\d{4}-\d{2}-\d{2}$/
    const drop =
      !day.test(from) || !day.test(to)
        ? 'invalid date'
        : to < from
          ? 'ends before it starts'
          : persoon === null || persoon === 'refused'
            ? 'person missing or not exported'
            : null
    if (drop) absenceDrops.set(p.id, drop)
    beschikbaarheid.set(p.id, {
      persoon: persoon === 'refused' ? null : persoon,
      start_at: `${from}T00:00`,
      eind_at: `${to}T23:59`,
      reden: text(m.reason),
      custom: '{}',
    })
  }

  const persoon = new Map<number, Expected>()
  for (const p of persons.rows) {
    const { case: kind, ...name } = splitName(p.title)
    saw(`persoon: ${kind} name`, true)
    const coreTeam = !!p.meta.core_team && p.meta.core_team !== '0'
    persoon.set(p.id, {
      ...name,
      weergavenaam: `${name.voornaam} ${name.achternaam}`,
      email: text(p.meta.email),
      telefoon: text(p.meta.phone),
      dietary: text(p.meta.dietary),
      custom: JSON.stringify(coreTeam ? { laika_core_team: true } : {}),
    })
  }

  const organisatie = new Map<number, Expected>()
  for (const p of orgs.rows) {
    const r = src.roles.get(p.id) ?? []
    organisatie.set(p.id, { soort: null, laika_rollen: JSON.stringify(r), roles: JSON.stringify(r) })
  }

  return {
    exercised,
    unpublished,
    sets: {
      activiteit: { rows: activiteit, drops: activityDrops },
      toewijzing: { rows: toewijzing, drops: assignmentDrops },
      beschikbaarheid: { rows: beschikbaarheid, drops: absenceDrops },
      persoon: { rows: persoon, drops: new Map<number, string>() },
      organisatie: { rows: organisatie, drops: new Map<number, string>() },
    },
  }
}

function engineSide(path: string) {
  const db = new Database(path, { readonly: true })
  try {
    const legacy = (table: string) => {
      const map = new Map<number, number | null>()
      for (const r of db.query(`SELECT id, legacy_post_id AS l FROM ${table}`).all() as {
        id: number
        l: number | null
      }[])
        map.set(r.id, r.l)
      return map
    }
    const prod = legacy('productie')
    const org = legacy('organisatie')
    const act = legacy('activiteit')
    const per = legacy('persoon')
    const via = (map: Map<number, number | null>, id: unknown) => (id == null ? null : (map.get(Number(id)) ?? null))
    const softDeleted: Record<string, number> = {}

    const rows = (table: string, shape: (r: Record<string, unknown>) => Expected) => {
      const out = new Map<number | null, Expected[]>()
      for (const r of db.query(`SELECT * FROM ${table}`).all() as Record<string, unknown>[]) {
        if (r.deleted_at != null) {
          softDeleted[table] = (softDeleted[table] ?? 0) + 1
          continue
        }
        const key = (r.legacy_post_id as number | null) ?? null
        out.set(key, [...(out.get(key) ?? []), shape(r)])
      }
      return out
    }
    const json = (s: unknown) => (s == null ? null : JSON.stringify(JSON.parse(String(s))))

    return {
      softDeleted,
      sets: {
        activiteit: rows('activiteit', (r) => ({
          productie: via(prod, r.productie_id),
          soort: r.soort as string,
          omschrijving: r.omschrijving as string | null,
          datum: r.datum as string,
          start_at: r.start_at as string | null,
          eind_at: r.eind_at as string | null,
          plandag: r.plandag as string,
          locatie: via(org, r.locatie_id),
          plaats: r.plaats as string | null,
          status: r.status as string,
          notities: r.notities as string | null,
          custom: json(r.custom),
          verrekening_default: r.verrekening_default as string | null,
          bron: r.bron as string,
          speelreeks_id: r.speelreeks_id as number | null,
        })),
        toewijzing: rows('toewijzing', (r) => ({
          activiteit: via(act, r.activiteit_id),
          persoon: via(per, r.persoon_id),
          naam: r.naam as string | null,
          state: r.state as string,
          notitie: r.notitie as string | null,
          custom: json(r.custom),
        })),
        beschikbaarheid: rows('beschikbaarheid', (r) => ({
          persoon: via(per, r.persoon_id),
          start_at: r.start_at as string,
          eind_at: r.eind_at as string,
          reden: r.reden as string | null,
          custom: json(r.custom),
        })),
        persoon: rows('persoon', (r) => ({
          voornaam: r.voornaam as string,
          achternaam: r.achternaam as string,
          weergavenaam: r.weergavenaam as string,
          email: r.email as string | null,
          telefoon: r.telefoon as string | null,
          dietary: r.dietary as string | null,
          custom: json(r.custom),
        })),
        organisatie: rows('organisatie', (r) => ({
          soort: r.soort as string,
          laika_rollen: JSON.stringify(JSON.parse(String(r.custom ?? '{}')).laika_rollen ?? null),
        })),
      },
    }
  } finally {
    db.close()
  }
}

function resolveOwn(source: Map<number, Expected>, engine: Map<number | null, Expected[]>): void {
  const own = args.own
    ? Number(args.own)
    : [...engine.entries()].find(([, rows]) => rows.some((r) => r.soort === 'eigen'))?.[0]
  for (const [id, row] of source) row.soort = organisationSoort(JSON.parse(String(row.roles)) as string[], id === own)
  for (const row of source.values()) delete row.roles
}

type Context = {
  unpublished: Record<string, number>
  softDeleted: Record<string, number>
  exercised: Record<string, number>
}

function render(results: [string, Tally][], { unpublished, softDeleted, exercised }: Context) {
  const lines: string[] = ['# Value parity: Laika WordPress ↔ engine.db', '']
  lines.push('Counts and column names only. Row detail: value-parity.detail.json (mode 0600).', '')
  lines.push(
    `Source rows not published (not compared): ${Object.entries(unpublished)
      .map(([t, n]) => `${t} ${n}`)
      .join(', ')}`,
  )
  lines.push(
    `Engine rows soft-deleted (not compared): ${
      Object.entries(softDeleted)
        .map(([t, n]) => `${t} ${n}`)
        .join(', ') || 'none'
    }`,
    '',
  )
  for (const [dataset, t] of results) {
    const supporting = dataset === 'persoon' || dataset === 'organisatie' ? ' (supporting)' : ''
    lines.push(`## ${dataset}${supporting}`, '', `Joined and compared: ${t.compared}`, '')
    lines.push('| column | mismatches | basis |', '|---|---:|---|')
    for (const [column, n] of Object.entries(t.columns))
      lines.push(`| ${column} | ${n} | ${LABELS[dataset]?.[column] ?? ''} |`)
    lines.push('')
    const presence = (label: string, counts: Record<string, number>) => {
      const entries = Object.entries(counts)
      lines.push(`${label}: ${entries.length === 0 ? '0' : entries.map(([r, n]) => `${n} (${r})`).join(', ')}`)
    }
    presence('Source only', t.sourceOnly)
    presence('Engine only', t.engineOnly)
    lines.push('')
  }
  lines.push('## Rule cases present in the source', '', '| case | rows |', '|---|---:|')
  for (const [rule, n] of Object.entries(exercised).sort()) lines.push(`| ${rule} | ${n} |`)
  return lines.join('\n')
}

const ORDER = ['activiteit', 'toewijzing', 'beschikbaarheid', 'persoon', 'organisatie'] as const

async function main() {
  const source = sourceSide(buildSource(await readLaika()))
  const engine = engineSide(args.engine as string)
  resolveOwn(source.sets.organisatie.rows, engine.sets.organisatie)

  const results: [string, Tally][] = ORDER.map((ds) => {
    const s = source.sets[ds]
    return [ds, compare(ds, Object.keys(LABELS[ds] ?? {}), s.rows, engine.sets[ds], s.drops)]
  })
  const summary = render(results, { ...source, softDeleted: engine.softDeleted })

  const dir = args['out-dir'] as string
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  chmodSync(dir, 0o700)
  const detail = Object.fromEntries(results.map(([ds, t]) => [ds, { mismatches: t.detail, presence: t.presence }]))
  writeFileSync(join(dir, 'value-parity.detail.json'), JSON.stringify(detail, null, 2), { mode: 0o600 })
  chmodSync(join(dir, 'value-parity.detail.json'), 0o600)
  writeFileSync(join(dir, 'value-parity.md'), `${summary}\n`, { mode: 0o600 })
  console.log(summary)
}

await main()
