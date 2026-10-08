# Plan review — grid-toolbar
Reviewed-plan: ebba9ba27cad0cc23b97391351d098941818d3ea
Verdict: not ready

Two premises in the plan are false in the source. Both are small to fix. The rest of the plan is close: the filter, scope and undo premises hold, and the threat model has a home for each threat.

## Blocking

1. **Link kopiëren assumes filters and period are in the hash. They are not.**
   - Plan, Task 5 Interfaces: "Link kopiëren copies `location.href` (view, filters, period are in the hash)".
   - Source: `apps/grid/src/ui/hash.ts:1` says the hash holds "the window (`from`, `to`) and the view". Filters live in localStorage (`grid/layout.ts:139` `storedLayout`) or on the server's saved view, never in the URL.
   - After Task 3, the period becomes a filter condition and leaves the hash too. The copied link would then carry only `#view=`.
   - A colleague opening that link on a private view sees nothing: `views.ts:251` lists only views that are the caller's own or shared.
   - So R4's "the address with view, filters and period" has no task.
   - Smallest change: Task 3 or 5 writes the conditions into the hash (for example `#f=<json>`) and reads them on landing. Decide which wins over a local copy or a saved view. Add an e2e step: open the copied link in a fresh context and see the same conditions.

2. **History uses `of` to map a query row to a dataset record. The id promise is on `creates`.**
   - Plan, Task 4 Interfaces: "For a query, the records are its `of` dataset's (the row id is that dataset's id, as `creates` promises); without `of`, a query has no history".
   - docs/SPEC.md (Query row, working-tree diff): "a query that declares `creates` promises that its `id` is that dataset's id". `of` makes no such promise.
   - `packages/theatre/src/queries.ts:9` declares `productie_dag` with `of: 'activiteit'`. Its SQL (`queries/productie_dag.sql`) has `SELECT MIN(a.id) AS id … GROUP BY a.productie_id, a.plandag`. Each row's history would show one arbitrary activity's revisions.
   - `voorstellingen` (`queries.ts:89`) also declares only `of`.
   - Only `dagplanning` (`queries.ts:45`) declares `creates`.
   - Smallest change: key the history on `creates`. A query without `creates` answers no entries. Test that `productie_dag` answers `[]`.

## Should fix

3. **Deletes can never appear in the history, but R3 asks for them.**
   - Task 4 reads row ids "exactly as `/rows` would".
   - Datasets: `packages/engine/src/rows.ts:35` adds `isNull(deleted_at)`.
   - Queries: the view SQL filters `a.deleted_at IS NULL` (`dagplanning.sql`).
   - A deleted record is never among the ids, so its `deleted_at` revision is never read.
   - Change: state how deleted records are found (for example, revisions with `field = 'deleted_at'` on records whose last live state matched the scope). Otherwise get Stefan's ruling to drop deletes. Add a test row either way.

