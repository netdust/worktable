# Plan review — default-view
Reviewed-plan: a85d83674f10d193be9bbebbd5ffb3c4f1f490cc specs/default-view/plan.md
Verdict: ready with fixes

Almost every premise the plan rests on holds in the source. Nothing is Blocking. There are three Should-fix findings and a few Notes.

## Blocking
None.

## Should fix

**S1. Deleting and restoring a view can leave two defaults in one node, and no task covers it.**
- **Where:** Global Constraints says "At most one default per rail node, held by the database write". The Threat model Deferrals say "restoring it restores its mark only if the node still has none". Task 1 Step 3 unmarks with `UPDATE saved_view SET is_default = 0 WHERE deleted_at IS NULL AND id != ? AND source IN (…)`.
- **Source:** `DELETE /views/:id` (`packages/engine/src/views.ts:425-427`) clears `public`, `share_token` and `for_owners`, but nothing clears `is_default`. Restore (`views.ts:430-434`) and `restoreView` in `--seed-missing` (`seed-missing.ts:168-181`) bring the row back as it was. `removeUndeclared` (`seed-missing.ts:250-252`) also soft-deletes.
- **What goes wrong:** an administrator marks A, deletes A, marks B (A keeps `is_default = 1` because the unmark skips deleted rows), then restores A. The node now has two defaults. No step implements the "only if the node still has none" behaviour from the Deferrals, and no test covers it.
- **Smallest change:** add `is_default: 0` to the `gone` object of the DELETE route. That follows the existing precedent: "A delete also revokes the share token and the owners' access, so a restore never brings either back" (`views.ts:424`). Also drop `deleted_at IS NULL` from the unmark UPDATE. Then reword the Deferral to "a restored view comes back unmarked". Add one Task 1 test: mark, delete, mark another, restore, then assert exactly one default.

**S2. The spec of record is not updated, and it contradicts the per-node ruling.**
- **Where:** no task touches `docs/SPEC.md`.
- **Source:** `docs/SPEC.md:74` defines `is_default` as "one per source, shared views only". `docs/SPEC.md:83` says "every source has its own default view, opened when the source is chosen or linked". The routes row at `docs/SPEC.md:152` has neither new route. The 2026-11-06 ruling (one per rail node, administrator only, rail only, the lock renamed) only reached `specs/work-model/spec.md`; commit 425f143 did not touch `docs/SPEC.md`.
- **Why it matters:** AGENTS.md says "docs/SPEC.md is the spec of record. Changing scope means editing it first", and "If this file and the spec disagree, the spec wins". As written, the plan builds against the spec of record.
- **Smallest change:** add a Task 0, or a first step in Task 1, that edits `docs/SPEC.md`:
  - `SavedView`: "one per rail node (a dataset and the queries `of` it), shared views only, a dashboard never".
  - The Work model "Default view" sentence: per node, administrator only, the rail only.
  - The routes row: `PUT`/`DELETE /views/:id/default`.
  - The Administrator row at `:110`.
  - The four error codes.
  - The "Systeemweergave" lock wording.

**S3. The no-hash landing change goes past the "rail only" ruling.**
- **Where:** Task 3 Files lists `App.tsx (:250 landing)`. Step 1 tests "the landing view without a hash is the first node's default when it has one".
- **Source:** the spec R4 2026-11-06 ruling says "rail only with links noted". `App.tsx:249-250` lands on `dashboards[0] ?? tables[0]?.views[0]`, and Studio seeds a dashboard (`packages/studio/src/seed.ts:428`), so Studio never reaches this path anyway.
- **Smallest change:** drop the landing change and its test, or get Stefan's one-line ruling to add it to R4.

## Note

