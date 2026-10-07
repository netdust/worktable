import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Fails on any term from the export's name list in what is staged. The list lives outside the repo,
// on the owner's machine only; without it the check says so and passes.
const SCAN = process.env.WT_EXPORT_SCAN ?? join(homedir(), 'laika-export', 'scan')
const termsFile = join(SCAN, 'terms.json')
const allowFile = join(SCAN, 'allow.txt')

const git = (...args: string[]) => {
  const r = Bun.spawnSync(['git', ...args])
  if (r.exitCode !== 0) throw new Error(r.stderr.toString())
  return r.stdout.toString()
}

if (!existsSync(termsFile)) {
  console.log(`check-export-terms: no term list at ${termsFile}; skipped`)
  process.exit(0)
}

const allowed = new Set(
  existsSync(allowFile)
    ? readFileSync(allowFile, 'utf8')
        .split('\n')
        .map((line) => line.split('\t')[0].trim().toLowerCase())
        .filter(Boolean)
    : [],
)
const terms = (JSON.parse(readFileSync(termsFile, 'utf8')) as [string, string][])
  .filter(([term]) => !allowed.has(term.toLowerCase()))
  .map(([term, kind]) => ({
    kind,
    re: new RegExp(`(?<![\\p{L}\\d])${term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\d])`, 'u'),
  }))

const hits = new Map<string, Map<string, number>>()
const count = (file: string, text: string) => {
  const lower = text.toLowerCase()
  for (const { kind, re } of terms) {
    if (!re.test(lower)) continue
    const byKind = hits.get(file) ?? new Map<string, number>()
    byKind.set(kind, (byKind.get(kind) ?? 0) + 1)
    hits.set(file, byKind)
  }
}

let file = ''
for (const line of git('diff', '--cached', '-U0', '--no-color', '--no-ext-diff', '--text').split('\n')) {
  if (line.startsWith('+++ ')) {
    file = line.slice(4).replace(/^b\//, '')
    count(file, file)
  } else if (line.startsWith('+')) count(file, line.slice(1))
}

if (hits.size > 0) {
  const lines = [...hits].map(
    ([path, byKind]) => `  ${path}: ${[...byKind].map(([kind, n]) => `${kind} ${n}`).join(', ')}`,
  )
  console.error(
    `check-export-terms: staged lines hold names from the export (terms in ${termsFile}):\n${lines.join('\n')}`,
  )
  process.exit(1)
}
console.log('check-export-terms: no export term in the staged diff')
