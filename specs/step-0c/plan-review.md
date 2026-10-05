# Plan review: step-0c (fiche proof, in-use refusal, theatre parity)
Reviewed-plan: 8a3f5a9dd8083d3f920c4191febf70faa708d447 specs/step-0c/plan.md
Verdict: not ready

## Blocking

**B1. The Toewijzing writer cannot check for a duplicate assignment with the context it gets.**
- **Plan:** Task 3 > Interfaces / Step 1 says the toewijzing writer refuses "a second live Toewijzing for the same persoon_id on the same activiteit_id" (`"Deze persoon is al toegewezen aan deze activiteit."`). Task 3's Files list nothing under `packages/engine/`. The Architecture line says "The only engine change is in `writes.ts`'s delete path".
- **Source:** `packages/engine/src/declare.ts:61-65`. A writer gets `WriteContext { actor; current; find(dataset, id) }`. It has no database handle and no way to look rows up by column value. `finder()` (`writes.ts:151-158`) only reads one row by id. The only other way to enforce this is `indexes` (`ddl.ts:222-224`), and those are non-unique `CREATE INDEX`. A UNIQUE constraint would surface as a 500, not the Dutch 422. Laika's rule is a database query (`AssignmentRepository.php:198-215`, `duplicate()`), and `docs/SPEC.md:140` puts "one row per person per activity" in `refuse()`.
- **Why it matters:** R5's second refusal cannot be built in `packages/theatre` alone. It needs a generic read on `WriteContext`, for example `ctx.exists(dataset, where, exceptId)` or `ctx.count(...)`, inside the write transaction. That is a second engine change the spec does not list ("adds one generic engine rule").
- **Smallest change:**
  - Add an engine step before Task 3 (as part of Task 2 or a Task 2b) that extends `WriteContext` with that query, with engine tests: live rows only, the record itself excluded.
  - Name it in Task 3's Consumes.
  - Correct the Architecture sentence.
  - Raise it with Stefan as a spec finding: per AGENTS.md "say what and why … and stop". It touches no fiche commit, so R1's zero-change claim still holds.

## Should fix

**S1. Gate flow R11.2 has no way to open a Productie in the browser.**
- **Plan:** Test map, flow referenced-delete-refused: "the same for a Productie with activiteiten".
- **Source:** R8's SavedViews are Organisaties, Personen, Toewijzingen, Afwezigheden and Voorstellingen; there is no Producties view. `apps/grid/src/engine.ts:105,110` builds the grid's tables only from the sources saved views use, and the drawer (`Grid.tsx:261,281`) opens only rows in the sheet. As planned, there is no path to a Productie's Verwijderen button.
- **Change:** Add a "Producties" SavedView to Task 3, marked as invented and pending Stefan, the same way R10 is.

**S2. The engine fixture for the in-use tests is on the wrong side, or left undecided.**
- **Plan:** Task 2 > Files says "`fixture.ts` (a referencing dataset with a writer that allows delete)".
- **Source:** `packages/engine/test/fixture.ts:100-103`. Only `notitie` has a writer. `project` is the dataset that `taak`, `notitie` and the `per_project` query point at, and it has no writer, so `DELETE /rows/project/1` is 405 (`writes.ts:47`). The *referenced* dataset needs `delete`.
- **What breaks if a new referencing dataset is added instead:**
  - `rows.test.ts:217` asserts the exact list of source keys.
  - Any seed pointing at notitie 1 breaks `writes.test.ts:237` ("delete is soft").
- **Change:** Give `project` a writer with only `delete`. `writable` stays false (`app.ts:29` checks `update`), so `writes.test.ts:282-289` holds. Then:
  - Project 1 gives "two referencing datasets are both named": `Taken (2), Notities (1)`.
  - Project 2 is referenced by taak only.
  - An unreferenced inserted project covers "query-only".

