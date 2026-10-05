# Plan review: step 0b, writes
Reviewed-plan: 6778399b3ad79961a174e9a1ce3ce765c2411172 specs/step-0b/plan.md
Verdict: ready with fixes

Nothing is Blocking. Every premise I opened holds in the source, with one exception: the store-API signature in Task 4 collides with an argument the store already passes (S1). Every spec requirement R1–R13 has a task, and every threat-model mitigation has a test row. The fixes below are needed before this goes to Stefan. Two of them (S3, S4) would make the gate fail or prove the wrong thing.

## Blocking
None.

## Should fix

**S1. Task 4 Files and Interfaces: `update(model, id, data, row?)` collides with the existing 4th argument.**
- `apps/grid/src/grid/store.ts:23` already declares `update: (model, id, data, table?: string)`.
- `store.ts:156` calls `api.update(model, change.id, data, table)`.
- `grid/hooks.ts:32` passes `api.update` straight in as the store's api.
- So with the planned signature the store hands the `table` string over as `row`. Typecheck (strict function types) would reject it, or the routing breaks.
- The premise itself holds. `send(change, row)` already has the state row (`store.ts:154-156`), and an undo goes through `commit()`, which finds the row by `entry.id` in `state.rows` (`store.ts:131-132`). So the store can carry `row[key]`.
- **Smallest change:** drop the unused `table` argument and put `row` in its place. That also pays ledger row 45, "writes name the PHP table" (`wp-assumptions.md:57`). Otherwise write the signature out as `(model, id, data, table?, row?)`.

