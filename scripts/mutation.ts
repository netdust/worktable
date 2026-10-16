import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { calculateMutationTestMetrics } from 'mutation-testing-metrics'
import type { MutantResult, MutationTestResult } from 'mutation-testing-report-schema'

type Module = { pkg: 'apps/grid' | 'packages/engine'; file: string }
type Run = { module: Module; seconds: number; report: MutationTestResult }

const MODULES: Module[] = [
  { pkg: 'apps/grid', file: 'src/grid/store.ts' },
  { pkg: 'apps/grid', file: 'src/grid/group.ts' },
  { pkg: 'apps/grid', file: 'src/grid/columns.ts' },
  { pkg: 'apps/grid', file: 'src/board/rank.ts' },
  { pkg: 'apps/grid', file: 'src/board/drop.ts' },
  { pkg: 'packages/engine', file: 'src/filter-compile.ts' },
  { pkg: 'packages/engine', file: 'src/filter.ts' },
  { pkg: 'packages/engine', file: 'src/validate.ts' },
]
const UNDETECTED = new Set(['Survived', 'NoCoverage'])

const root = join(import.meta.dir, '..')
const out = join(root, 'reports/mutation')
// patches/ joins test names with ' > ': vitest-runner 10.0.0 joins them with ' ', which Vitest 5's testNamePattern never matches, so every mutant ran no test.
const stryker = join(root, 'node_modules/.bin/stryker')

const path = (m: Module) => `${m.pkg}/${m.file}`
const slug = (m: Module) =>
  path(m)
    .replace(/\.ts$/, '')
    .replace(/^(apps|packages)\//, '')
    .replaceAll('/', '-')

// The command runner reports no tests, so Stryker's incremental mode cannot see an engine test change: a changed test tree forces the module.
function testsHash(m: Module): string | undefined {
  if (m.pkg !== 'packages/engine') return undefined
  const dir = join(root, m.pkg, 'test')
  const hash = createHash('sha256')
  for (const file of [...new Bun.Glob('**/*').scanSync({ cwd: dir })].sort()) {
    hash.update(file).update(readFileSync(join(dir, file)))
  }
  return hash.digest('hex')
}

function run(m: Module): void {
  const cwd = join(root, m.pkg)
  const hash = testsHash(m)
  const stamp = join(out, `${slug(m)}.tests.sha`)
  const force = hash !== undefined && (!existsSync(stamp) || readFileSync(stamp, 'utf8') !== hash)
  const incremental = relative(cwd, join(out, `${slug(m)}.incremental.json`))
  const args = ['run', '--mutate', m.file, '--incrementalFile', incremental, ...(force ? ['--force'] : [])]
  const started = performance.now()
  const proc = Bun.spawnSync([stryker, ...args], { cwd, stdout: 'inherit', stderr: 'inherit' })
  if (proc.exitCode !== 0) throw new Error(`stryker failed on ${path(m)} (exit ${proc.exitCode})`)
  writeFileSync(join(out, `${slug(m)}.seconds`), String((performance.now() - started) / 1000))
  renameSync(join(out, `${m.pkg.split('/')[1]}.last.json`), join(out, `${slug(m)}.json`))
  if (hash !== undefined) writeFileSync(stamp, hash)
}

// The summary reads every module's last report, so a run split over several sittings still makes one summary.
function load(m: Module): Run[] {
  const [report, seconds] = [join(out, `${slug(m)}.json`), join(out, `${slug(m)}.seconds`)]
  if (!existsSync(report) || !existsSync(seconds)) return []
  return [
    { module: m, seconds: Number(readFileSync(seconds, 'utf8')), report: JSON.parse(readFileSync(report, 'utf8')) },
  ]
}

const minutes = (s: number) => `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`
const snippet = (text = '') => text.replace(/\s+/g, ' ').slice(0, 70)

function undetected(r: Run): string[] {
  const mutants = Object.values(r.report.files).flatMap((f) => f.mutants)
  return mutants
    .filter((x: MutantResult) => UNDETECTED.has(x.status))
    .sort((a, b) => a.location.start.line - b.location.start.line || a.location.start.column - b.location.start.column)
    .map((x) => {
      const tags = [x.status === 'NoCoverage' ? 'no coverage' : '', x.static ? 'static' : ''].filter(Boolean)
      const tail = tags.length ? ` (${tags.join(', ')})` : ''
      return `- \`${path(r.module)}:${x.location.start.line}\` ${x.mutatorName} → \`${snippet(x.replacement)}\`${tail}`
    })
}

function summary(runs: Run[]): string {
  const rows = runs.map((r) => {
    const m = calculateMutationTestMetrics(r.report).systemUnderTestMetrics.metrics
    const cells = [m.mutationScore.toFixed(1), m.killed, m.timeout, m.survived, m.noCoverage, m.totalMutants]
    return `| \`${path(r.module)}\` | ${cells.join(' | ')} | ${minutes(r.seconds)} |`
  })
  const head = '| Module | Score % | Killed | Timeout | Survived | No coverage | Mutants | Wall-clock |'
  const table = [
    head,
    '|---|---|---|---|---|---|---|---|',
    ...rows,
    `| Total | | | | | | | ${minutes(runs.reduce((sum, r) => sum + r.seconds, 0))} |`,
  ]
  const lists = runs.flatMap((r) => [
    '',
    `### \`${path(r.module)}\``,
    '',
    ...(undetected(r).length ? undetected(r) : ['None.']),
  ])
  return [...table, '', '## Undetected mutants', ...lists, ''].join('\n')
}

const only = process.argv.slice(2)
const chosen = only.length ? MODULES.filter((m) => only.some((name) => path(m).endsWith(name))) : MODULES
if (!chosen.length) throw new Error(`no module matches ${only.join(', ')}`)
mkdirSync(out, { recursive: true })
for (const m of chosen) run(m)
writeFileSync(join(out, 'summary.md'), summary(MODULES.flatMap(load)))
console.log(`Summary: ${relative(root, join(out, 'summary.md'))}`)