4. **"Ongedaan maken" on every `mine` entry will hit refusals.**
   - `writes.ts:465-474` refuses:
     - a batch holding a delete (422);
     - an import or seed batch (422);
     - an already undone batch (409).
   - One batch can span several records (an action's creates). Undoing one entry undoes all of them.
   - Change: add `undoable` to the entry (kind in write, action or undo; `undone_by` null; no `deleted_at` row). Show the button only on it, and test that a `mine` delete entry has no button.

5. **History can expose a dataset the caller cannot read.**
   - Threat 3 scopes the ids through the query's scope, then reads the target dataset's revisions for every field.
   - A query with `owners` whose `creates` dataset has none would show an owner a dataset that is 404 to it (`access.ts:51` `readable`). It would also show columns the query does not map.
   - Change: require `readable(actor, creates-dataset)`. Limit `changes` to the source's own columns (for a query, its mapped `writes.field`s). Add the denial test to Test map row 4.

6. **The engine would emit the Dutch actor words "planning" and "jij".**
   - Task 4 Interfaces, Threat 4: "an owner sees 'planning' for anyone else and 'jij' for itself".
   - Global Constraints: "Dutch UI strings live in `apps/grid/src/i18n.ts`"; AGENTS.md: "Names in the engine are English and generic".
   - Change: the engine answers `actor: null` for others' entries to an owner, plus `mine`. The grid renders the words.
   - Also decide the word for `actor_id = -1` (system, seed) and for an account that no longer exists.

7. **The new route has no row in the route matrix, which fails the run.**
   - `packages/engine/test/route-matrix.test.ts:189` asserts "every route has a row in the matrix". Task 4 does not list this file.
   - Change: add `GET /api/history/<source>` with `none: 401`, owner 200 on an owned source and 404 on `plat`. This also asserts the unauthenticated denial.

8. **Task 3's file list misses the code that reads `Filter.value`.**
   - These files need to change but are not listed:
     - `grid/Grid.tsx:98` and `matrix/Matrix.tsx:149` re-filter client-side with `filterRows` (`grid/filter.ts:57-60`, equality on `f.value`);
     - `ui/views.ts` (`toStored`, `comparable`);
     - `ui/useFilterNames.ts:35`;
     - `grid/layout.ts` `filter()`, which keeps one condition per field.
   - `parse` (`layout.ts:94`) requires `typeof f.value === 'string'`, so every stored local copy is silently dropped once the shape changes.
   - Change: list these files. Decide `filterRows`: drop the condition re-filter (the server is the authority) or mirror every op. Note that SQLite LIKE folds ASCII only while the grid's `fold` strips diacritics. Bump the layout key (`v1` → `v2`) or migrate the old shape.

9. **"ligt tussen" on a datetime column drops the last day.**
   - Mapping table: `between` → `$gte`/`$lte` with day values. `start_at` is ISO text, so `'2026-10-10T09:00' <= '2026-10-10'` is false.
   - Compare `api.ts:99`, which appends `T23:59:59`.
   - Change: on a datetime, `$lte` gets `T23:59:59` (or `$lt` the next day). Add a test.

10. **Two different "Kopie maken" actions.**
    - Task 1 makes the toolbar's save-as path "Kopie maken".
    - The rail's existing "Kopie maken" (`ViewList.tsx:49` → `useSavedViews.ts:154` `duplicate`) copies `arrangementOf(from)`, the saved arrangement, not the local change.
    - The approved prototype puts Kopie maken in the rail view menu (`design/grid-prototype.html:540`), which is where R2's "… → Kopie maken keeps it" points.
    - Change: one action. `duplicate` takes `currentOf(from)` plus `copyKept`/`clearIfSent`, as `saveAs` does. Test it in Task 1, not row 3.

11. **A change made while an autosave is in flight is lost.**
    - `useSavedViews.ts:145` `save` returns early while `sending.current`. A change made during an in-flight PATCH stays local until some later change.
    - Change: after the save settles, save again if `changed(view)`. Test two changes 300 ms apart, with the first PATCH still pending.

12. **Task 1 does not test that a failed write still shows.**
    - R1: "Only a refused or failed write shows".
    - Change: add a test that `save: 'error'` still renders `Niet opgeslagen: …` (`Toolbar.tsx:68-74`), and that `saving` renders nothing.

13. **The e2e grep in Task 3 misses period strings.**
    - It greps `Periode`, `period-chip`, `nv-period`. It misses `Vorige periode`/`Volgende periode` (lowercase, `e2e/dagplanning.spec.ts`) and `period=all`.
    - Change: add those to the grep.

14. **The first working version contradicts Task 1.**
    - Line 13 says Task 1 delivers "the bar without the sort and period chips". Task 1 removes only the sort chip; the period chip leaves in Task 3.
    - Change: correct line 13.

15. **Two Review Focus lines point at no matching row.**
    - Focus 6 ("The fiche e2e") points at no Test map row and no step.
    - Focus 4 points at row 3, but "stays local" is Task 1's test (row 1).
    - Change: name the fiche spec file in a row; point Focus 4 at row 1.

16. **Task 5 does not list `api.ts`.**
    - The grid has no share-token call: there is no `share-token` reference in `apps/grid/src`.
    - Change: add `apps/grid/src/api.ts` to Task 5's files.

## Note

- **Wrong action name.** Task 1 Interfaces consumes "`useSavedViews` actions (`update`, `saveAs`)". There is no `update`; it is the top-level `save` (`useSavedViews.ts:194`).
- **Where the token check lives.** Threat 2 puts the `$period` column-type check in `filter-compile.ts`, which has no source and no column types. The check belongs in `filter.ts` `resolveKey`/`comparison`. Through `POST /views` the refusal is `bad_view`, not `bad_filter` (`views.ts:98`).
- **The clock.** Review Focus 5 says "row 2, with an injected clock", but row 2's seam is HTTP and the app takes no clock. Test `$period` at `filterWhere(…, now)`, and say so.
- **Name collision.** New `ui/History.tsx` sits beside the existing `ui/history.ts`, the tab undo stack. On a case-insensitive filesystem, `import './History'` resolves `history.ts` first. Name the panel `HistoryPanel.tsx`.
- **Publishing again.** Publiceren on an already public view rotates the token (`views.ts:308`) and kills the old link. The grid does not map `public` from `ViewOut`. Decide whether a second click warns. The public link answers JSON (`/api/public/views/:token`); there is no page.
- **Matrix window.** "The matrix window comes from a date condition": name which one, the condition on the source's declared `date`. Also cap a "ligt tussen" above 92 days (`params.ts:120`).
- **History content.** For Dagplanning, link changes (Mensen, toewijzing rows) are not in its `creates` dataset, so they do not appear. The prototype's history shows them (`grid-prototype.html:472`). Relation values in `changes` are ids; R3 says "the new value", so resolve titles.
- **"is niet" and empty values.** `$nin` uses `NOT IN`, so "is niet" hides rows where the field is empty. `$nlike` keeps them. Pick one rule for both.
- **R9 test.** Scrollbars cannot be checked in jsdom. Name the shake-out screenshot as R9's proof.

## Premises checked
- Toolbar has a save state, Opslaan and modified → `apps/grid/src/ui/Toolbar.tsx:57-75` → holds
- `isSaved`/`keepLocal`/`changed` exist; own-view autosave fits the local copy plus `save`/`clearIfSent`, with no second home → `ui/views.ts:43,99,140`, `ui/useSavedViews.ts:144-153` → holds, except the in-flight drop (Should fix 11)
- `useSavedViews` exposes `update` → `useSavedViews.ts:193-199` → does not hold (it is `save`; Note)
- Stored filters are validated on save and compiled at read time → `packages/engine/src/views.ts:96-106`, `rows.ts:36` → holds
- Public views apply stored filters at read time, so `$period` resolves there too → `views.ts:331-339` → holds
- `$contains` is array membership on custom JSON only → `filter.ts:53-54` → holds
- `$in`/`$nin`/`$exists`/`$gte`/`$lte` exist → `filter-compile.ts:1` → holds
- A matrix needs `from`/`to`, at most 92 days → `params.ts:117-122` → holds
- Grid filter chips map to engine filters through `splitFilters`/`mergeFilters`/`rowsQuery` → `apps/grid/src/engine.ts:241-353` → holds
- Filter conditions are applied only on the server → `grid/Grid.tsx:98`, `matrix/Matrix.tsx:149` → does not hold (client-side `filterRows`; Should fix 8)
- The hash holds view, filters and period → `ui/hash.ts:1`, `ui/Window.tsx:105-124` → does not hold (Blocking 1)
- A query's `of` promises the id → docs/SPEC.md Query row; `theatre/src/queries/productie_dag.sql` → does not hold (Blocking 2)
- `/rows` scope gives every record the view shows, deletes included → `rows.ts:35` → does not hold for deletes (Should fix 3)
- Undo refuses another account's batch with 403 → `writes.ts:463-464` → holds
- Undo works on any own batch → `writes.ts:465-474` → does not hold (Should fix 4)
- `GET /revisions/:dataset/:id` exists, datasets only → `writes.ts:409-413`, `app.ts:63` → holds
- The account table has an email → `auth-tables.ts:11` → holds
- `PUT /views/:id/share-token` exists, administrator only, `not_query` on a dataset view → `views.ts:301-310,291` → holds
- A grid UI or api call for the share token exists → no match in `apps/grid/src` → does not hold (Should fix 16)
- The grid knows the role → `ui/App.tsx:111`, `types.ts:297` → holds
- `RelationPicker` takes `before`/`hide` → `grid/cells/RelationPicker.tsx:43` → holds
- The seeded Dagplanning has `filters: {}`, and seed-missing updates system views → `theatre/src/seed.ts:190-197`, `engine/src/seed-missing.ts:40` → holds
- "Optie of bevestigd" stores `$in` → `seed.ts:214` → holds
- The vocabulary check does not trip on `$like`/`$nlike`/`$period`/`history` → `scripts/check-vocabulary.ts` (domain column names only) → holds
- Every route needs a route-matrix row → `engine/test/route-matrix.test.ts:189` → holds; the plan omits it (Should fix 7)
- Simplest design: reusing `/revisions` costs one request per row and is dataset-only; `$period` is needed because stored filters are validated server-side → `writes.ts:411`, `views.ts:96` → holds
- Test regime commands → `package.json:13-17`, `apps/grid/package.json:8` → holds

---

# Plan review — grid-toolbar (round 2)
Reviewed-plan: 37cdd1d89c50dcf66f9f095051322e40934c8728
Verdict: ready with fixes

All 16 round-1 findings and the Notes are taken up. Both round-1 Blocking premises are fixed. The four rulings hold, and spec and plan state each one the same way, with one stale test bullet (Should fix 1). There is no Blocking finding this round. What is left is mostly places where an executor would build the wrong thing or fail `bun run check`.

## Blocking
None.

## Should fix

1. **Task 2 Step 1 has two test bullets that contradict each other.**
   - Line 146 says "`$nlike` keeps nulls". Line 150 says "`$nlike` leaves out empty cells, as `$nin` does (spec Out)".
   - The Interfaces (line 137) and the spec's Out ruling side with line 150. `col NOT LIKE x` on a null `col` gives NULL, so the row drops out, the same as `notInArray` (`packages/engine/src/filter.ts:83`).
   - Fix: delete the line-146 bullet.

2. **The engine tests use theatre words, which fails `bun run check`.**
   - Task 4 Step 1: "A query without `creates` (the theatre's `productie_dag`) answers no entries", in `packages/engine/test/history.test.ts`.
   - Task 2 Step 1: "stores `{ plandag: { $period: 'week' } }`" and "matches 'Repetitie'", in `packages/engine/test/filter.test.ts`.
   - `scripts/check-vocabulary.ts:25-50` scans all of `packages/engine` (tests included) for every theatre dataset, query and column name split on `_`. `productie` and `plandag` are on that list.
   - Fix: use the fixture's own names: `per_project` (`test/fixture.ts:98`, no `creates`), `note.day`, `note.tekst`. If the theatre case is wanted too, test it in `packages/theatre/test`.

3. **The engine fixture has no query with `creates`, and Task 4 does not list `fixture.ts`.**
   - Two Task 4 tests need such a query: "the changes of a query entry hold only its mapped columns", and "a query whose `creates` dataset the caller cannot read answers no entries".
   - The second one needs a query with `owners` whose `creates` dataset declares no owner column.
   - `packages/engine/test/fixture.ts:98-144` declares only `per_project` and `note_lijst`, and neither has `creates`.
   - Fix: add `packages/engine/test/fixture.ts` to Task 4's Files and name the query to add. For example, `note_lijst` gains `creates: 'note'` for the mapped-columns case, plus one owner-scoped query creating into an ownerless dataset with a writer, for the denial. Re-run `route-matrix.test.ts` and the schema tests, which list the fixture's sources.

4. **The history reply cannot carry "systeem" and "onbekend".**
   - Task 4 Interfaces say the grid renders "actor id -1 → 'systeem'; … an account that no longer exists → 'onbekend'".
   - But the entry carries only `actor: string | null` and `mine`. Null already means "planning" for an owner, so the grid cannot tell the three cases apart.
   - It is also undecided what an owner sees for a system batch.
   - Fix: give the entry a discriminator, for example `by: 'self' | 'account' | 'system' | 'gone' | 'hidden'` beside `actor`. Add "onbekend" to Step 2's render test.

5. **`limit` means two things on the history route.**
   - The route is `GET /api/history/:source?filter&from&to&limit` with "limit ≤ 100", and it "reads the source's row ids exactly as `/rows` would".
   - `parseRowsParams` reads `limit` as a row cap of 1 to 5000 (`packages/engine/src/params.ts:53-58`). Passing the query through would cap the ids to the 50 entries asked for, so the history would silently cover only the first 50 rows.
   - Fix: say the ids are read at `MAX_LIMIT` and `limit` caps the entries. Or name it `entries`.
   - Also say which query the grid sends: the one `rowsQuery` builds, scope included.

6. **The history scope does not check the `creates` dataset's own owner scope.**
   - Threat 3 reads the ids through the query's scope and then checks `readable(actor, creates)`.
   - `readable` (`access.ts:48`) only checks that the dataset declares an owner column. It never checks that each id is in that dataset's scope for the owner.
   - `readRevisions` does that check (`writes.ts:415-418`, `inScope`).
   - Fix: keep only the ids that are also `inScope(scopeOf(actor, createsDataset), row)`. Add that to Test map row 4.

7. **The `#f=` link has no defined lifetime, and it can land on the wrong view.**
   - Task 3 `hash.ts`: "the conditions travel in the hash as `#f=<json>`… A landing with `f` applies them as a local change." This reads as `f` being written on every change and re-applied on every load.
   - First problem: a reload re-applies an old `f` over a save made since in another tab.
   - Second problem: when the hash's `view` does not resolve, the conditions land on another view. A colleague's private view is not listed to anyone else (`views.ts:251`), and App then falls back to `tables[0]?.views[0]` (`ui/App.tsx:193`). The conditions go onto that view, whose source may lack the fields, and `/rows` answers 400 `bad_filter`.
   - Fix, simpler: Link kopiëren composes `#view=…&f=…` at the moment of the click. The landing applies `f` only when `view` resolves to that exact key, drops a malformed `f`, and removes `f` from the hash once applied.
   - Name a shared or seeded view in the `filter-link` e2e.

8. **Task 3 contradicts itself on where the matrix window comes from.**
   - The `Window.tsx` line says "the matrix window comes from the condition on the source's declared `date` column… or none, reads the current week".
   - The Tests line says "Their landings `#from=` keep working for the matrix".
   - These are two sources for one window.
   - The plan also does not say what else reads `range` (`ui/App.tsx:209-213`) once Period leaves:
     - the rows request (`asked = dated ? range : {}`, `App.tsx:229`);
     - `newRow` and `madeFrom`, which take a new row's default day from it (`App.tsx:268-270`, `grid/newRow.ts:26`);
     - the export file name (`App.tsx:294`).
   - Fix: pick one source for the matrix. Either drop `useWindow` and rewrite the `#from=` landings as `#f=`, or state the precedence between hash and condition. Say that a table sends no `from`/`to`, and that `newRow` and the export read the date condition's window, or none.

9. **Task 1 contradicts itself on the toolbar's save-as.** It is also silent on Terugzetten.
   - Files: "`App.tsx`: autosave; the save-as path stays in `…` as Kopie maken". Interfaces: "One 'Kopie maken', the rail's… The toolbar's save-as button leaves."
   - The toolbar's `…` today holds `saveAsNew` and `revert` whenever the view is modified (`ui/Toolbar.tsx:82-85`).
   - Once there is no "gewijzigd" mark, a local change on a seeded view stays in the browser, unseen, unless Terugzetten stays.
   - Fix: delete the stale Files clause. State whether Terugzetten stays in `…` on a locked view with a local change, and test it in Task 1.

10. **Autosave changes what a public link serves at once, and the threat model does not say so.**
    - An administrator's own public view is `editable` (`views.ts:66`). Under R2, every filter click on it now rewrites what `/public/views/:token` serves (`views.ts:331-339`), where an explicit Opslaan used to be needed.
    - This is the asset "Rows the caller may not read", reached by the public.
    - Fix: name it in the threat model. Either record a ruling (a public view keeps changes local until …) or accept it explicitly. Add a row if a mitigation is chosen.

11. **Review Focus 6 points at the wrong row, and its test is vacuous.**
    - It points at "Test map row 7". The fiche row is row 6; row 7 is Share.
    - The existing `fiche-renders-as-before` (`e2e/grid-ux.spec.ts:643-654`) asserts that no `Periode` group shows, which is always true after Task 3.
    - Fiche declares no date columns, so "no date operators" holds trivially. No task touches the test.
    - Fix: point the focus at row 6. In Task 3, add one assertion to that test: the builder opens and offers the fiche's text operators.

12. **Task 4: the entry's `kind` means two different things.**
    - The entry has `kind` (by threat 5, the batch kind: write, action, undo, import, seed). Yet "A create is one entry whose kind is `create`".
    - Fix: name them apart, for example `batch_kind` and `created: boolean`.

## Note
- **Where the type check goes.** Threat 2 says "`comparison`, which knows the column". `comparison` gets `Lhs`, which holds `numeric` and not the type (`filter.ts:9,61`). Carry the column type in `Lhs` from `resolveKey`. Also decide `$like` and `$period` on `custom.<key>` keys, where the type is unknown; refuse them.
- **Two ops share one engine key.** "One condition per field and operator" collides on engine keys: `week`/`next_week`/`month` all store `$period`, `empty`/`filled` both store `$exists`, and `in` with one value stores `$eq`. Say "per engine key", and have the builder not offer a second date-period or emptiness condition on a field.
- **Undo across records.** One batch spanning several records gives several entries, each `undoable`. Undoing one undoes all of them. Undo can also fail with 409 `changed_since` (`writes.ts:491`). Say what the panel shows in both cases.
- **The id list can get long.** The id list can reach 5000. `rows.ts` already chunks at 500 (`CHUNK`). Use the same chunking for `record_id IN (…)`.
- **R3 wording.** Spec R3 says "a deletion … has no undo" and also "Deletions are not listed". Both are consistent with threat 5: a listed batch that also deleted another record is not undoable. The wording could say so.
- **Task 5 files.** Mapping `public` from `ViewOut` touches `toSavedViews` in `apps/grid/src/engine.ts` and `SavedView` in `types.ts`. Neither is in Task 5's Files.
- **docs/SPEC.md Sidebar line.** "The period is a filter chip over the declared date column, with the window in the URL" (the working-tree diff) becomes false in Task 3. No step amends it.
- **Matrix navigation.** The matrix loses Period's ‹ › week steps (`ui/Period.tsx`). By spec that is intended, but the matrix e2e that use "Vorige/Volgende periode" need a rewrite, not a rename.

## The rulings
- **Deletes out of history:** sound. The view's rows cannot find a deleted record (`rows.ts:35`). Spec R3 and plan threat 5 agree.
- **A link's conditions applied as a local change:** sound, and spec R4 matches plan Task 3. The landing guard is still missing (Should fix 7).
- **"is niet" and "bevat niet" leave out empty cells:** sound. It matches `NOT IN` and `NOT LIKE` on NULL. The spec Out line matches Task 2 Interfaces; one test bullet does not (Should fix 1).
- **Actor words rendered by the grid:** sound; the engine stays English. The reply shape cannot carry two of the four words (Should fix 4).

## Round 1, resolved or not
| # | Finding | Status |
|---|---|---|
| B1 | Conditions not in the hash | resolved (`#f=`); lifetime and landing guard open (S7) |
| B2 | History keyed on `of` | resolved (`creates`); its test uses a theatre name (S2) |
| 3 | Deletes in history | resolved by ruling (spec R3) |
| 4 | Undo refusals | resolved (`undoable`, threat 5) |
| 5 | Unreadable `creates` dataset, unmapped columns | resolved; owner scope on the dataset still unchecked (S6), fixture missing (S3) |
| 6 | Dutch actor words in the engine | resolved in principle; discriminator missing (S4) |
| 7 | Route-matrix row | resolved |
| 8 | `Filter.value` readers, `filterRows`, `v1` → `v2` | resolved |
| 9 | "ligt tussen" on a datetime | resolved |
| 10 | Two "Kopie maken" | resolved in Interfaces; stale Files clause (S9) |
| 11 | In-flight autosave lost | resolved |
| 12 | A failed write still shows | resolved |
| 13 | e2e grep for period strings | resolved |
| 14 | First working version line | resolved |
| 15 | Review Focus rows | Focus 4 resolved; Focus 6 points at the wrong row (S11) |
| 16 | `api.ts` in Task 5 | resolved |
| Notes | `update`, token check, clock, HistoryPanel name, rotate warning, matrix window, relation titles, "is niet", R9 screenshot | all resolved; token-check location partly (Note 1) |

## Premises checked
- `readHash`/`writeHash` exist with a free key; the hash carries no filters today → `apps/grid/src/ui/hash.ts:1-10` → holds
- The layout `Filter` is `{field, value}`, `parse` requires a string `value`, the prefix is `v1` → `grid/layout.ts:8-12,26,94` → holds
- `filterRows` compares `f.value` and is called from Grid and Matrix → `grid/filter.ts:57-60`, `grid/Grid.tsx:98`, `matrix/Matrix.tsx:149` → holds
- `save` returns early while `sending.current`; `duplicate` uses `arrangementOf`; `saveAs` uses `currentOf`, `copyKept`, `clearIfSent` → `ui/useSavedViews.ts:135-159` → holds
- `toStored` and `comparable` read `{field, value}` → `ui/views.ts:26,80` → holds
- The rail's Kopie maken calls `actions.duplicate` → `ui/ViewList.tsx:49` → holds
- `Niet opgeslagen: …` renders from `SaveState` → `ui/Toolbar.tsx:72-78` → holds
- `useFilterNames` reads `filter.value` → `ui/useFilterNames.ts:35` → holds
- `splitFilters`, `mergeFilters` and `rowsQuery` map chips as `$eq`; `rowsQuery` sends `from`/`to` when the view has a `date_field` → `apps/grid/src/engine.ts:227-276,373-386` → holds
- `api.ts` appends `T23:59:59` for a day's end → `apps/grid/src/api.ts` `awayRows` → holds
- The window feeds rows, `newRow`, `madeFrom` and the export → `ui/App.tsx:209-213,229,268-270,294` → holds; the plan does not account for it (S8)
- Operators live in `filter-compile.ts` and SQL in `filter.ts`; `$nin` is `NOT IN` → `packages/engine/src/filter-compile.ts:1,32`, `filter.ts:82-83` → holds
- `comparison` knows the column type → `filter.ts:9,61` → does not hold (it knows `numeric` only; Note)
- `filtersOf` validates through `filterWhere` and maps a refusal to `bad_view` → `views.ts:96-106` → holds
- A public view applies stored filters at read time; a second PUT rotates the token; a non-query view is `not_query` → `views.ts:301-310,331-339` → holds
- Undo refuses another account's batch (403), non-undoable kinds, done batches and delete batches → `writes.ts:458-483` → holds
- `readRevisions` exists, is dataset only and checks `inScope` → `writes.ts:409-424` → holds
- `readable` checks only the presence of an owner column → `access.ts:48-50` → holds (hence S6)
- `readRows` scopes, filters and drops deleted rows; `/rows` uses `parseRowsParams`, whose `limit` caps rows → `rows.ts:29-41,92-112`, `params.ts:53-58` → holds (hence S5)
- Only `dagplanning` declares `creates`; its mapped columns are the `writesActiviteit` fields → `packages/theatre/src/queries.ts:36-88` → holds
- Every `/api` route needs a matrix row, and each row gives all four roles → `packages/engine/test/route-matrix.test.ts:189-205` → holds
- The engine fixture has a query with `creates` → `packages/engine/test/fixture.ts:98-144` → does not hold (S3)
- Engine tests may name theatre sources and columns → `scripts/check-vocabulary.ts:25-50` → does not hold (S2)
- `fiche-renders-as-before` exists → `e2e/grid-ux.spec.ts:643` → holds; it is vacuous for the new builder (S11)
- `RelationPicker` takes `before`/`hide` → `grid/cells/RelationPicker.tsx:42` → holds
- Simplest design: `$period` is needed because a stored filter is validated server-side, and per-record `/revisions` costs one request per row → `views.ts:96`, `writes.ts:409` → holds

---

# Plan review — grid-toolbar (round 3)
Reviewed-plan: d062f5a74c26024a98f41c00b50581f28a4845d6
Verdict: not ready

Most of round 2 is fixed, but one premise fails against the e2e source. The `#from=` landing rule cannot keep the existing landings working, because those flows land on one view and then open another. That is Blocking. The Should fix items are small: wording and file lists an executor would otherwise build wrong.

## Blocking

1. **The `#from=` landing does not keep today's e2e landings working (Task 3, Tests line 187 and hash.ts lines 185–186).**
   - The plan's claim (line 187): "Their `#from=` landings keep working through the landing rule above."
   - The rule (line 185): the day becomes a local condition on the view you land on, and `from` "leaves the hash once applied."
   - The source does not fit that. The flows land, reload, and then open a different view:
     - `e2e/dagplanning.spec.ts:56-59` (`openDagplanning`: `goto('/#from=…')`, `reload`, `openView(page, 'Dagplanning', …)`);
     - `dagplanning.spec.ts:609-611`;
     - `grid-ux.spec.ts:70-78`: `land` then `pick`, used at 130, 185, 327, 364, 393, 437, 475, 693 and 706.
   - So the week is spent on whichever view opens first. Dagplanning then opens with its seeded `$period: 'week'` (line 186), which means today's week, not the landed one.
   - Even on the view you land on, the rule fails. A landed week is a `$gte`/`$lte` condition. The seeded `$period` is a different engine key (line 206), so both are stored and ANDed together. The result is empty unless the landed week is the current week.
   - Smallest fix, pick one:
     - (a) Drop the legacy rule. Have Task 3 rewrite those landings to `#view=<key>&f=…` or to "open the view, then set the date condition".
     - (b) Keep `#from=` as a tab-level default. It applies to each dated view opened until the person changes that view's condition.
   - Either way, add: a landed or linked date condition **replaces** the field's existing date condition (`$period` or `$gte`/`$lte`). It is never added beside it.

## Should fix

1. **Threat 6 needs `public` in Task 1, but only Task 5 brings it.**
   - Task 1's tests (line 111) and its Interfaces (line 104) branch on a public view.
   - The grid's `SavedView` has no `public` today: `apps/grid/src/types.ts:150` and `apps/grid/src/engine.ts:83,327` map only `editable`. The mapping is in Task 5's Files (line 279).
   - Fix: move `toSavedViews` maps `public` and `SavedView.public` into Task 1's Files.
   - Also gate "Publieke weergave bijwerken" on `view.public && view.editable`, and name `editable` in threat 6 instead of "the `public_view` rule":
     - An administrator can publish a seeded or shared view (`packages/engine/src/views.ts:291-294`).
     - That view is not `editable` (`views.ts:66`).
     - Saving it answers `read_only_view` or `not_owner` (`views.ts:168-172`).

2. **`limit` is still on the history route (Task 4, line 237).**
   - Line 237 still reads `GET /api/history/:source?filter&from&to&limit` with "(limit ≤ 100, default 50)".
   - Line 240 says it is `entries`, "not `limit`".
   - Fix: change line 237 to `?filter&from&to&entries`.

3. **The new engine test word fails `bun run check` (Task 2 Step 1, line 149).**
   - The fixture text "Opbouw zaal" is a test word in `packages/engine/test/filter.test.ts`.
   - I rebuilt the vocabulary the way `scripts/check-vocabulary.ts:44-53` does. `opbouw` is on it; `zaal`, `tekst`, `week`, `entries`, `created`, `batch` and `kind` are not.
   - Fix: use a word that is not on the list, for example "Grote zaal".

4. **The fixture's denial query has no dataset to create into (Task 4 Files, line 234).**
   - The plan asks for "a dataset with a writer and no owner column". The fixture has none:
     - its writers are `project` (delete only) and `note` (which has `owners`) (`packages/engine/test/fixture.ts:175,181,205`);
     - `merk` and `plat` have no writer;
     - `checkCreates` refuses a `creates` without a creating writer (`packages/engine/src/validate.ts:69-77`).
   - The executor must therefore add a writer, or a new dataset plus a query. That changes lists that existing tests assert exactly:
     - `access.test.ts:99-100` (the owner's and the editor's source lists);
     - `rows.test.ts:256-265`;
     - `writes.test.ts:214-229` and `442-450` (the `deletable` and `writable` maps).
   - "Rerun" should be "update".
   - Fix:
     - name the new dataset (no owner column, a `create` writer) and the owner-scoped query that creates into it;
     - list those four tests in Task 4's Files;
     - keep the new names off the vocabulary list.
   - `note_lijst` gaining `creates: 'note'` is safe: only `app.ts:98-100` reads `creates`.

5. **The new-row day would regress (Task 3, line 175).**
   - The plan says "`newRow`/`madeFrom` take a new row's day from the condition's first day, else today."
   - Today `newRow` uses today when today is inside the window, and the first day only otherwise (`apps/grid/src/grid/newRow.ts:25-26`).
   - Built as worded, `+ Nieuw` on Dagplanning's "deze week" lands on Monday.
   - Fix: "`newRow`/`madeFrom` receive the condition's window where they took `range`, else none."

6. **The matrix can go empty on a long "ligt tussen" (Task 3, line 174).**
   - Over 92 days, the matrix falls back to the current week as `from`/`to`.
   - But the `between` condition is still in `filter`: `rowsQuery` merges every layout filter (`apps/grid/src/engine.ts:373-376`), and `rows.ts:36-38` ANDs the filter with the window.
   - So a range that does not contain today shows nothing, not "the current week".
   - Fix: a matrix sends its window as `from`/`to` and leaves the date condition out of `filter`.

7. **The `#view=&f=` landing must wait for `settled` (Task 3, line 183).**
   - `view` resolves against `tables`. Those are built from the schema's starting views first, and from the saved views only when `savedViews()` answers (`apps/grid/src/ui/App.tsx:182,193-194`).
   - Before that, a saved view's key falls back to `tables[0]?.views[0]` (`App.tsx:194`). A check made at first resolve drops `f` for every own or shared view.
   - The `filter-link` e2e uses a seeded view, so it would not catch this.
   - Fix:
     - "applied or dropped once `settled`";
     - add a Task 3 Step 1 test that lands on a saved view's key.

## Note

- **Other readers of `range`.** Besides those Task 3 names (lines 172-176), `range` is read by:
  - the matrix store's `reload` (`App.tsx:250`), which must send the same window as `asked`;
  - the empty hints `formatWindow(range)` (`App.tsx:405,409`);
  - `Sheet`'s `period` (`App.tsx:413`).
  
  The compiler will flag them once `useWindow` goes, so this is low risk.
- **A landing must not autosave.** Applying a landing or link is `keepLocal`, which bumps the stored revision (`views.ts:113-116`, `useStoredRevision`). An autosave driven by `changed(view)`/revision would save the landing too, against line 183. So autosave must follow the person's `setLayout`, not the stored state.
- **`gone`.** Accounts are disabled, never deleted (`packages/engine/src/auth.ts:93`). A disabled account still has its row and its email. So `gone` occurs only for an actor id with no row. Saying "disabled → `account`" removes a judgement call.
- **The route-matrix entry is two rows.** Each `EXPECTED` row is one path with all four roles (`route-matrix.test.ts:16,201-213`). "Owner 200 on an owned source, 404 on an unreadable one" needs two: for example `/api/history/taak` and `/api/history/plat`.
- **Line numbers.** `Toolbar.tsx:68-74` (line 103) is `SaveState` at `Toolbar.tsx:72-78`, which is the row store's save word. Harmless.

## Round 2, resolved or not

| # | Finding | Status |
|---|---|---|
| S1 | `$nlike` bullets contradict | resolved (line 154 only) |
| S2 | Theatre words in engine tests | resolved for `productie_dag` and `plandag`; a new hit, `opbouw` (S3) |
| S3 | Fixture query with `creates` | partly: `fixture.ts` is in Files; no dataset fits the denial, and the listing tests change (S4) |
| S4 | `by` discriminator, "onbekend" | resolved (lines 242, 246-247, 266) |
| S5 | `limit` two meanings | resolved at line 240; line 237 still says `limit` (S2) |
| S6 | Owner scope on the `creates` dataset | resolved (line 241, test line 256) |
| S7 | `#f=` lifetime and wrong view | resolved (lines 181-184); timing against `settled` open (S7) |
| S8 | One window source | resolved for table, matrix, export; the `#from=` landing fails (B1); `newRow` wording (S5); matrix intersection (S6) |
| S9 | Save-as clause, Terugzetten | resolved (lines 89, 104-105, tests 114-115) |
| S10 | Public view autosave | resolved by threat 6 and spec line 24; `public` arrives too late (S1) |
| S11 | Review Focus 6 row, vacuous fiche test | resolved (line 79; Task 3 Step 5 assertion) |
| S12 | `kind` two meanings | resolved (`batch_kind`, `created`) |
| Notes | `Lhs` type and custom keys; engine-key collisions; undo across records; chunking; Task 5 files; SPEC Sidebar line; matrix navigation | all resolved (lines 41, 206, 248, 240, 279, 188, 187) |

## Premises checked

- An own public view is `editable` only for an administrator; a system or shared one never is → `packages/engine/src/views.ts:62-74,164-176,291-294` → holds (S1)
- The grid's `SavedView` carries `public` before Task 5 → `apps/grid/src/types.ts:150`, `apps/grid/src/engine.ts:83,327` → does not hold (S1)
- `save` returns early on `sending.current`; `duplicate` uses `arrangementOf` today → `apps/grid/src/ui/useSavedViews.ts:144-159` → holds
- The toolbar's `…` holds save-as and revert while modified → `apps/grid/src/ui/Toolbar.tsx:82-85` → holds
- The window feeds rows, away rows, reload, `newRow`, `madeFrom`, export and the empty hints → `App.tsx:209-212,228-230,250,264-266,294,405,409` → holds; the plan names all but `reload` and the hints (Note)
- `newRow` keeps today inside the window → `apps/grid/src/grid/newRow.ts:25-26` → holds (S5)
- `rowsQuery` sends every layout filter plus `from`/`to`; the engine ANDs them → `apps/grid/src/engine.ts:373-386`, `packages/engine/src/rows.ts:29-41` → holds (S6)
- `hash.ts` has only `readHash`/`writeHash`; `from`/`to`/`period` are written by `useWindow` → `apps/grid/src/ui/hash.ts:1-10`, `ui/Window.tsx:96-125` → holds
- e2e `#from=` landings apply to the view they then open → `e2e/dagplanning.spec.ts:56-59,609-611`, `e2e/grid-ux.spec.ts:70-78` → does not hold under the plan's rule (B1)
- App resolves `view` after the saved views load, falling back to `tables[0]` → `App.tsx:182,193-194,201-203` → holds (S7)
- `parseRowsParams` reads `limit` as a 1–5000 row cap; unknown keys pass → `packages/engine/src/params.ts:28,33-42,52-59` → holds
- `CHUNK` is 500 in `rows.ts` → `rows.ts:113` → holds
- `readable` checks only the presence of an owner column; `scopeOf`/`inScope` → `packages/engine/src/access.ts:48-73` → holds
- `readRevisions` checks `inScope`; revisions carry `actor_id`, `batch_id`; a create is the `id` marker → `writes.ts:409-424,259,275,481` → holds
- Undo refuses another account's batch, non-undoable kinds, done batches and batches holding `deleted_at` → `writes.ts:458-474` → holds
- Batch kinds are write, action, undo, import, seed → `packages/engine/src/engine-tables.ts:8` → holds
- The fixture has a dataset with a create writer and no owner column → `packages/engine/test/fixture.ts:175-205`, `validate.ts:69-77` → does not hold (S4)
- `note_lijst` can take `creates: 'note'` without side effects → `validate.ts:69-77`, `app.ts:98-100` → holds
- Engine tests may use "Opbouw" → `scripts/check-vocabulary.ts:44-53` (vocabulary rebuilt and probed) → does not hold (S3)
- Every route-matrix row gives one path and four roles → `packages/engine/test/route-matrix.test.ts:16-60,201-213` → holds (Note)
- Spec R2 states the public-view ruling → `specs/grid-toolbar/spec.md:24` → holds

Files: `/home/ntdst/Sites/worktable/specs/grid-toolbar/plan.md`, `/home/ntdst/Sites/worktable/specs/grid-toolbar/plan-review.md`, `/home/ntdst/Sites/worktable/specs/grid-toolbar/spec.md`.
