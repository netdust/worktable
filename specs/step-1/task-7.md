# Step 1, Task 7: commands for Stefan (real data, not run by Claude)

Run these from `~/Sites/worktable` on `feature/step-1`. They never touch `~/laika-export/engine.db` except to open it read-only, and they write nothing to the Laika planning database: value parity reads it with `SET SESSION TRANSACTION READ ONLY`. All output is counts only. Anything with names goes to `~/laika-export/shakeout/step1/` (mode 0600).

```bash
cd ~/Sites/worktable
mkdir -p ~/laika-export/shakeout/step1 && chmod 700 ~/laika-export/shakeout/step1
cp ~/laika-export/engine.db ~/laika-export/step1-copy.db && chmod 600 ~/laika-export/step1-copy.db

# 1. Before: counts on the live database, opened read-only
cat > /tmp/wt-counts.ts <<'TS'
import { Database } from 'bun:sqlite'
const db = new Database(process.argv[2], { readonly: true })
const one = (sql: string) => db.query(sql).get()
console.log('revision rows', one('SELECT count(*) n FROM revision'))
console.log('sqlite_sequence', db.query('SELECT name, seq FROM sqlite_sequence ORDER BY name').all())
console.log('largest batch', one('SELECT batch_id, count(*) n FROM revision GROUP BY batch_id ORDER BY n DESC LIMIT 1'))
const hasBatch = one("SELECT count(*) n FROM sqlite_master WHERE name = 'batch'") as { n: number }
if (hasBatch.n) console.log('batch rows for the import', one('SELECT count(*) n FROM batch WHERE key = (SELECT batch_id FROM revision GROUP BY batch_id ORDER BY count(*) DESC LIMIT 1)'))
TS
bun /tmp/wt-counts.ts ~/laika-export/engine.db > ~/laika-export/shakeout/step1/before.txt

# 2. Migrate the copy: rebuilds activiteit and creates batch, speelreeks, rol and sjabloon. Never pass --fresh.
bun packages/engine/src/serve.ts --domain @worktable/theatre --db ~/laika-export/step1-copy.db --create-admin <your admin email>
#    expected: the migration log, then "exists" (the account is already there); ~/laika-export/step1-copy.db.pre-migrate written

# 3. After: the same counts on the migrated copy
bun /tmp/wt-counts.ts ~/laika-export/step1-copy.db > ~/laika-export/shakeout/step1/after.txt
diff ~/laika-export/shakeout/step1/before.txt ~/laika-export/shakeout/step1/after.txt
#    expected: revision rows unchanged; sqlite_sequence unchanged for every existing table (new tables may appear);
#    the largest batch is still the import's 4,802 revisions; "batch rows for the import" is 0

# 4. Value parity on the migrated copy: expected 0 mismatches in every column
bun scripts/shakeout/value-parity.ts --engine ~/laika-export/step1-copy.db --out-dir ~/laika-export/shakeout/step1

# 5. Data profile on the migrated copy
bun scripts/shakeout/data-profile.ts ~/laika-export/step1-copy.db

# 6. Edit session on a copy of the copy (its own engine on port 4320; skips datasets with no rows)
cp ~/laika-export/step1-copy.db ~/laika-export/shakeout/step1/edit.db && chmod 600 ~/laika-export/shakeout/step1/edit.db
bun scripts/shakeout/edit-session.ts --db ~/laika-export/shakeout/step1/edit.db --outbox ~/laika-export/shakeout/step1/outbox --port 4320 --out ~/laika-export/shakeout/step1

# 7. Undo refuses the pre-table import batch: serve another copy on 4321, sign in, POST the undo
cp ~/laika-export/step1-copy.db ~/laika-export/shakeout/step1/undo.db && chmod 600 ~/laika-export/shakeout/step1/undo.db
mkdir -p ~/laika-export/shakeout/step1/undo-outbox
bun packages/engine/src/serve.ts --domain @worktable/theatre --db ~/laika-export/shakeout/step1/undo.db --port 4321 --outbox ~/laika-export/shakeout/step1/undo-outbox --app-url http://127.0.0.1:4321 &
ENGINE=$!; sleep 2
H=(-H 'content-type: application/json' -H 'host: 127.0.0.1:4321')
curl -s "${H[@]}" -X POST http://127.0.0.1:4321/api/auth/request -d '{"email":"<your admin email>"}'; sleep 1
TOKEN=$(grep -ho '#/auth/[A-Za-z0-9_-]*' ~/laika-export/shakeout/step1/undo-outbox/* | tail -1 | cut -d/ -f3)
curl -s -c /tmp/wt-jar "${H[@]}" -X POST http://127.0.0.1:4321/api/auth/consume -d "{\"token\":\"$TOKEN\"}" > /dev/null
IMPORT=$(bun -e 'import {Database} from "bun:sqlite"; const d=new Database(process.argv[1],{readonly:true}); console.log((d.query("SELECT batch_id FROM revision GROUP BY batch_id ORDER BY count(*) DESC LIMIT 1").get() as any).batch_id)' ~/laika-export/shakeout/step1/undo.db)
curl -s -b /tmp/wt-jar "${H[@]}" -X POST http://127.0.0.1:4321/api/batches/$IMPORT/undo -d '{}' -w ' %{http_code}\n'
#    expected: {"code":"not_undoable",…} 422
kill $ENGINE; rm -f /tmp/wt-jar
bun /tmp/wt-counts.ts ~/laika-export/shakeout/step1/undo.db | head -1
#    expected: the same revision row count as step 3
```

Report back the four results (value parity, data profile, edit session, findings by severity) and the migration result (steps 2, 3 and 7), as counts only.
