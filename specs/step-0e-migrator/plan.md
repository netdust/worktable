# Step 0e U1: the table-rebuild migrator, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A changed dataset declaration migrates the existing database: new nullable or defaulted columns by `ALTER TABLE … ADD COLUMN`, everything else by SQLite's table rebuild. Changes that would lose data are refused before anything is touched. Every row and every Revision row survives.

**Architecture:**
- `migrate()` keeps its per-source hash ledger. When a dataset's hash differs, a new `planChange()` compares the declaration with the stored table (`PRAGMA table_info`, `foreign_key_list`, `index_list`) and returns `alter`, `rebuild` or a refusal. `applyChange()` runs it.
- The whole migration runs with `PRAGMA foreign_keys = OFF`, set outside the transaction because SQLite ignores it inside one. It runs in one transaction, with `PRAGMA foreign_key_check` before commit, and foreign keys back ON after.
- Query views are dropped before any change and recreated after.
- First working version: Task 1. `bun packages/engine/src/serve.ts` starts on a database made before a theatre declaration change, and the new column is there (`sqlite3 … '.schema'`).

**Tech Stack:** Bun 1.3 (`bun:sqlite`), TypeScript, `bun test`.

**Spec:** `specs/step-0e/spec.md`, U1 (parent: `docs/SPEC.md`, Storage row: "the table-rebuild migrator (ALTER and SQLite's table rebuild) exists before the first real import").

**Branch:** `feature/step-0e-migrator`, from `main`. It merges before the other 0e worktable plans branch: Stefan's entry condition.

**Simplest design:** Always rebuild on any change, with no ALTER path. It is one code path and is correct for every case, but it copies the whole table for the commonest change (adding a nullable column, which the import plan does to six datasets). The ALTER path costs one branch in `planChange()`, so the plan keeps both. A per-version migration file system (Drizzle Kit, numbered SQL) is rejected: datasets are declarations and the DDL is generated from them, so the diff is computed, never hand-written.

## Decisions
- **Refused before anything is touched** (each a `MigrationError` naming dataset and column), per the spec:
  - a new NOT NULL column without a default on a non-empty table;
  - a type change on a non-empty table that is not lossless. Lossless means `integer`→`real`, any type→`text`, or between types that share a SQLite storage class (`date`/`datetime`/`json`/`text`; `boolean`/`integer`);
  - nullable→NOT NULL while a stored row holds NULL in that column.
- **Dropping a column** is a rebuild, not a refusal (the spec: "a dropped or retyped column" is rebuilt). A declaration is code and its removal is deliberate.
- **`sqlite_sequence` is carried across a rebuild**, so ids never repeat.
- **The Revision table is never rebuilt by a domain change.** A change to an engine table (`saved_view`, `revision`) goes through the same planner.
- **The ledger hash stays the trigger.** A source whose hash is unchanged is never inspected.

## Global Constraints
- `packages/engine` holds no domain word and imports no domain package (`bun run check`).
- Every migration step is inside one transaction. A refusal or failure leaves the file byte-for-byte as it was. Test this with a file database, not `:memory:` alone: `bun-sqlite-no-rollback` (edge class 6).
- `docs/SPEC.md` is never committed by this plan; the diff is proposed at the end of 0e.
- Each task logs its start and end time in the Time log.

## Threat model
Not a security surface: no new route or input. The asset is data integrity, covered by the Review Focus.

## Test map

| Unit | Seam | Tests: tier · file · command | E2E flows |
|---|---|---|---|
| Change planner and applier | `migrate(sqlite, domain)` | integration · `packages/engine/test/migrate.test.ts` · `bun test packages/engine` | none — no UI |
| Populated rebuild (entry condition) | `migrate()` on a database written through the routes | integration · `packages/engine/test/rebuild.test.ts` · `bun test packages/engine` | none |
| Theatre migrates in place | `serve.ts` without `--fresh` on an older theatre database | integration · `packages/theatre/test/migrate.test.ts` · `bun test packages/theatre` | existing 0a–0d flows stay green |

## Review Focus
1. A refused change leaves the file untouched (edge 6): the refusal tests compare the file's bytes before and after.
2. Ids and `sqlite_sequence` survive a rebuild, so a row created after it never reuses an id (edge 5): `rebuild.test.ts`.
3. A rebuilt table's foreign keys hold, both the ones it declares and the ones pointing at it from other tables: `foreign_key_check` empty, and a write through the route after the migration still refuses a missing relation.
4. Query views work after a rebuild of a table they read: `GET /rows/<query>` returns the same rows.
5. An empty database (first run) still takes the plain create path: the existing migrate tests stay green.

## Time log

| Task | Start | End |
|---|---|---|

---

### Task 1: The planner and the two change paths