- **N1. The role has no path from App to ViewList as the plan lists the files.** Task 4 Files names "App.tsx (:680 passes the role)", but neither `Rail` nor `ViewList` takes a role prop. Rail forwards `actions` straight to `ViewList` (`Rail.tsx:87`). Simplest fix: App adds the mark action to `actions` only when `role === 'administrator'`, so ViewList offers it whenever the action is present and `Rail.tsx` stays untouched. Otherwise add `Rail.tsx` to the Files list.
- **N2. Naming the `ViewActions` file.** The `ViewActions` type lives in `ViewList.tsx` (Rail imports it from `./ViewList`). `useSavedViews.ts:222-226` only builds the object. Name both files.
- **N3. Rail.tsx:50 needs no change.** The fallback there is only used when no `onTable` is passed. App passes `onTable={openTable}` (`App.tsx:679`), and `openTable` calls `lastIn`. Changing `lastIn` is enough.
- **N4. `validate.ts` has no seeded-view checks today, and `DomainError` is keyed to a source.** No check in `validate.ts` reads `domain.views`. `DomainError` takes `(source, column, message)` (`validate.ts:24-40`), so "beside the other domain checks" is new ground. Also refuse `default: true` on a dashboard seed there. Put `nodeOf` in `registry.ts` rather than `views.ts`, so `validate.ts` → `views.ts` does not create an import cycle (`migrate.ts` already imports both).
- **N5. A seed's `default` leaks into the view row types.** `SavedViewRow = Omit<SavedViewSeed, … 'locked'>` (`views.ts:19`), so a new `SavedViewSeed.default?` reaches `SavedViewRow` and `ViewFields`. Omit `'default'` there as `locked` is omitted, so a seed-only field never reaches `stored()`. The column is rightly named `is_default`: `insertRows` (`migrate.ts:156`) and `addView` (`seed-missing.ts:128`) interpolate column names without quotes.
- **N6. `touched()` works per field, so the change is one condition.** `revise` writes one revision row per field (`writes.ts:564-570`). "Ignore revisions whose only field is `is_default`" is therefore just `AND field != 'is_default'` in `touched()` (`seed-missing.ts:120`). Unmark the other view through `save()` rather than a raw UPDATE, so both sides of a move carry a revision, as the mark does.
- **N7. The route-matrix rows should use view 1.** Views 2-5 in the matrix are inserted unshared and owned by the signed-in actor (`route-matrix.test.ts:309-314`). `PUT /api/views/3/default` would answer an administrator 400 `not_shared`. Use `/api/views/1`, the fixture's seeded shared view, for the administrator's 200.
- **N8. The Deferrals overstate public and for-owners views.** "A public or for-owners view can be a default (it is shared)" is not always true: public and for-owners views are not necessarily `shared = 1`, and the matrix fixture inserts them with `shared` 0. An unshared public view gets 400 `not_shared`. Reword it to "if shared".
- **N9. Task 3's pre-plan database test does not say how to build that database.** Step 1 tests "`--seed-missing` on a database made before this plan" but never shows how to make one, for example drop the column and reset the `saved_view` hash row in the migrations table. Show the setup.
- **N10. The simplest-design paragraph holds, with one caveat.** A boolean on the view does avoid a stale node key. The converse case goes unmentioned: if a query's `of` changes, two nodes can merge with two defaults. The grid takes the first `default` it finds, so the result is deterministic. A one-line ruling at execution time is enough; no change needed now.
- **N11. The new mark sits beside the lock.** A seeded default view needs two marks, the Systeemweergave lock and the Standaardweergave default. Today `Mark` (`ViewList.tsx:34-44`) renders one, so this is a small extension, not a premise problem.

