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