**S3. Threat mitigation 4 (the writer's delete runs only after `inUse()`) has no test that proves the order.**
- The fixture's writer `delete` is a no-op (`fixture.ts:98`), so "table and revision unchanged" passes whatever the order.
- **Change:** Add a row to Task 2 Step 1: a spy (or a side effect) in the referenced dataset's `delete` that is not called on a 409.

**S4. New seeds will break existing theatre tests, and the plan does not name which.**
- **Plan:** Task 3 says "existing theatre tests only where a new relation changes an expectation (state which)".
- **Source:** `packages/theatre/test/writer.test.ts:125-129` and `:150-158` soft-delete activiteit 1. With R2 in place, a seeded toewijzing on activiteit 1 turns both into 409. `theatre.test.ts:13` pins productie 1 on 2026-10-12 at 5 activities.
- **Change:** Say in Task 3 that the toewijzing seeds avoid activiteit 1 and that no activiteiten are added for productie 1 on 2026-10-12, or name the tests to adjust.

**S5. Task 2's file list misses a file its Interfaces require.**
- Interfaces say "`ApiError` status union gains 409", but `packages/engine/src/params.ts:7` (`400 | 403 | 404 | 405 | 413 | 415 | 422`) is not under Files.
- The Architecture line also omits the `/schema` `deletable` change (`app.ts`), which Task 2 does make.
- **Change:** Add `params.ts` to Task 2 > Files, and fix the "only engine change" wording together with B1.

## Note

- **N1. Missing `bun install` step.** Task 1 adds a workspace dependency and a root devDependency but never runs `bun install`. Only `node_modules/@worktable/theatre` exists today. Without the install, `serve.ts:24` (`Bun.resolveSync('@worktable/fiche', cwd)`) and fiche's `@worktable/engine` import both fail, and `bun.lock` must change. Add the step.
- **N2. Seed order now matters.** `migrate` and `createEngine` turn `PRAGMA foreign_keys` on, and the new relations add `REFERENCES organisatie(id)` (`ddl.ts:39`). `seed()` must insert organisatie before productie, activiteit and persoon, and persoon before toewijzing and beschikbaarheid. The `weergavenaam` value must be written into the persoon seeds, because `insertRows` bypasses writers.
- **N3. R9's second bullet is not driven.** "A cleared non-nullable select reaches the writer and is refused" is checked only as "still sends ''" in `api.test.ts`. The refusal is real: `Select.tsx:17-19` offers '' for a defaulted column such as `status`, and `checkOption` refuses it. Asserting the 422 there or in e2e would close the gap.
- **N4. Grid edge cases for the new delete.**
  - Adding `remove` to `StoreApi` as required breaks the existing mocks (`store.test.ts:19`) at typecheck. Make it optional or update the mocks.
  - The undo history keeps entries for a removed row, so a later undo PATCHes a soft-deleted id and gets a 404. A ruling is needed at execution time.
  - R10 names 409 and 422; `store.test` covers 409 only.
- **N5. Two Vite dev servers will share one cache.** Both run from `apps/grid` on the same `node_modules/.vite` cache, which can race on dependency pre-bundling. Watch for flakes.
- **N6. Things the plan leaves open.**
  - `docs/SPEC.md:106` asks for Toewijzing indexes on `(persoon_id)` and `(activiteit_id)`; the plan does not declare them.
  - The plan does not say which of the R4–R6 writers have `delete`.
  - Both are small, but the executor will otherwise decide them.
- **N7. Bad line citation in the spec.** The spec cites `AssignmentRepository.php:225-260`, but the file is 218 lines. The rules are at `:165-215` (`person_or_name` at 183, `duplicate_assignment` at 198-199).
- **N8. The "simplest design" reasoning holds against the source.** Soft deletes never fire the FK: `writes.ts:227` sets `deleted_at`. One count per relation column, built from `store.domain.datasets`, is cheap, and `DatasetDecl.label` is there for the message. `inUse()` fits in `storedOf`/`runWrite` after the 404 check (`writes.ts:235-236`) and before `writer.delete` (`:226`), inside the `sqlite.transaction`.
- **N9. Checks that came back clean.**
  - R7's SQL meets the spec: `substr(start_at,12,5)` gives `HH:mm` for the seed format; the LEFT JOIN keeps a show without a venue; only public columns are selected.
  - The fiche proof needs no engine change. `serve.ts` resolves the domain by name; `validateDomain`, `/schema` and the grid adapter hold no theatre word; `custom.<key>` filtering works on a `custom: true` dataset (`filter.ts:12-18`).
  - `toRow` drops `custom` (`engine.ts:177`), as the spec's finding says.
  - The spec's claim that an existing database refuses to start holds (`migrate.ts:39-43`).

## Premises checked
- The fiche needs zero engine changes (`serve.ts` resolves `--domain` by name) → `packages/engine/src/serve.ts:24` → holds
- No theatre assumption in the engine or the grid → grep for activiteit, productie or theatre in `apps/grid/src` (non-test) and `packages/engine/src` finds nothing → holds
- `custom.<key>` filter on fiche → `packages/engine/src/filter.ts:12-18` → holds
- Theatre writers can refuse a duplicate assignment through the routes → `packages/engine/src/declare.ts:61-65` (WriteContext: actor, current, find by id) → does not hold (B1)
- The in-use check can run in the transaction before the writer's delete, with the declarations available → `writes.ts:224-246`, `Store.domain` at `:27-31` → holds
- Old databases refuse after a column becomes a relation → `ddl.ts:39`, `migrate.ts:39-43` → holds
- 409 is reachable through `ApiError` → `params.ts:7` → does not hold until the union changes (S5)
- `fixture.ts` gains "a referencing dataset with a writer that allows delete" to test in-use → `fixture.ts:98-103` (project has no writer, so DELETE is 405) → does not hold as written (S2)
- Drawer `editor` slot exists → `apps/grid/src/grid/Drawer.tsx:13,30` → holds
- The store's error notice can show a remove refusal → `store.ts:93-97,134-137`, `Toolbar.tsx:60-61` → holds
- The drawer closes when its row leaves → `Grid.tsx:261` → holds
- `api.remove()` exists → `apps/grid/src/api.ts:115` → holds
- `wireValue` sends '' for a cleared text select → `engine.ts:188-191` → holds; the fix belongs there
- The Select editor offers '' only on non-required columns → `cells/Select.tsx:17-19` → holds
- A Productie can be deleted in the browser → `engine.ts:105,110` (tables come from saved views; R8 has no Producties view) → does not hold (S1)
- Playwright can add a second engine and Vite → `playwright.config.ts`, `vite.config.ts` (`ENGINE_URL`, changeOrigin), `app.ts:75` (Host allowlist from `--port`) → holds
- New seeds leave existing theatre tests alone → `writer.test.ts:125,153` (delete activiteit 1), `theatre.test.ts:13` → holds only if seeds avoid those rows (S4)
- New seeds leave the 0a and 0b e2e assertions alone → `e2e/step-0b.spec.ts` matches rows by unique omschrijving and mutates no voorstelling → holds while no activiteit with a duplicate omschrijving is added
- Root and fiche package wiring → `package.json`, `node_modules/@worktable/` (theatre only) → holds after `bun install` (N1)
- The boundary script already covers fiche → `scripts/check-boundaries.ts:6` → holds

---
Answered by the author in blob 16bf6a45cc87dc9e5a44792f91a6d68ffda77cd6: B1 (`ctx.exists(dataset, match, exceptId?)` added to Task 2, pending Stefan as spec finding 6; Architecture corrected; Task 3 consumes it; threat 5 and tests added), S1 (Producties view, pending Stefan), S2 (`project` gets a delete-only writer; fixture tests named), S3 (spy test on the writer's delete), S4 (seed constraints named in Task 3), S5 (`params.ts`, `declare.ts` in Task 2 Files), N1 (`bun install`), N2 (seed order and `weergavenaam` in seeds), N3 (non-nullable select refusal in the select-clear flow), N4 (`StoreApi.remove` optional; undo entries dropped on removal; 422 tested), N6 (Toewijzing indexes; which writers delete), N7 (citation corrected). N5 noted for execution.
