import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// A registered check that runs no test is an incident (CHECKS.md). Playwright's own --list is the
// source of tests, so template titles resolve; the grep is matched the way Playwright matches it
// (without the g flag, which only makes test() stateful).
const ROOT = join(import.meta.dir, '..')
const TEST_DIR = 'e2e'
const ENTRY = /`bunx playwright test (\S+) --grep "(.*)"`/

type Spec = { title: string; tags?: string[] }
type Suite = { title: string; file?: string; specs?: Spec[]; suites?: Suite[] }
type Listing = { suites: Suite[] }

function playwrightList(): Listing {
  const r = Bun.spawnSync(['bunx', 'playwright', 'test', '--list', '--reporter=json'], { cwd: ROOT })
  if (r.exitCode !== 0) throw new Error(r.stderr.toString())
  return JSON.parse(r.stdout.toString())
}

// What Playwright greps: project name, file, describes, title, tags, joined by spaces.
function greppable(suite: Suite, path: string[]): string[] {
  const here = [...path, suite.title]
  const own = (suite.specs ?? []).map((s) => [...here, s.title, ...(s.tags ?? []).map((t) => `@${t}`)].join(' '))
  return [...own, ...(suite.suites ?? []).flatMap((child) => greppable(child, here))]
}

const forceRegExp = (pattern: string) => {
  const literal = pattern.match(/^\/(.*)\/([gi]*)$/)
  return literal ? new RegExp(literal[1], literal[2].replace('g', '')) : new RegExp(pattern, 'i')
}

const [registry = join(ROOT, 'specs/CHECKS.md'), listFile] = process.argv.slice(2)
const listing: Listing = listFile ? JSON.parse(readFileSync(listFile, 'utf8')) : playwrightList()
const titles = new Map(listing.suites.map((file) => [`${TEST_DIR}/${file.title}`, greppable(file, [''])]))

const runsATest = (file: string, grep: string) => {
  const re = forceRegExp(grep)
  return (titles.get(file) ?? []).some((title) => re.test(title))
}

const offenders = readFileSync(registry, 'utf8')
  .split('\n')
  .filter((line) => line.startsWith('|') && line.includes('bunx playwright'))
  .flatMap((line) => {
    const entry = line.match(ENTRY)
    if (!entry) return [`  ${line.trim()} (cannot be read)`]
    const [, file, grep] = entry
    return runsATest(file, grep) ? [] : [`  ${file} --grep "${grep}"`]
  })

if (offenders.length > 0) {
  console.error(`check-checks: a registered check runs no test:\n${offenders.join('\n')}`)
  process.exit(1)
}
console.log('check-checks: every registered check runs a test')