**Files:**
- Create: `packages/engine/src/schema-diff.ts` (`planChange`, `applyChange`)
- Modify: `packages/engine/src/migrate.ts` (the changed-dataset branch calls them; foreign keys off around the transaction; views dropped first, recreated last)
- Test: `packages/engine/test/migrate.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type Change =
    | { kind: 'alter'; add: string[]; dropIndexes: string[]; createIndexes: string[] }  // DDL statements
    | { kind: 'rebuild' }
  function planChange(sqlite: Database, decl: DatasetDecl): Change        // throws MigrationError(source, message)
  function applyChange(sqlite: Database, decl: DatasetDecl, change: Change): void
  ```
  - The `alter` kind applies when every stored column is still declared with the same type, nullability, default and relation, and every new column is nullable or has a default. An index-only change is also `alter`.
  - `rebuild` runs SQLite's documented order:
    1. `CREATE TABLE new_<t>` from `datasetDdl`;
    2. `INSERT INTO new_<t> (kept) SELECT kept FROM <t>`;
    3. `DROP TABLE <t>`;
    4. `ALTER TABLE new_<t> RENAME TO <t>`;
    5. the declared indexes;
    6. restore the `sqlite_sequence` row.
  - `MigrationError` gains the column: the message is `dataset "<d>" column "<c>": <reason>`.

- [ ] **Step 1: Tests first.** Each test migrates a file database (in a temp dir) seeded under declaration A, then runs under declaration B:
  - a new nullable column → `alter`; rows unchanged and the column is NULL;
  - a new column with a default → the default is filled in;
  - a new index → it exists;
  - a relation added to an existing column → `rebuild`; rows and ids unchanged; `foreign_key_check` empty;
  - a dropped column → rebuilt without it;
  - `integer`→`text` → rebuilt, and values read back as text;
  - each refusal named in Decisions → `MigrationError` naming the dataset and column, with the file's bytes identical before and after;
  - a query reading the rebuilt table returns the same rows.

  Run `bun test packages/engine/test/migrate.test.ts` → FAIL.
- [ ] **Step 2: Implement** `planChange`/`applyChange` and the `migrate()` changes.
- [ ] **Step 3: Run** `bun test packages` and `bun run check` → PASS.
- [ ] **Step 4: Commit.** `feat(engine): migrate a changed dataset by ALTER or table rebuild`.

### Task 2: The entry-condition test: a populated database rebuilt

**Files:**
- Create: `packages/engine/test/rebuild.test.ts`, `packages/theatre/test/migrate.test.ts`

**Interfaces:**
- Consumes: `migrate`, `createEngine`, `send` from `packages/engine/test/fixture.ts`.

- [ ] **Step 1: Write `rebuild.test.ts`.**
  - **Setup:** migrate and seed the engine fixture domain into a temp file. Then, through `createEngine` and `send`, create, update and soft-delete rows in at least two datasets, so Revision holds rows from several batches.
  - **Snapshot:** take every table's `SELECT * ORDER BY id`, the `revision` table, and `sqlite_sequence`.
  - **Migrate:** use a declaration where one dataset gains a relation on an existing column, which forces a rebuild, and one dataset gains a nullable column, which takes the ALTER path.
  - **Assert:**
    - every table equals its snapshot, ignoring only the new column;
    - `revision` is identical;
    - `sqlite_sequence` is identical;
    - `PRAGMA foreign_key_check` is empty and `PRAGMA foreign_keys` is 1 again;
    - a POST through the route afterwards gets an id above every earlier one;
    - a PATCH to a missing relation is still 4xx.
- [ ] **Step 2: Write `packages/theatre/test/migrate.test.ts`.**
  - **Setup:** migrate and seed theatre under its current declarations. Then add `legacy_post_id` (integer, nullable, readonly) to every theatre dataset in a test-local copy of the declarations.
  - **Assert:** migration takes the `alter` path; every row survives; `GET /api/rows/voorstellingen` returns the same rows as before.
- [ ] **Step 3: Run** `bun test packages`, `bun run check`, then `rm -rf e2e/.tmp && bun run gate` → PASS. Quote the counts.
- [ ] **Step 4: Commit.** `test(engine): a populated database survives a rebuild with every row and revision`.

### Task 3: Remove the "not built yet" path and record the spec diff
**Files:**
- Modify: `packages/engine/src/migrate.ts`, `packages/engine/src/serve.ts` (the startup error names the dataset and column on a refusal and exits 1), `specs/step-0e/spec-diff.md` (create: the proposed `docs/SPEC.md` lines for the migrator)

- [ ] **Step 1: Test.** In `migrate.test.ts`, a refusal raised through `serve.ts` (spawned with `Bun.spawn`) exits 1, and its stderr names the dataset and column.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the gate.
- [ ] **Step 4: Commit.** `feat(engine): a refused migration names its column and stops startup`.
