import { basename } from 'node:path'

// Scans the whole index, committed and staged alike, reading each blob from it rather than the working copy.
// .gitignore is case-sensitive; this check is the case-insensitive guard.
const git = (...args: string[]) => {
  const r = Bun.spawnSync(['git', ...args])
  if (r.exitCode !== 0) throw new Error(r.stderr.toString())
  return r.stdout.toString()
}

const MARKER = '"worktable_export"'
const SOURCE_OR_DOCS = /\.(ts|tsx|js|mjs|cjs|md|css|html|lock)$/
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

const indexed = git('ls-files', '-z').split('\0').filter(Boolean)
const blob = (file: string) => git('show', `:${file}`).replace(/^﻿/, '')

const byName = (file: string) => {
  const name = basename(file).toLowerCase()
  return /^laika-planning-export.*\.json$/.test(name) || name.endsWith('.report.json')
}
const fixturePath = (file: string) =>
  /(^|\/)test\/fixtures\//.test(file) && /^invented-.*\.json$/.test(basename(file).toLowerCase())

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// An invented fixture proves itself by content: an invented source and only example.test addresses.
function invented(text: string, parsed: Record<string, unknown>): boolean {
  if (typeof parsed.source !== 'string' || !parsed.source.startsWith('invented')) return false
  return (text.match(EMAIL) ?? []).every((address) => address.endsWith('@example.test'))
}

// Answers why a file is refused, or null when it may be committed.
function offence(file: string): string | null {
  const lower = file.toLowerCase()
  if (byName(file)) return 'by its name'
  if (SOURCE_OR_DOCS.test(lower)) return null
  const text = blob(file)
  if (text.includes('\0')) return null
  if (!lower.endsWith('.json')) return text.includes(MARKER) ? 'holds an export' : null
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return 'cannot be read as JSON'
  }
  if (!isObject(parsed) || !('worktable_export' in parsed)) return null
  return fixturePath(file) && invented(text, parsed) ? null : 'holds an export'
}

const offenders = indexed.flatMap((file) => {
  const why = offence(file)
  return why === null ? [] : [why === 'cannot be read as JSON' ? `  ${file} (${why})` : `  ${file}`]
})
if (offenders.length > 0) {
  console.error(`check-staged-export: personal data must not be committed:\n${offenders.join('\n')}`)
  process.exit(1)
}
console.log('check-staged-export: no export in the index')
