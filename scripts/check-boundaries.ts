import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

const root = resolve(import.meta.dir, '..')
const engine = join(root, 'packages', 'engine')
const domains = ['theatre', 'fiche', 'studio']
const domainDirs = domains.map((name) => join(root, 'packages', name))
const sourceFile = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/
const specifier =
  /(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules') return []
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return filesUnder(path)
    return sourceFile.test(name) ? [path] : []
  })
}

function crossesIntoDomain(file: string, spec: string): boolean {
  if (domains.some((name) => spec === `@worktable/${name}` || spec.startsWith(`@worktable/${name}/`))) return true
  if (!spec.startsWith('.')) return false
  const target = resolve(dirname(file), spec)
  return domainDirs.some((dir) => target === dir || target.startsWith(dir + sep))
}

const violations = filesUnder(engine).flatMap((file) =>
  [...readFileSync(file, 'utf8').matchAll(specifier)]
    .map((match) => match.slice(1).find(Boolean) ?? '')
    .filter((spec) => crossesIntoDomain(file, spec))
    .map((spec) => `${relative(root, file)} imports ${spec}`),
)

if (violations.length > 0) {
  console.error('packages/engine must not import a domain package:')
  for (const line of violations) console.error(`  ${line}`)
  process.exit(1)
}
console.log('boundaries: packages/engine imports no domain package')
