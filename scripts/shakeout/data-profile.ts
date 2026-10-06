import { Database } from 'bun:sqlite'
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

type Row = Record<string, unknown>
type Item = Record<string, unknown>
type Check = { key: string; label: string; items: Item[]; extra?: Record<string, number> }

const SKIP_TABLES = new Set(['_migrations', 'magic_link', 'auth_session', 'rate_limit'])
const DONE_STATES = ['geweigerd', 'geannuleerd']
const WHITESPACE: Record<string, RegExp> = {
  leading_trailing: /^\s|\s$/,
  double_space: / {2}/,
  tab_newline: /[\t\r\n]/,
  nbsp: /\u00a0/,
  zero_width: /\u200b|\u200c|\u200d|\u2060|\ufeff/,
}

const norm = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/(?:\s|\u200b|\u200c|\u200d|\u2060|\ufeff)+/g, ' ')
    .trim()
    .toLowerCase()

const all = (db: Database, sql: string): Row[] => db.query(sql).all() as Row[]

function noStart(db: Database): Check[] {
  const rows = all(
    db,
    "select id, status, datum, omschrijving from activiteit where deleted_at is null and (start_at is null or start_at = '')",
  )
  const byStatus: Record<string, number> = {}
  for (const r of rows) byStatus[`status:${r.status}`] = (byStatus[`status:${r.status}`] ?? 0) + 1
  return [{ key: 'activity_no_start', label: 'Activities with no start', items: rows, extra: byStatus }]
}

function endOrder(db: Database): Check[] {
  const base =
    "from activiteit where deleted_at is null and start_at is not null and start_at <> '' and eind_at is not null and eind_at <> ''"
  const sel = 'select id, status, datum, omschrijving, start_at, eind_at'
  return [
    {
      key: 'activity_end_before_start',
      label: 'Activities whose end is before start',
      items: all(db, `${sel} ${base} and eind_at < start_at`),
    },
    {
      key: 'activity_end_equals_start',
      label: 'Activities whose end equals start',
      items: all(db, `${sel} ${base} and eind_at = start_at`),
    },
  ]
}

type Slot = { id: number; datum: string; start: string | null; end: string; persoon: number }

function overlap(a: Slot, b: Slot) {
  if (a.start === null || b.start === null) return false
  return a.start === b.start || (a.start < b.end && b.start < a.end)
}

function overlaps(db: Database): Check[] {
  const marks = DONE_STATES.map((s) => `'${s}'`).join(',')
  const rows = all(
    db,
    `select t.id as toewijzing_id, t.persoon_id, a.id as activiteit_id, a.datum, a.start_at, a.eind_at
     from toewijzing t join activiteit a on a.id = t.activiteit_id
     where t.deleted_at is null and a.deleted_at is null and t.persoon_id is not null
       and t.state not in (${marks}) and a.status <> 'geannuleerd'`,
  )
  const byPerson = new Map<number, Row[]>()
  for (const r of rows) byPerson.set(r.persoon_id as number, [...(byPerson.get(r.persoon_id as number) ?? []), r])
  const timed: Item[] = []
  const untimed: Item[] = []
  const sameActivity: Item[] = []
  for (const [persoon, list] of byPerson) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [x, y] = [list[i] as Row, list[j] as Row]
        const pair = {
          persoon_id: persoon,
          toewijzing_a: x.toewijzing_id,
          toewijzing_b: y.toewijzing_id,
          activiteit_a: x.activiteit_id,
          activiteit_b: y.activiteit_id,
        }
        if (x.activiteit_id === y.activiteit_id) {
          sameActivity.push(pair)
          continue
        }
        const slot = (r: Row): Slot => {
          const start = (r.start_at as string) || null
          const eind = (r.eind_at as string) || ''
          return {
            id: r.activiteit_id as number,
            datum: r.datum as string,
            start,
            end: eind > (start ?? '') ? eind : (start ?? ''),
            persoon,
          }
        }
        const [a, b] = [slot(x), slot(y)]
        if (overlap(a, b))
          timed.push({
            ...pair,
            datum_a: a.datum,
            start_a: a.start,
            end_a: a.end,
            datum_b: b.datum,
            start_b: b.start,
            end_b: b.end,
          })
        else if (a.start === null && b.start === null && a.datum === b.datum) untimed.push({ ...pair, datum: a.datum })
      }
    }
  }
  const people = (items: Item[]) => new Set(items.map((i) => i.persoon_id)).size
  return [
    {
      key: 'overlap_timed',
      label: 'Overlapping assignments, same person (timed pairs)',
      items: timed,
      extra: { distinct_persons: people(timed) },
    },
    {
      key: 'overlap_same_day_no_time',
      label: 'Same person, same day, both activities untimed (pairs)',
      items: untimed,
      extra: { distinct_persons: people(untimed) },
    },
    {
      key: 'assignment_same_activity_twice',
      label: 'Same person assigned twice to one activity (pairs)',
      items: sameActivity,
      extra: { distinct_persons: people(sameActivity) },
    },
  ]
}

