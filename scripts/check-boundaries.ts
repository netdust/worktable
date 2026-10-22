import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

const root = resolve(import.meta.dir, '..')
const engine = join(root, 'packages', 'engine')
const mcp = join(root, 'packages', 'mcp')
const domains = ['theatre', 'fiche']
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

// The MCP server reaches an instance over REST only, so it imports no worktable code outside its own package.
function leavesMcp(file: string, spec: string): boolean {
  if (spec.startsWith('@worktable/')) return true
  if (!spec.startsWith('.')) return false
  const target = resolve(dirname(file), spec)
  return target !== mcp && !target.startsWith(mcp + sep)
}

function violationsIn(dir: string, crosses: (file: string, spec: string) => boolean): string[] {
  return filesUnder(dir).flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(specifier)]
      .map((match) => match.slice(1).find(Boolean) ?? '')
      .filter((spec) => crosses(file, spec))
      .map((spec) => `${relative(root, file)} imports ${spec}`),
  )
}

const violations = violationsIn(engine, crossesIntoDomain)

if (violations.length > 0) {
  console.error('packages/engine must not import a domain package:')
  for (const line of violations) console.error(`  ${line}`)
  process.exit(1)
}
console.log('boundaries: packages/engine imports no domain package')

const mcpViolations = violationsIn(join(mcp, 'src'), leavesMcp)

if (mcpViolations.length > 0) {
  console.error('packages/mcp/src must not import a worktable package:')
  for (const line of mcpViolations) console.error(`  ${line}`)
  process.exit(1)
}
console.log('boundaries: packages/mcp/src imports no worktable package')
