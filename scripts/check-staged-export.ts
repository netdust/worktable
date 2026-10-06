import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

const git = (...args: string[]) => {
  const r = Bun.spawnSync(['git', ...args])
  if (r.exitCode !== 0) throw new Error(r.stderr.toString())
  return r.stdout.toString()
}

const root = git('rev-parse', '--show-toplevel').trim()
const staged = git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z').split('\0').filter(Boolean)

const exempt = (file: string) => /(^|\/)test\/fixtures\//.test(file) && /^invented-.*\.json$/.test(basename(file))
const byName = (file: string) => /^laika-planning-export.*\.json$/.test(basename(file)) || file.endsWith('.report.json')

function hasExportKey(file: string): boolean {
  if (!file.endsWith('.json')) return false
  try {
    const parsed = JSON.parse(readFileSync(`${root}/${file}`, 'utf8'))
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) && 'worktable_export' in parsed
  } catch {
    return false
  }
}

const offenders = staged.filter((f) => !exempt(f) && (byName(f) || hasExportKey(f)))
if (offenders.length > 0) {
  console.error(
    `check-staged-export: personal data must not be committed:\n${offenders.map((f) => `  ${f}`).join('\n')}`,
  )
  process.exit(1)
}
console.log('check-staged-export: no staged export')