function noAssignments(db: Database): Check[] {
  const rows = all(
    db,
    `select p.id, p.weergavenaam, p.actief from persoon p where p.deleted_at is null
     and not exists (select 1 from toewijzing t where t.persoon_id = p.id and t.deleted_at is null)`,
  )
  const active = rows.filter((r) => r.actief).length
  return [
    {
      key: 'person_no_assignments',
      label: 'People with no assignments',
      items: rows,
      extra: { actief: active, inactief: rows.length - active },
    },
  ]
}

function groups(rows: Row[], keyOf: (r: Row) => string): Item[][] {
  const map = new Map<string, Row[]>()
  for (const r of rows) {
    const k = keyOf(r)
    if (k.replace(/\|/g, '').trim()) map.set(k, [...(map.get(k) ?? []), r])
  }
  return [...map.values()].filter((g) => g.length > 1)
}

function duplicates(db: Database): Check[] {
  const persons = all(db, 'select id, voornaam, achternaam, weergavenaam from persoon where deleted_at is null')
  const acts = all(
    db,
    "select id, datum, omschrijving, productie_id from activiteit where deleted_at is null and omschrijving is not null and trim(omschrijving) <> ''",
  )
  const check = (key: string, label: string, gs: Item[][]): Check => ({
    key,
    label,
    items: gs.flat(),
    extra: { groups: gs.length },
  })
  return [
    check(
      'person_dup_fullname',
      'Persons sharing a normalised full name (weergavenaam)',
      groups(persons, (r) => norm(r.weergavenaam)),
    ),
    check(
      'person_dup_first_last',
      'Persons sharing voornaam+achternaam (case-insensitive)',
      groups(persons, (r) => `${norm(r.voornaam)}|${norm(r.achternaam)}`),
    ),
    check(
      'activity_dup_title_same_day',
      'Activities with the same title on the same day',
      groups(acts, (r) => `${r.datum}|${norm(r.omschrijving)}`),
    ),
  ]
}

function whitespace(db: Database): Check[] {
  const checks: Check[] = []
  const tables = all(
    db,
    "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name",
  )
  for (const { name } of tables as { name: string }[]) {
    if (SKIP_TABLES.has(name)) continue
    const cols = (all(db, `pragma table_info("${name}")`) as { name: string; type: string }[]).filter((c) =>
      /char|text|clob/i.test(c.type),
    )
    for (const col of cols) {
      const rows = all(db, `select id, "${col.name}" as v from "${name}" where typeof("${col.name}") = 'text'`)
      for (const [kind, re] of Object.entries(WHITESPACE)) {
        const hits = rows.filter((r) => re.test(r.v as string)).map((r) => ({ id: r.id, value: r.v }))
        if (hits.length)
          checks.push({ key: `ws:${name}.${col.name}:${kind}`, label: `${name}.${col.name} ${kind}`, items: hits })
      }
    }
  }
  return checks
}

