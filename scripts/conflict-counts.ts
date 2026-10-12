import { Database } from 'bun:sqlite'
import { chmodSync, copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import theatre from '@worktable/theatre'
import { migrate } from '../packages/engine/src'

// Counts only: no names, ids or dates leave this script. The copy is migrated, never the file it was made from.
const LOGISTICS = "('maaltijd','overnachting','reis')"

const PAIRS = `
WITH t AS (
  SELECT tw.id, tw.persoon_id AS p, a.plandag AS d, a.start_at AS s, COALESCE(a.eind_at, a.start_at) AS e, a.soort AS k
  FROM toewijzing tw JOIN activiteit a ON a.id = tw.activiteit_id AND a.deleted_at IS NULL AND a.status != 'geannuleerd'
  WHERE tw.deleted_at IS NULL AND tw.persoon_id IS NOT NULL AND tw.state IN ('voorlopig','uitgenodigd','bevestigd'))
SELECT COUNT(*) AS pairs FROM t x JOIN t y ON x.p = y.p AND x.d = y.d AND x.id < y.id
WHERE x.k IN ${LOGISTICS} OR y.k IN ${LOGISTICS}`

const BY_TYPE = `
SELECT type, ernst, COUNT(*) AS rows, COUNT(DISTINCT persoon_id) AS people, COUNT(DISTINCT plandag) AS days
FROM conflicten GROUP BY type, ernst ORDER BY type, ernst`

function report(source: string): void {
  const dir = mkdtempSync(join(tmpdir(), 'wt-counts-'))
  try {
    const copy = join(dir, 'copy.db')
    copyFileSync(source, copy)
    chmodSync(copy, 0o600)
    const db = new Database(copy)
    migrate(db, theatre)
    console.log('type · ernst · rows · people · days')
    for (const r of db.query(BY_TYPE).all() as Record<string, unknown>[]) {
      console.log(`${r.type} · ${r.ernst} · ${r.rows} · ${r.people} · ${r.days}`)
    }
    console.log(`same-day pairs left out as logistics: ${(db.query(PAIRS).get() as { pairs: number }).pairs}`)
    db.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const [source] = process.argv.slice(2)
if (!source) {
  console.error('usage: bun scripts/conflict-counts.ts <db>')
  process.exit(2)
}
report(source)
