import { basename } from 'node:path'

// Known limit: a renamed copy that does not end in .json is not inspected.
// .gitignore is case-sensitive; this check is the case-insensitive guard.
const git = (...args: string[]) => {
  const r = Bun.spawnSync(['git', ...args])
  if (r.exitCode !== 0) throw new Error(r.stderr.toString())
  return r.stdout.toString()
}

const staged = git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z').split('\0').filter(Boolean)

const exempt = (file: string) =>
  /(^|\/)test\/fixtures\//.test(file) && /^invented-.*\.json$/.test(basename(file).toLowerCase())
const byName = (file: string) => {
  const name = basename(file).toLowerCase()
  return /^laika-planning-export.*\.json$/.test(name) || name.endsWith('.report.json')
}

function hasExportKey(file: string): boolean {
  if (!file.toLowerCase().endsWith('.json')) return false
  try {
    const parsed = JSON.parse(git('show', `:${file}`).replace(/^﻿/, ''))
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) && 'worktable_export' in parsed
  } catch {
    return true
  }
}

const offenders = staged.filter((f) => !exempt(f) && (byName(f) || hasExportKey(f)))
if (offenders.length > 0) {
  console.error(
    `check-staged-export: personal data must not be committed (or the file cannot be read as JSON):\n${offenders.map((f) => `  ${f}`).join('\n')}`,
  )
  process.exit(1)
}
console.log('check-staged-export: no staged export')