function extras(db: Database): Check[] {
  const q = (key: string, label: string, sql: string): Check => ({ key, label, items: all(db, sql) })
  return [
    q(
      'x_assignment_missing_activity',
      'EXTRA: assignments to a deleted or missing activity',
      `select t.id, t.activiteit_id from toewijzing t left join activiteit a on a.id = t.activiteit_id where t.deleted_at is null and (a.id is null or a.deleted_at is not null)`,
    ),
    q(
      'x_assignment_missing_person',
      'EXTRA: assignments to a deleted or missing person',
      `select t.id, t.persoon_id from toewijzing t left join persoon p on p.id = t.persoon_id where t.deleted_at is null and t.persoon_id is not null and (p.id is null or p.deleted_at is not null)`,
    ),
    q(
      'x_assignment_name_only',
      'EXTRA: assignments with no person link (free-text name only)',
      `select id, naam from toewijzing where deleted_at is null and persoon_id is null`,
    ),
    q(
      'x_end_without_start',
      'EXTRA: activities with eind_at but no start_at',
      `select id, eind_at from activiteit where deleted_at is null and (start_at is null or start_at = '') and eind_at is not null and eind_at <> ''`,
    ),
    q(
      'x_start_date_mismatch',
      'EXTRA: activities whose start date differs from datum',
      `select id, datum, start_at from activiteit where deleted_at is null and start_at is not null and start_at <> '' and substr(start_at, 1, 10) <> datum`,
    ),
    q(
      'x_plandag_mismatch',
      'EXTRA: activities whose plandag differs from datum',
      `select id, datum, plandag from activiteit where deleted_at is null and plandag <> datum`,
    ),
    q(
      'x_availability_end_not_after_start',
      'EXTRA: availability rows ending at or before start',
      `select id, start_at, eind_at from beschikbaarheid where deleted_at is null and eind_at <= start_at`,
    ),
    q(
      'x_activity_no_assignments',
      'EXTRA: activities with no assignments',
      `select a.id, a.status, a.datum from activiteit a where a.deleted_at is null and not exists (select 1 from toewijzing t where t.activiteit_id = a.id and t.deleted_at is null)`,
    ),
    q(
      'x_person_no_email',
      'EXTRA: persons with no email',
      `select id, weergavenaam from persoon where deleted_at is null and (email is null or trim(email) = '')`,
    ),
  ]
}

export function profile(dbPath: string): Check[] {
  const db = new Database(dbPath, { readonly: true })
  try {
    return [
      ...noStart(db),
      ...endOrder(db),
      ...overlaps(db),
      ...noAssignments(db),
      ...duplicates(db),
      ...whitespace(db),
      ...extras(db),
    ]
  } finally {
    db.close()
  }
}

export function counts(checks: Check[]) {
  return checks.map((c) => ({ key: c.key, label: c.label, count: c.items.length, ...c.extra }))
}

function line(c: ReturnType<typeof counts>[number]) {
  const { key: _k, label, count, ...extra } = c
  const more = Object.entries(extra).map(([k, v]) => `${k}=${v}`)
  return `${label}: ${count}${more.length ? ` (${more.join(', ')})` : ''}`
}

export function run(dbPath: string, outDir = join(homedir(), 'laika-export', 'shakeout')): string {
  const checks = profile(dbPath)
  const summary = counts(checks)
  mkdirSync(outDir, { recursive: true, mode: 0o700 })
  const detail = join(outDir, 'data-profile.detail.json')
  writeFileSync(
    detail,
    JSON.stringify(
      Object.fromEntries(
        checks.map((c) => [c.key, { label: c.label, count: c.items.length, ...c.extra, items: c.items }]),
      ),
      null,
      2,
    ),
    { mode: 0o600 },
  )
  chmodSync(detail, 0o600)
  const md = ['# Data profile', '', ...summary.map((c) => `- ${line(c)}`), '']
  writeFileSync(join(outDir, 'data-profile.md'), md.join('\n'), { mode: 0o600 })
  return summary.map(line).join('\n')
}

if (import.meta.main) {
  const path = process.argv[2]
  if (!path) {
    console.error('usage: bun scripts/shakeout/data-profile.ts <engine.db>')
    process.exit(2)
  }
  console.log(run(path))
}