**S2. Task 4: undo routing contradicts R11 and has no test.**
- R11 says "the returned row and every undo entry refer to that target record". `docs/SPEC.md:209` says "The returned row and the undo key refer to the target record, not the grid row."
- The plan keeps undo entries keyed on the query row's id (`store.ts:263` `Entry{id: change.id}`) and returns the re-read query row as `saved`.
- What the re-read does to store state:
  - `confirmed.set(saved.id, saved)` and `patch(change.id, () => saved)` (`store.ts:146,153`) replace the row whole. That is fine while the query row's id is stable. In `dagplanning`, `id = a.id`, so it is stable there.
  - If a re-read row comes back with a different id (a grouped query such as the fixture's `per_project` `MIN(id)`), `confirmed`, `latest`, `pending` and the undo entry end up keyed on two different ids. A later undo then finds no row (`commit` returns false) and is silently dropped.
  - If the re-read finds no row (the edit moved it out of the query) or the re-read GET fails, the plan does not say what `update` returns. On a failed GET, the store reverts the cell and shows an error even though the write landed.
- The per-record write queue (`store.ts:140`, ledger row 47) is also keyed on the grid row, not on the target record.
- **Smallest change:**
  - State in Task 4 that undo resolves its target through the row at undo time (or key entries by `{dataset, row[key]}`), and record this as the reading of R11.
  - State what `update` returns when the re-read finds no row or fails.
  - Add one test to `store.test.ts` or `api.test.ts`: an undo of a `dagplanning` edit PATCHes `/rows/activiteit/<row[key]>`, with a fixture where `id ≠ key`.

**S3. Test map E2E flows: status-persists and day-line-move use rows the Planning view hides.**
- The seeded Planning view filters `status: 'bevestigd'` on the server (`packages/theatre/src/seed.ts`, the views block).
- status-persists: changing a status in Planning and reloading drops the row, because only `optie`/`geannuleerd` are left to change to.
- day-line-move: "a row from `2026-10-14T10:00`". The only seed row at that time is productie 2's repetitie, which has status `optie`, so Planning does not show it.
- revisions-recorded says "after the edits above", which contradicts "each flow uses its own activiteit row so order does not matter".
- **Smallest change:** name the row and view state for each flow (remove the Status chip first, or pick a `bevestigd` row such as `2026-10-12T14:00` repetitie Gent for the move). Have revisions-recorded make its own edit.

**S4. Task 2 `runWrite`: what Revision rows a write produces is undefined.**
- R7 says "one row per field whose stored value changed". The plan sets `updated_at` on every write and then diffs "stored vs current".
- That writes an `updated_at` revision on every write. It breaks the planned test "an update that changes nothing writes no revision" and contradicts e2e revisions-recorded ("status; start_at and plandag").
- For a create, "each stored field" leaves open whether `id`, `created_at` and `updated_at` are included.
- **Smallest change:** state that the diff covers declared columns plus `deleted_at` only, and that a no-change update writes nothing (and does not bump `updated_at`, or bumps it without a revision row).

**S5. Task 2: a create missing a required column ends in a 500.**
- `ddl.ts:20` makes undeclared-nullable columns `NOT NULL`. `checkValues()` only checks the values that were sent.
- A POST without `start_at` (so no `plandag`) or without `soort` fails at INSERT and answers `500 internal`, not a 400. R4's "nullability" check reads as covering this.
- **Smallest change:** after the writer returns on create, check that every non-nullable, no-default declared column is present (400 `bad_value` naming it). Add that test to the Step 1 denials.

**S6. Task 4: a writable query enables "+ New".**
- `ui/App.tsx:148` gates "+ New" on `writable` alone. A query with a mapped column becomes `writable`, so "+ New" on Dagplanning POSTs `/rows/dagplanning`. The engine answers 404 or 405, and the user sees an error.
- **Smallest change:** keep add blocked for `kind: 'query'` sources, and add one line to `App.test.tsx` covering it.

**S7. Task 4 Files: how the dev server gets its origin is a non-decision.**
- The plan says "`apps/grid/package.json` (`dev` passes nothing; root `dev` script optional — no)" and "document `--origin` in the dev script".
- R9 says "The grid's dev and e2e servers pass theirs." There is no root `dev` script (`package.json`), and the engine is started by hand. With the plan as written, every edit in `bun dev` is 403 unless the developer knows to add the flag.
- **Smallest change:** name one place, for example a root `engine` script with `--origin http://127.0.0.1:5173`, or a line in the README the plan names.

**S8. Review Focus 1 points the Vite-proxy attack at an engine test that never goes through the proxy.**
- `write-guard.test.ts` uses `app.request`. The proxy premise holds: Vite's `changeOrigin` only rewrites Host (`vite/dist/node/chunks/node.js:18792`), and Origin is forwarded as-is. But only Task 4 Step 4's manual curl exercises it.
- Vite's default CORS (`node.js:804`, `24986`, `preflightContinue: false` at `13688`) answers preflights itself, with ACAO, for any `localhost`/`127.0.0.1` origin on any port.
- So attack 1's claim "forces a preflight the engine never answers" does not hold behind Vite for a page on another local port. The engine's Origin check is the only guard there.
- **Smallest change:** correct that sentence in the threat model. Add one e2e assertion: `page.request.patch` through `:5174` with `Origin: http://localhost:3999` and a JSON body → 403 `forbidden_origin`. That makes attack 2 a real row.

## Note
- **N1. Simpler design the plan did not consider.** Checking `Sec-Fetch-Site` (allow `same-origin` and absent; refuse `same-site`/`cross-site`) needs no `--origin` flag, no Playwright config change and no dev-script question (S7). Through the proxy, the grid's own fetch is `same-origin`, and a page on another local port is `same-site`, which is refused. The JSON content-type rule stays either way. The Simplest-design paragraph only rejects a straw man (a generic PATCH). It should either weigh this alternative or say why an Origin list is preferred.
- **N2. Task 4 Interfaces puts an engine change in a grid task.** The `/schema` `writable` flag is described as "a one-line engine change, tested in `rows.test.ts`". It belongs in Task 2 next to `writableOf()`, so Task 4 stays grid-only.
- **N3. "Title readonly" is ambiguous.**
  - `engine.ts:72` hardcodes `title_readonly: true`. R12 needs it to become false for a writable dataset whose title column is not readonly.
  - Task 4 lists "title readonly" without a direction. It should spell out `title_readonly = !writable || column.readonly || (query && !column.writes)`.
  - `engine.test.ts:77` (`nothing writable`) will change; that is expected.
- **N4. DELETE content type.** R9 requires JSON on every write route. The grid's `remove()` sends no body and therefore no Content-Type (`api.ts:28-29`), so a DELETE would be 415. Only `matrix/store.ts:214` calls it, and the matrix is out of scope. Either add one guard test for a body-less DELETE or exempt DELETE explicitly.
- **N5. `validateDomain` and readonly targets.** A `writes:` target that points at a readonly column passes validation, and its edit is then silently cut. A one-line check would close it; the spec does not require it.
- **N6. Timing bound.** "Bound = 2× the measured time" on one machine will flake on slower runs. Keeping 1000 ms, or the larger of 2× measured and 1000 ms, fits R3's "keeps a bound". The plan is right that the count runs the `$contains` WHERE twice (`rows.ts:83-92` reads it once today, and its comment says why).
- **N7. "First working version" cannot run as written.** It curls `/api/rows/<fixture>/1` via `serve.ts`, but `serve.ts` loads a module's default export (`serve.ts:24`), and `test/fixture.ts` exports `domain` as a named export. Point it at a test instead.
- **N8. Ledger step.** It names rows 9, 41, 44, 45, 46 and 47. N1 (chip options) is paid by this task too and is not named. Row 9 is already "done in 0a" for its `table` half.
- **N9. Test map gaps.** The Grid row's files omit `grid/store.test.ts`, which Task 4 Step 1 uses. `GET /api/revisions` with an unknown dataset or id has no stated answer.
- **N10. Pre-existing read exposure.** Because of Vite's default CORS (S8), any page on a local port can read `/api/rows` through the dev proxy. This is a 0a read-side exposure, outside 0b's threat model; worth a Deferrals line.

## Premises checked
- `/schema` serves column declarations verbatim, so `readonly`/`writes` flow through untouched → `packages/engine/src/app.ts:50` → holds
- `ApiError` needs widening for 403/405/413/415/422 → `params.ts:7` (`400 | 404`) → holds (the plan modifies it)
- The window is checked by shape only today → `params.ts:24,67` → holds
- `total` is the page length today → `rows.ts:91-92` → holds
- `withLookups` is reusable for the write reply → `rows.ts:57` (module-private; needs export) → holds
- `migrate()` is the single entry point that can call `validateDomain` first → `migrate.ts:48-55`, `serve.ts:30` → holds
- `readonly` does not change the DDL hash, so existing dev DBs keep migrating → `ddl.ts:19-25` → holds
- A `revision` table with `old`/`new`/`at` columns is valid SQLite → probed in bun:sqlite → holds
- The generic tables are not routable sources → `registry.ts:5-11` (only domain datasets and queries) → holds
- The theatre `activiteit` columns and `plandag(start_at, 5)` → `packages/theatre/src/datasets.ts`, `plandag.ts`, `seed.ts` → holds
- The `$contains` timing test exists with a 1000 ms bound → `packages/engine/test/rows.test.ts:242-256` → holds
- Hono body cap feasible at 64 kB with 413, including streamed bodies under `app.request` → `hono/body-limit` (hono 4.13.13), probed → holds
- Vite proxy forwards Origin unchanged; `changeOrigin` rewrites Host only → `vite/dist/node/chunks/node.js:18792` → holds
- Behind Vite, the preflight is "never answered" → `node.js:804,13688,24986` (Vite answers for localhost origins) → does not hold (S8)
- `errorText` shows a 422 message verbatim → `apps/grid/src/i18n.ts:118-120` (only a site `error.refused` string overrides it, and none is served) → holds
- A refusal reverts the cell and keeps the message on it → `store.ts:165-171` → holds
- The store can carry the row to route by `row[key]` → `store.ts:154-156` (send has the row), `store.ts:131-132,276-283` (undo goes through commit's row lookup) → holds
- `StoreApi.update` gains the row as its 4th argument → `store.ts:23,156`, `grid/hooks.ts:32` (4th argument is `table`) → does not hold as written (S1)
- Query rows carry `row[key]` in `fields` → `engine.ts:166-174` (`toRow` keeps every non-title column) → holds
- Editability follows `writable` and kind; the title is gated by `title_readonly` → `grid/columns.ts:125,157`, `engine.ts:72` → holds
- Relation chip options are built from the loaded rows → `grid/filter.ts:20-28,38`; `ui/useFilterNames.ts` already fetches the target's `records()` → holds
- The e2e engine is on 4311 and the grid on 5174, so `--origin http://127.0.0.1:5174` is the right origin → `playwright.config.ts` → holds
- 0a e2e flows depend on seeded state; files run alphabetically with `workers: 1` → `e2e/step-0a.spec.ts`, `playwright.config.ts` → holds; 0b running after 0a is safe
- No `ARCHITECTURE-INVARIANTS.md` in the repo; the engine/domain boundary is enforced by `scripts/check-boundaries.ts` → holds

I did not change the repo. I created one probe file under `packages/engine/` to test Hono's body limit, then deleted it; `git status` is clean.

---
Answered by the author in blob 81d63d10abbe2608007adda2e0d345d4cfd60b95: S1 (row replaces `table`, pays row 45), S2 (undo resolves the row at undo time; re-read not-found/failed returns the patched row; undo test with id ≠ key), S3 (flows name their rows, remove the Status chip, revisions-recorded makes its own edit), S4 (diff = declared columns + `deleted_at`; no-change writes nothing), S5 (create completeness check, 400), S6 (+ New blocked on queries), S7 and S8 via N1 (`Sec-Fetch-Site` replaces the Origin list; threat model corrected; cross-site-refused e2e flow through the proxy), N2 (`writable` moved to Task 2), N3 (`title_readonly` formula), N4 (body-less DELETE exempt from the content type, test added), N5 (readonly targets refused), N6 (bound = max(1000 ms, 2× measured)), N7 (first working version is a test), N8 (N1 named; row 9's writes half), N9 (store.test.ts in the map; revisions 404/[] stated), N10 (deferral line).
