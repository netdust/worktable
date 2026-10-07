# Plan review — dagplanning
Reviewed-plan: c7c15bdee8d78d9712c18bf42c1baaf6ccbb2263
Verdict: not ready

## Blocking

**B1. Undoing a removed tag cannot work: the engine refuses to undo a delete, and the delete reply carries no batch.**
- Plan lines: Task 4 "Modify `App.tsx`: create and delete through `create`/`remove` in `api.ts`, pushed to the history like other writes", Task 4 Step 6 ("remove it with ×; it is gone; undo; it is back"), and Review Focus 3 ("undoing the delete brings it back"). The plan's whole premise for R2's "each add or remove is one batch that one undo takes back" is "the writers, the undo and the refusals stay as they are" (Simplest design).
- What the source says:
  - `packages/engine/src/writes.ts:469-473` (`touchedBy`) throws `not_undoable` on any `deleted_at` revision: "a batch holding a delete cannot be undone".
  - `packages/engine/test/batches.test.ts:146` locks that in: "a delete batch is 422 not_undoable".
  - docs/SPEC.md line 54 (Revision) says "a batch holding a delete ... [is] never undone".
  - `packages/engine/src/app.ts:52-55` answers DELETE with `{ id }` only, so there is no batch_id to push. `apps/grid/src/api.ts:174` `remove()` returns `Promise<unknown>`, and `grid/store.ts:314` never pushes a delete to the history.
- What is wrong: the spec's R2 line and SPEC.md disagree. AGENTS.md says to name that and stop, not plan past it.
- Smallest change: put the conflict to Stefan before Task 4. Either:
  - (a) × is not undoable, like every grid delete today. Drop the undo step from Step 6 and Review Focus 3, and keep undo for add only. Or:
  - (b) Stefan amends SPEC.md so a delete batch can be undone. Then the plan gains an engine task: the DELETE reply carries `revision`, and undo restores `deleted_at` through the writer, re-running the duplicate refusal. It needs its own tests.

**B2. `mensen` in a view's visible_fields is refused by the engine's view validation, and sorting or grouping on it is refused by the rows params.**
- Plan lines: Task 4 "Add `mensen` to the seeded Dagplanning view's visible fields" and "a links column becomes a field of type `links`".
- What the source says:
  - `packages/engine/src/views.ts:39-40` `hasColumn` accepts only `source.columns` keys and `id`. `views.ts:144` runs it on `visible_fields` for every POST and PATCH /views.
  - `seed-missing.ts` writes the seeded view raw, so the seed itself works.
  - But the grid's "save a copy" or Save (`api.ts:191-201`, `toStoredView`) re-sends the arrangement and gets 400 `"mensen" is not a column`. Any Dagplanning arrangement a planner tries to keep fails.
  - `params.ts:69-70` / `parseSort` / `parseGroup` give 400 `bad_sort` / `bad_group` if the grid sorts or groups on the new field.
  - `views.ts:345` (`publicRows`) would emit a column with an undefined label for a published view.
- Smallest change, in Task 3: `visible_fields` validation accepts a declared link name (`views.ts`), with one test. `publicRows` skips link keys.
- Smallest change, in Task 4: the links column is `sortable = false`, not groupable and absent from the filter fields, with a vitest assertion.

## Should fix

**S1. The rule for `key` on a query is left to the executor.**
- Plan lines: Task 3 Step 1 ("pick the check that holds for both kinds and state it in the error") and Task 4 ("Pick the `key` check from Task 3 that holds here"). Threat 4 claims validation refuses "a key that is not a relation back to the source".
- What the source says: for a query that cannot be checked from the declaration.
  - Dagplanning's `id` and `activiteit_id` carry no `relation` (`packages/theatre/src/queries.ts:47-48`).
  - `pointsAt` (`access.ts:52-55`) treats `id` as self only for datasets.
  - `creates` (SPEC.md Query row; `validate.ts:65-75`) only says where a new row goes. It does not promise `id` is that dataset's id. Today only a theatre test (`packages/theatre/test/writer.test.ts:238`) asserts that id equals activiteit_id.
- Sound statement:
  - For a dataset source: `linkDataset.columns[key].relation === source.name`.
  - For a query: it must declare `creates`, and `linkDataset.columns[key].relation === query.creates`. The proposed SPEC line must add "a query's `id` is the id of the dataset it creates" as a declared contract.
  - Otherwise the plan must say a mislabelled query silently attaches wrong rows. That is not a scope leak, since reads are still scoped on the link dataset.
- Fix: write this rule into Task 3 Step 1, with a denial test for a query without `creates` and one whose `creates` mismatches the key's relation.

