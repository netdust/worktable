import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'

interface Declared {
  datasets: { name: string; columns: Record<string, unknown> }[]
  queries: { name: string; columns: Record<string, unknown> }[]
}

const FIXED = [
  'activiteit',
  'toewijzing',
  'beschikbaarheid',
  'productie',
  'persoon',
  'organisatie',
  'voorstelling',
  'fiche',
  'speelreeks',
  'sjabloon',
]

const repo = resolve(import.meta.dir, '..')
const { values } = parseArgs({
  options: {
    root: { type: 'string', default: join(repo, 'packages', 'engine') },
    // A root's own generic words, beside the shared list: the grid's Dutch interface words stay out of the engine's.
    allow: { type: 'string' },
    // Tests and fixtures are skipped where they hold the invented domains on purpose (the grid's).
    'skip-tests': { type: 'boolean', default: false },
    domain: {
      type: 'string',
      multiple: true,
      default: ['@worktable/theatre', '@worktable/fiche', '@worktable/studio'],
    },
  },
})

const wordsOf = (text: string): string[] =>
  text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z]+/)

const listed = (file: string): string[] =>
  readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.replace(/#.*/, '').trim())
    .filter(Boolean)

function allowed(): Set<string> {
  return new Set([
    ...listed(join(import.meta.dir, 'vocabulary-allow.txt')),
    ...(values.allow ? listed(values.allow) : []),
  ])
}

const isTest = (name: string): boolean => /\.(test|fixture)[.-]/.test(name) || name === 'test-setup.ts'

// The spec's sources only: dataset, query and column names, split on `_`.
async function vocabulary(): Promise<Set<string>> {
  const words = new Set(FIXED)
  for (const name of values.domain ?? []) {
    const domain = (await import(Bun.resolveSync(name, process.cwd()))).default as Declared
    for (const source of [...domain.datasets, ...domain.queries])
      for (const id of [source.name, ...Object.keys(source.columns)]) for (const w of id.split('_')) words.add(w)
  }
  const allow = allowed()
  return new Set([...words].filter((w) => w.length > 2 && !allow.has(w)))
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || (values['skip-tests'] && isTest(name))) return []
    const path = join(dir, name)
    return statSync(path).isDirectory() ? filesUnder(path) : [path]
  })
}

const words = await vocabulary()
const root = values.root as string
const hits = filesUnder(root).flatMap((file) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .flatMap((line, i) =>
      [...new Set(wordsOf(line).filter((w) => words.has(w)))].map((w) => `${relative(repo, file)}:${i + 1}  ${w}`),
    ),
)

if (hits.length > 0) {
  console.error(`${relative(repo, root) || root} holds domain words:`)
  for (const hit of hits) console.error(`  ${hit}`)
  process.exit(1)
}
console.log(`vocabulary: ${relative(repo, root) || root} holds no domain word`)
