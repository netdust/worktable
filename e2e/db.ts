import { execFileSync } from 'node:child_process'
import { THEATRE } from './auth'

/** One write to the e2e database: the clock moved past a token's end is a write the running engine reads on its next request. */
export function writeDb(sql: string, ...params: (string | number)[]): number {
  const script = `import { Database } from 'bun:sqlite'
    const db = new Database(${JSON.stringify(THEATRE.db)})
    db.exec('PRAGMA busy_timeout = 5000')
    db.query(${JSON.stringify(sql)}).run(...${JSON.stringify(params)})
    console.log(JSON.stringify(String(db.query('SELECT changes() AS n').get().n)))`
  return Number(JSON.parse(execFileSync('bun', ['-e', script]).toString().trim()))
}