**S2. Reloading keeps only the week, not the chosen period, and ‹ › cannot step a month with `shift`.**
- Plan lines: Simplest design ("keeps the existing window state and hash. Only its control moves ... functions over `weekOf`/`shift`"), Task 2 Step 1 (› by a month), and Review Focus 5 / Step 6 ("reload (the period stays)" after Deze maand).
- What the source says:
  - `apps/grid/src/ui/Window.tsx:60-63` `fromHash` reads only `from` and snaps it to `weekOf`, so Deze maand and Van–tot fall back to a week on reload.
  - `shift` (`Window.tsx:30-34`) steps by days, and months are not fixed lengths.
  - `useWindow` is typed `DateWindow`, not `Partial`.
- Fix: Task 2 must say:
  - `fromHash` honours a valid `to >= from`, and falls back to `weekOf(from)` when `to` is absent. This fallback keeps every e2e landing working (see S3).
  - `period=all` gives `{}`.
  - The step unit comes from the window's shape: Mon–Sun is a week, 1st to last is a month, anything else steps by its span. A `shiftMonth` helper does the month step.
  - `formatWindow` gains month, range and Alles labels.

**S3. Task 2's e2e list misses most of the suite's dependency on the window.**
- Plan line: Task 2 "Grep `nv-window`, `Vorige week`, `Volgende week` and `formatWindow` in `e2e/`".
- What the source says:
  - Every spec lands on `/#from=<date>` with no `to`: grid-ux.spec.ts lines 130, 185, 327, 364, 393, 437, 475, 689 and 702, plus rail-tree, title-line, step-0a to step-0e and step-1. They rely on from-only meaning "that week".
  - `e2e/grid-ux.spec.ts:482` asserts `.nv-window__week` reads "Week 12 · 22–28 mrt".
  - `e2e/step-0e.spec.ts:93` and `e2e/step-1.spec.ts:260` expect "Geen rijen in deze week", which Step 4 renames to "… periode".
  - Unit tests `apps/grid/src/ui/Window.test.tsx` and `grid/Grid.test.tsx` reference the control.
- Fix: add these to the Files list, and state the from-only fallback as the rule that keeps the landings unchanged.

**S4. Alles has no rule when the user moves to a matrix.**
- Plan line: Task 2 Interfaces (`unbounded` true only for table).
- What the source says: one `useWindow` (`App.tsx:161`) feeds every view. A matrix read with `cells=1` and no `from`/`to` is 400 `window_required` (`packages/engine/src/params.ts:118-120`).
- Fix: state that a matrix under Alles reads, and shows, the current week. Add the step to the period-chip e2e: pick Alles in Dagplanning, then open Toewijzingen and see rows, not an error.
- Answers to the brief's checks:
  - Engine: accepts no `from`/`to`; `params.ts:28-31` makes both optional.
  - Grid: `engine.ts:367-368` `rowsQuery` omits them and `api.ts` `rows()` passes `{}` through.
  - Read limit: `MAX_LIMIT` 5000, which the grid already shows as "5000+" (`cutAt`). `linksOf` in 500-row chunks covers it.
  - `newRow` (`grid/newRow.ts:26`) falls back to today with `{}` once typed `Partial`.

**S5. Task 4 does not list the existing tests that pin the Dagplanning view's fields and headers.**
- `packages/theatre/test/seed-missing.test.ts:14` (`DAGPLANNING`) and `packages/theatre/test/grid-ux.test.ts:138` assert the seeded visible_fields. `e2e/grid-ux.spec.ts:486-493` asserts the header list ending in Locatie, Status.
- Fix: add them to the Task 4 Files, with Mensen after Locatie.
- On the brief's question: `--seed-missing` does carry `mensen` to existing databases. `seed-missing.ts` `updateView` diffs `visible_fields` over `DECLARED` for the system-owned view and leaves a public one alone. The seed-missing test should assert `mensen` lands.

**S6. Review Focus 6 is wrong about fiche, and no Test map row backs it.**
- Plan line: "Fiche (no links, but dated sources) renders the Periode chip".
- What the source says: fiche declares no `date` on any source (grep of `packages/fiche/src` finds none).
- Fix: "Fiche renders no Periode chip and nothing else new". Add `expect(page.locator(<chip>)).toHaveCount(0)` to `fiche-renders-as-before` (`e2e/grid-ux.spec.ts:640`), and point this line at that row.

