import { execFileSync } from 'node:child_process'
import type { Instance } from './auth'

/** Takes invented rows of a dataset no person or service may delete (studio's sites: 405) out of the database again, with their history. */
export function forget(at: Pick<Instance, 'db'>, dataset: string, ids: number[]): void {
  if (ids.length === 0) return
  const script = `import { Database } from 'bun:sqlite'
    const db = new Database(${JSON.stringify(at.db)})
    db.exec('PRAGMA busy_timeout = 5000')
    const ids = ${JSON.stringify(ids)}
    const marks = ids.map(() => '?').join(',')
    db.query(\`DELETE FROM revision WHERE entity = ? AND record_id IN (\${marks})\`).run(${JSON.stringify(dataset)}, ...ids)
    db.query(\`DELETE FROM ${dataset} WHERE id IN (\${marks})\`).run(...ids)`
  execFileSync('bun', ['-e', script])
}