## Premises checked
- `sharing()` refuses a non-administrator and a service account → `views.ts:448-453` → holds
- `shareable()`: 404 `unknown_view` for a colleague's unshared or a deleted view; one's own unshared view passes, so 400 `not_shared` is reachable → `views.ts:455-460`, `:246-249` → holds
- `shareRoutes` at :520-555 runs each change in one `immediate` write → `views.ts:520-555`, `:521` → holds
- `SavedViewRow`/`outOf` at :19-33/:93-108 → `views.ts:19`, `:93` → holds
- `/views` filters by `readable`, so an unreadable default is not listed → `views.ts:369-380` → holds
- `save()` writes a revision with the actor → `views.ts:178-185` → holds
- A boolean with a default is added by ALTER, not a rebuild → `schema-diff.ts:78`, `:90-95`; `saved-view.ts:45` (`for_owners`, the same shape) → holds
- `SavedViewSeed` at :275-287 → `declare.ts:275-287` → holds
- `seedDomain`/`systemRow` at :162-193 → `migrate.ts:162-193` → holds
- `seedViews` at :223-232 → `seed-missing.ts:223-232` → holds
- `touched()` at seed-missing.ts:119 counts any revision by a non-system actor, so the mark would trip it unless filtered → `seed-missing.ts:118-122`, `:206`, `:246` → holds (the plan's fix is needed and correct)
- `DECLARED` does not include `is_default`, so a reseed never rewrites a mark → `seed-missing.ts:43` → holds
- Grid node key is `view.of ?? view.table` → `useSavedViews.ts:77-80` → holds
- `of` is served into the grid table definition → `engine.ts:318` → holds
- `groupTables` places a query's views under its `of` dataset → `tables.ts:26-39` → holds
- `lastIn` at :201-204 = last used, else first → `views.ts` (grid) `:200-203` → holds
- Prefs last only for the visit ("the view last used in the visit") → `api.ts:416-424` → holds
- `EngineView` :111-126, `toSavedViews` :440-465 → `engine.ts:111-126`, `:439-465` → holds
- Rail.tsx:50 fallback → `Rail.tsx:50` → holds, but App never uses it (N3)
- App.tsx:250 landing; :681 gates on administrator → `App.tsx:250`, `:681` → holds
- App.tsx:680 passes the role on to ViewList → `App.tsx:679`, `Rail.tsx:87` → does not hold as written (N1; the fix is small)
- `choices()` :46-58, `Mark` :33-44 → `ViewList.tsx:46-58`, `:33-44` → holds
- `ViewActions` :222-226 in useSavedViews.ts → the type is in `ViewList.tsx`; `useSavedViews.ts:222-226` builds it → partly holds (N2)
- i18n :218-219 lock strings → `i18n.ts:218-219` → holds
- e2e lock wording at grid-ux.spec.ts:642-645 → `e2e/grid-ux.spec.ts:642`, `:645` → holds
- Studio "Per fase" :367-374, Taken :375-391, Agenda :392-399 → `seed.ts:367`, `:375`, `:392` → holds
- taak's first options column is `status`, so a board with no `group_by` lands on status → `datasets.ts:356-369` → holds
- Agenda belongs to the `agendapunt` node → `queries.ts:88` (`of: agendapunt.name`) → holds
- Service accounts exist in the route matrix → `route-matrix.test.ts:294` → holds
- serve.ts:195 runs `--seed-missing` → `serve.ts:193-196` → holds
- Sections.tsx:121-124 "alle n" link → `apps/grid/src/grid/drawer/Sections.tsx:121-123` → holds (path is `grid/drawer/`)
- Test files and commands exist (`App.test.tsx`, `views.test.ts`, `ViewList.test.tsx`, `Toolbar.test.tsx`, `@worktable/grid` vitest, `bun run gate`, `bun run check`) → `apps/grid/package.json:2,8`; `package.json:14,18` → holds
- `validate.ts` has domain checks to sit "beside" → `validate.ts` has no check that reads `domain.views` → partly holds (N4)

Coverage: every R4 clause has a task:
- marking from the menu, and unmarking the other: Tasks 1 and 4
- the seed marks a default: Task 2
- no mark opens the first view: Task 3
- one's own unshared view is never a default: Task 1
- Studio's three defaults: Task 3
- per node: Tasks 1 and 3
- administrator only: Tasks 1 and 4
- the lock renamed: Task 4

Every Test map row has its tests in its task. Every Review Focus line points at a row. Every threat has a test step, except the delete and restore path (S1) and the missing `docs/SPEC.md` update (S2).