**S7. Two Task 3 tests are vague.**
- "one query per link column per page": Step 1 offers "a counted `db` wrapper ... whichever the existing tests already use; otherwise assert the result for 300 parents". No existing test counts queries (`matrix.test.ts` and `rows.test.ts` do not), and the fallback does not prove the property. Fix: name the counter, a wrapped `db.select` spy, or drop the claim to "correct for 600 parents (two chunks)".
- Threat 2 (title only, never the target row) has no assertion in Step 1. Fix: add one, e.g. the link entry's keys are exactly `id, target, title, state`, with no target columns.

## Note

- **N1. Wrong file for the filter bar.** Task 2 names `Filters.tsx` "or the filter bar container". The scope chip lives in `apps/grid/src/grid/GridBar.tsx:34`, and the matrix has its own bar (`App.tsx:371`). `filters` is `null` when `fields.length === 0` (`App.tsx:277`), so a dated source with no filterable field would lose the always-present chip. Name GridBar and the matrix bar.
- **N2. Ambiguous test file for Test map row 2.** The row says "new or the existing theatre test file". `packages/theatre/test/writer.test.ts:220` already has `describe('dagplanning')`, so name it.
- **N3. `links` should join the overwritten keys.** It is a row key the engine adds, so it belongs in `OVERWRITTEN` (`validate.ts:85-88`), or validation should refuse a column named `links`. Also, `title` from `withLookups` follows the link dataset's `title.via`, which equals `target` only for toewijzing. Use `lookups[target]?.title ?? row.title` so the generic rule matches R3.
- **N4. One alternative is missing from Simplest design.** Serving `cells` for a query whose `creates` is a matrix down source would reuse `cellsOf` with no new declaration. It is correctly rejected because cells need a window of 92 days at most (`params.ts:118-123`), which rules out Alles, and because it ties people to a matrix declaration. One line in Simplest design would make the choice of `links` explicit. The group_concat rejection holds.
- **N5. Task 1 holds as written.** The three `writes` validate: no target is readonly and activiteit has an updating writer. Omschrijving is the query title, and `updateThrough` (`api.ts:157`) already handles the title. `isReadonly` (`grid/engine.ts:106`) makes the column editable once `writes` is present.

## Premises checked

- `cellsOf` reads the join rows chunked with deleted_at, scope and inArray → `packages/engine/src/rows.ts:116-149` → holds
- `withLookups` exposes titles only, via the title rule → `rows.ts:69-88` → holds
- `scopeOf` / `readable` behave as the threat model says (owner without an owner column is 'none' / unreadable) → `access.ts:47-69` → holds
- Toewijzing has an owner column (persoon_id) and title `{via persoon_id, else naam}` → `packages/theatre/src/datasets.ts:158-160` → holds
- Toewijzing state tones are warn/ok/bad/bad → `datasets.ts:187` → holds
- Dagplanning has no owner column, so an owner gets 404 on it → `queries.ts:35-73`, `access.ts:47` → holds (threat 1 is proven only at the engine level)
- `writesActiviteit` exists and `locatie_id` is readonly + inherited → `queries.ts:33,58-65` → holds
- Dagplanning id = activity id, and `creates: 'activiteit'` → `queries/dagplanning.sql`, `queries.ts:43` → holds, but nothing in the engine guarantees it (S1)
- toewijzingWriter creates, deletes and refuses a duplicate person → `writers.ts:131-157` → holds
- POST/DELETE /rows/:dataset run the writer and the delete order → `app.ts:40-55` → holds
- "undo stays as it is" covers removing a tag → `writes.ts:469-473`, `app.ts:54`, SPEC.md:54 → does not hold (B1)
- A visible field `mensen` is accepted by the view routes → `views.ts:39-40,144` → does not hold (B2)
- `--seed-missing` brings the system-owned Dagplanning view up to its declaration, including visible_fields → `seed-missing.ts:40,108-125` → holds
- The hash keeps the period (`from`, `to`) on reload → `Window.tsx:60-63` → does not hold for anything but a week (S2)
- The presets are "functions over `weekOf`/`shift`" → `Window.tsx:25-34` → does not hold for a month (S2)
- Alles is accepted by the engine and by `rows()` → `params.ts:28-31,113-125`; `grid/engine.ts:367-368` → holds for table; a matrix refuses it (S4)
- The e2e suite depends on the week control only through `nv-window` / week labels → grep of `e2e/` → does not hold; it also depends on `#from=` landings and "Geen rijen in deze week" (S3)
- RelationPicker can be reused for the person search → `grid/cells/RelationPicker.tsx:37` (single-pick `onPick`) → holds as a base; multi-pick is new work, as the plan says
- Fiche has dated sources → `packages/fiche/src` → does not hold (S6)
- `api.ts:89` `rows()` accepts `{}` → `api.ts:88-93` → holds
