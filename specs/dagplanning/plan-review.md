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

---

# Plan review — dagplanning (round 2)
Reviewed-plan: 2238ac39be3e84a40c6e3c04a068b58997652c33
Verdict: not ready

There is one Blocking finding and it needs a one-line fix. All of round 1's findings are resolved or close to it. The new findings come from the round-2 edits: the confirm, the saved-view round trip, the undo step order and the matrix under Alles.

## Round 1 findings

| # | Status | Evidence in the new plan |
|---|---|---|
| B1 | Resolved, with one new problem (B-new-1) | × is final and not pushed. Add is pushed. A tag not in the default state asks first. Review Focus 3 and the people-tags e2e match Stefan's ruling and spec R2. But the "existing `Confirm`" it relies on does not exist (see below). |
| B2 | Partly resolved | Engine side is fixed: `views.ts` visible_fields accepts a link name, `publicRows` skips it, `params.ts` sort/group stay 400. The grid side is still open: `toStoredView`/`fromStoredView` drop the link, so the "saves" check passes without proving the link is kept (S-new-1). |
| S1 | Resolved | Threat 4 and Task 3 Step 1 state the rule for a dataset and for a query (`creates`, the key's relation equals `creates`, the id promise). Both denials are tested. |
| S2 | Resolved | `fromHash` honours `to` and falls back to `weekOf(from)`. `period=all` gives `{}`. `shiftMonth` steps a month. `formatWindow` gets month, range and Alles labels. The step unit comes from the window's shape. All of it is tested in Period.test Step 1. |
| S3 | Mostly resolved | The listed lines are correct (grid-ux:482, step-0e:93, step-1:260, the from-only fallback). One gap: see N-new-1. |
| S4 | Resolved | Interfaces says a matrix under Alles reads and shows the current week. The e2e opens Toewijzingen after Alles. The e2e's "shows rows" check is clock-dependent (S-new-4). |
| S5 | Resolved | `seed-missing.test.ts:14`, `grid-ux.test.ts:138` and `e2e/grid-ux.spec.ts:486-493` are listed, with Mensen after Locatie. |
| S6 | Resolved | Review Focus 6 is corrected. `toHaveCount(0)` is added to `fiche-renders-as-before` (`e2e/grid-ux.spec.ts:640`). |
| S7 | Resolved | The query-count claim is replaced by "600 parents, two chunks". A test asserts the link entry's keys are exactly `id, target, title, state`. |
| N1 | Partly resolved | GridBar is named. The matrix's bar is placed at `App.tsx:371`, but it renders in `apps/grid/src/matrix/Matrix.tsx:383` (`{filters}`). See N-new-2. |
| N2 | Resolved | Row 2 names `writer.test.ts` `describe('dagplanning')` (:220). |
| N3 | Resolved | `links` joins `OVERWRITTEN`. Title is `lookups[target]?.title`, else the row's own title. |
| N4 | Resolved | The cells alternative and its rejection are in Simplest design, and the reason holds (`params.ts:118-123`). |

## Blocking

**B-new-1. "The existing `Confirm`" is the magic-link sign-in screen, not a confirm dialog.**
- Plan, Task 4 Files (App.tsx bullet) says: "first asks 'Toewijzing van <titel> verwijderen?' with the existing `Confirm`".
- In the source, `apps/grid/src/ui/Confirm.tsx:14` is `Confirm({ token, onSignedIn })`. It calls `consumeLink(token)` and renders a sign-in button. `App.tsx:94` mounts it only for `#/auth/<token>`.
- The grid has no question dialog. The only delete confirmation is the two-press `DeleteRow` in `apps/grid/src/grid/Grid.tsx:318-336` ("Verwijderen", then "Zeker?").
- The people-tags e2e needs a question with an Annuleren button ("Annuleren keeps it"), and nothing in the grid provides one.
- Smallest change: in Task 4, add a new small confirm, for example a Popover anchored on the tag with the question, "Verwijderen" and "Annuleren". Name its file, or put it inside `Links.tsx`. Drop "existing `Confirm`". Links.test already drives it through `onConfirm`, so add one test that Annuleren does not call `onRemove`.

## Should fix

**S-new-1. The grid's saved-view round trip drops the link column, so Review Focus 7 passes without proving "kept in a saved view" (R3).**
- Plan: Task 4 "`apps/grid/src/engine.ts`, `types.ts`: a links column becomes a field of type `links`". Review Focus 7 and e2e Step 6: "save a copy of the view showing Mensen: it saves".
- Source:
  - `apps/grid/src/engine.ts:227` has `fieldsOf = Object.keys(source.columns)…`. The plan serves links under `sources[s].links`, not `columns`.
  - `toStoredView` (:275-277) keeps only ids in `fieldsOf`, so `mensen` never reaches `visible_fields`. The POST succeeds because the link name was never sent.
  - `fromStoredView` (:237-239) drops `mensen` from `order` and never marks it hidden. So the seeded view's `…'locatie_id', 'mensen', 'status'` order is lost, and the grid-ux header assertion (Mensen after Locatie) will not hold.
- Smallest change, in Task 4:
  - Name `engine.ts:227` `fieldsOf`: it includes the source's link names.
  - Add a vitest in `apps/grid/src/engine.test.ts` that `toStoredView`/`fromStoredView` round-trip `mensen`, both shown in place and hidden.
  - Extend the e2e step: reopen the saved copy and see Mensen where it was saved.

**S-new-2. Owner denial (Threat 1) and the `/schema` omission (Threat 5) cannot both be proven with the one fixture link the plan describes.**
- Plan: Task 3 Test, "`taak` gaining a `helpers` link over a new generic join dataset such as `hulp` (`taak_id`, `project_id` target, `state`)". Step 1 asks for an owner who sees only its own link rows (Threat 1), and for "an owner who cannot read the link dataset gets no `links` entry" (Threat 5).
- Source: `packages/engine/src/access.ts:48-49` makes `readable` false for an owner on a dataset without `owners`. `scopeOf` (:58-64) then gives `'none'`.
  - If `hulp` declares `owners: { owner: 'project_id' }`, Threat 5's test has nothing to deny.
  - If it does not, Threat 1's test returns zero rows and passes without proving anything.
- Smallest change: the fixture declares two links. One is over an owned join (`owners: { owner: 'project_id' }`) for Threat 1; that test asserts the owner's own link row is present and another project's row is absent, by id. The other is over a dataset with no owner column, for Threat 5.

**S-new-3. Two steps in the people-tags e2e cannot run as written.**
- "add a person; … reload; it stays; undo; the added tag is gone" (Task 4 Step 6). The undo history lives in `useState` (`apps/grid/src/ui/App.tsx:167`, `createHistory` in `ui/history.ts`). A page reload empties it, so the undo after a reload has nothing to undo.
  - Fix: undo before the page reload, then re-add and reload to show the tag persists.
- "adding the same person twice shows the writer's refusal". The picker shows a linked person checked, and unchecking it calls `onRemove` (Step 1), so the UI cannot send a duplicate.
  - Fix: create the same Toewijzing through the API after the page has loaded (a stale row), then pick that person. The refusal comes from `checkAssignee` (`packages/theatre/src/writers.ts:136-138`).

**S-new-4. "It shows rows for the current week" depends on the real date.**
- Plan: Task 2 Step 6, "open the Toewijzingen matrix: it shows rows for the current week".
- Source: the seed is on fixed dates (`packages/theatre/src/seed.ts:33-40`, 2026-10-12…), and every e2e lands on a fixed `#from=`. No spec controls the clock (no `page.clock` in `e2e/`).
- Smallest change: either freeze the page clock in the seeded week (`page.clock.setFixedTime('2026-10-14')`) before picking Alles, or assert the chip reads the current week and no error shows, without counting rows.

**S-new-5. The period's proposed docs/SPEC.md line has no task.**
- The spec lists two proposed SPEC lines: the `links` one and the Skin needs / Sidebar period-chip one.
- Only Task 3 Step 5 adds lines, and only the `links` ones. The current working-tree diff of `docs/SPEC.md` holds neither period line.
- Smallest change: Task 2 gets a step that adds the period line to the `docs/SPEC.md` working-tree diff, unstaged.

**S-new-6. The grid cannot know which state is "the default" from the served link shape.**
- Plan: Task 3 Interfaces `/schema` `links[name].state?: { options, tones }`. Task 4 confirms "whose state is not the state column's default".
- Source: the default is declared on the link dataset's column (`packages/theatre/src/datasets.ts:178`, `default: 'uitgenodigd'`), and the planned `state` object leaves it out.
- Smallest change: serve `default` in `links[name].state`, and assert it in Task 3 Step 1 and Task 4 Step 2.

## Note

- **N-new-1. The grep list misses the empty-state text in unit tests.** Task 2's "Tests to update" greps `nv-window`, `Vorige week`, `Volgende week` and `formatWindow`. Renaming `noRowsInWindow` (`i18n.ts:9`) also breaks about 45 `findByText('Geen rijen in deze week')` in `apps/grid/src/ui/App.test.tsx`, plus `Window.test.tsx:116,124`, `Grid.test.tsx:38,176,184` and `SignIn.test.tsx:138`. Add that string to the grep list.
- **N-new-2. Matrix bar location.** The matrix's bar renders `{filters}` at `apps/grid/src/matrix/Matrix.tsx:383`, not in `App.tsx`. Since `filters` is `null` when there are no filterable fields (`App.tsx:276`), name `Matrix.tsx` in Task 2's Files, or pass the chip as its own prop.
- **N-new-3. Undo after ×.** If a tag added in this tab is then removed with ×, the next undo hits the add's batch. `planUndo` then answers 409 `changed_since` on `deleted_at` (`packages/engine/src/writes.ts:496`). Push the add with `id: linkId` and call `history.forget(dataset, linkId)` on ×. This matches what `grid/store.ts` does for a row delete.
- **N-new-4. Domain word in the grid.** "Toewijzing van <titel> verwijderen?" would hard-code a domain word in `apps/grid/src/i18n.ts`, and the grid holds none today. Build the sentence from the link dataset's served label, or the link's `label`, plus the title.
- **N-new-5. View sort/group scope.** `views.ts` `hasColumn` (:39) is shared by `columnsOf` for `sort` and `visible_fields` and by `groupOf`. Make Task 3's views test assert that `POST /views` with `sort: ['<link>']` or `group_by: '<link>'` is 400. Otherwise widening `hasColumn` itself would store a view whose every read is 400 `bad_sort`.
- **N-new-6. Van–tot in a matrix.** A Van–tot range longer than 92 days is 400 `window_too_wide` for a matrix (`params.ts:121-123`). The spec is silent, so this needs a ruling at execution: cap Van–tot when the skin is not `unbounded`, or clamp in the matrix read.
- **N-new-7. Export under Alles.** `useWindow` becoming `Partial` touches `exportSheet`/`xlsx.ts` `fileName`/`sheetName` (`DateWindow | null`) through `App.tsx:284`. Under Alles, pass `null`, which gives the window-less file name. One line in Task 2 avoids a ruling at typecheck time.
- **N-new-8. Unnamed test files.** Task 2's `period-chip` e2e and Task 4 Step 2's theatre test do not name a file. Use `e2e/dagplanning.spec.ts` and `packages/theatre/test/writer.test.ts` `describe('dagplanning')`.
- **N-new-9. Write reply has no links.** The dataset write reply (`writes.ts:398` `rowOf`) carries no `links`. That is harmless for Dagplanning: query writes are read again through `GET /rows` (`apps/grid/src/api.ts:149-160`). A future dataset with links would lose its tags until the next read after an edit.

## Premises checked
- `views.ts` `hasColumn` accepts only columns and `id`, used for visible_fields, sort and group → `packages/engine/src/views.ts:39-40,103-114` → holds (the plan changes it)
- `publicRows` builds columns from `visible_fields` → `views.ts:345` → holds
- sort/group on a non-column is 400 → `params.ts:69-70,94-108` → holds
- Matrix read without a window is 400 `window_required` and is capped at 92 days → `params.ts:118-123` → holds
- `OVERWRITTEN` holds title and revision → `validate.ts:85-88` → holds
- `checkCreates` only checks the dataset has a create writer → `validate.ts:65-75` → holds; the plan adds the id promise
- toewijzing.activiteit_id relates to `activiteit` = Dagplanning `creates` → `datasets.ts:174`, `queries.ts:43` → holds
- `cellsOf` pattern (chunks of 500, `deleted_at`, scope, `inArray`, `withLookups`) → `rows.ts:116-149` → holds
- `/rows` route adds cells only on `cells=1` → `app.ts:180-195` → holds
- `scopeOf`/`readable` for an owner → `access.ts:47-64` → holds (S-new-2)
- `isReadonly` = readonly, or a query column without writes → `apps/grid/src/engine.ts:106-107` → holds, so dropping `readonly` on `locatie_id` is needed and correct
- `updateThrough` reads the query row again after a write → `apps/grid/src/api.ts:149-160` → holds (Locatie's grey flag comes back)
- `writesActiviteit` key `activiteit_id` → `queries.ts:33` → holds
- Toewijzing state default `uitgenodigd` and its tones → `datasets.ts:175-188` → holds (not served in links, S-new-6)
- Duplicate person refused by the writer → `writers.ts:136-138` → holds
- A delete batch is not undoable; undoing a create deletes the row → `writes.ts:469-473,488-496` → holds (the B1 ruling matches)
- "the existing `Confirm`" is a confirm dialog → `apps/grid/src/ui/Confirm.tsx:14` → does not hold (B-new-1)
- The undo history outlives a page reload → `App.tsx:166-167` (useState) → does not hold (S-new-3)
- `fromHash` reads only `from` → `apps/grid/src/ui/Window.tsx:60-63` → holds; the plan widens it
- `shift` steps by days → `Window.tsx:30-34` → holds; `shiftMonth` is added
- `rows()`/`rowsQuery` pass `{}` through → `api.ts:89-94`, `engine.ts:356-370` → holds
- `newRow` takes `DateWindow | null` → `apps/grid/src/grid/newRow.ts:24-26` → holds; the plan widens it
- The scope chip is in GridBar → `apps/grid/src/grid/GridBar.tsx:34` → holds
- The matrix bar is in `App.tsx:371` → `apps/grid/src/matrix/Matrix.tsx:383` → does not hold exactly (N-new-2)
- `filters` is null without filterable fields → `App.tsx:276-278` → holds
- The links field survives the grid's stored-view translation → `apps/grid/src/engine.ts:227,237-239,275-277` → does not hold (S-new-1)
- `filterFields` and `GROUPABLE` are by field type → `grid/filter.ts:35-43`, `GridBar.tsx:23` → holds
- `RelationPicker` is single-pick over `records(model)` → `grid/cells/RelationPicker.tsx:37` → holds
- Cited test lines: `seed-missing.test.ts:14`, `grid-ux.test.ts:138`, `writer.test.ts:220`, `e2e/grid-ux.spec.ts:482,486-493,640`, `step-0e.spec.ts:93`, `step-1.spec.ts:260` → hold
- Seeded views pass the saved-view rules → `packages/theatre/test/theatre.test.ts:24` → holds; it will also check `mensen` once Task 3 lands
- `state` is an allowed engine word → `scripts/vocabulary-allow.txt:7` → holds
- docs/SPEC.md working tree already has the period line → `git diff docs/SPEC.md` → does not hold (S-new-5)

---

# Plan review — dagplanning (round 3)
Reviewed-plan: c44b053a14a7191711bd9b3b28ed4666703eb9d9
Verdict: not ready

All of round 2's findings are fixed except one, and that one now disagrees with the spec. The blocking finding is in Task 0: it names `toSchema` as the place to change, but the code that puts views under a model node is elsewhere. Done as written, the query views either disappear or get saved on the wrong source. The fix is a small rewrite of Task 0's Files and Interfaces.

## Round 2 findings

| # | Status | Evidence in this plan |
|---|---|---|
| B-new-1 | Resolved | The confirm is now a new popover inside `Links.tsx`. Links.test covers both buttons: Verwijderen calls `onRemove` and Annuleren does not. |
| S-new-1 | Resolved | `fieldsOf` (`engine.ts:227`) is named. Step 1b has the vitest round trip. The e2e reopens the saved copy. |
| S-new-2 | Resolved | The fixture gets two links: one over an owned join (Threat 1, asserted by id) and one with no owner column (Threat 5). |
| S-new-3 | Resolved | Undo comes before the reload. The duplicate is a stale row created through the API (`checkAssignee`). |
| S-new-4 | Resolved | The step no longer counts rows. It checks that the chip reads the current week and that no error shows. |
| S-new-5 | Resolved | Task 2 Step 6b adds the period line to the `docs/SPEC.md` working-tree diff, unstaged. |
| S-new-6 | Resolved | `/schema` `links[name].state` serves `default`, and Task 4 Step 2 asserts it. Task 3 Step 1 asserts options and tones only. That is fine. |
| N-new-1 | Resolved | The "Geen rijen in deze week" hits are listed. |
| N-new-2 | Resolved | `Matrix.tsx:383` is named, and the chip is passed as its own prop. |
| N-new-3 | Resolved | The add is pushed with `id: linkId`, and × calls `history.forget`. |
| N-new-4 | Resolved, but now contradicts the spec | See S3-4 below. |
| N-new-5 | Mostly resolved | "sort and group on it are 400" sits under the views test, but does not say it is `POST /views`. |
| N-new-6, 7, 8 | Resolved | Van–tot is capped at 92 days, export gets `null` under Alles, the files are named. |
| N-new-9 | Open (acceptable) | The write reply still carries no `links`. This is harmless for Dagplanning. |

## Blocking

**B3-1. Task 0 changes the wrong part of the grid. The grid puts views under a model by `view.table`, and `view.table` is also the source a saved view is written to.**
- **What the plan says:** Task 0 Files: "`apps/grid/src/engine.ts` (`toSchema`: a query with `of` adds its tables to that model's entry instead of its own)". Interfaces: "each view keeps its own `model` (the query) for reads and writes".
- **What the source says:**
  - `toSchema` (`apps/grid/src/engine.ts:191-200`) builds a flat `tables: TableDef[]` with one entry per source. A `models[name]` entry is a `Model` holding fields, so there is no "model's entry" of tables to add to.
  - The tree is built afterwards in `useSavedViews.ts:52`: `groupTables(byFirstView(declared, …))`.
    - `groupTables` assigns a view by `view.table === table.key` (`apps/grid/src/ui/tables.ts:30`).
    - `listFor` then rebuilds each table's list with `saved.filter((view) => view.table === table.key)` (`apps/grid/src/ui/views.ts:125`).
  - `view.table` comes from `toSavedViews`: `table: view.source` (`engine.ts:300`). It is the source that saved-view writes use:
    - `createView` and `updateView` call `sourceOf(view.table)` (`api.ts:192,198`).
    - `duplicate` and `saveAs` send `table: from.table` (`useSavedViews.ts:134,154`).
- **What goes wrong:**
  - If `toSchema` drops the query's TableDef, `groupTables` and `listFor` drop its views and they vanish from the rail.
  - If `view.table` is changed to `activiteit` instead, Kopie maken and Save write a Dagplanning arrangement onto `activiteit`.
  - Step 2's Kopie maken test would catch the second case, but the plan points the executor at the wrong code to change.
- **Smallest change to Task 0:**
  - `toSchema`/`tableDefOf` only carry `of` onto `TableDef`.
  - The grouping goes in `apps/grid/src/ui/tables.ts` `groupTables` and `apps/grid/src/ui/views.ts` `listFor`: a table also takes the views whose table's `of` is its key, its own views first, then each query's in declared order.
  - `view.table` stays the query.
  - Add `apps/grid/src/ui/tables.test.ts` to the Test map row ("Query `of` and the tree"). It already tests `groupTables` and `sectionsOf`.
  - Drop "`apps/grid/src/space.ts` if sections are read there". `space.ts` is the space selector. Sections are read in `tables.ts:35` `sectionsOf`.

## Should fix

**S3-1. A query view would be titled with its model's label: the Dagplanning grid would be labelled "Activiteiten".**
- **Where:** Task 0 does not mention it.
- **Source:**
  - `apps/grid/src/ui/App.tsx:202`: `const title = tableOf(tables, view?.key)?.label`.
  - That title becomes the grid's `aria-label` (`grid/Grid.tsx:301`, `title ?? view.label`), the Matrix title and the export's sheet title (`App.tsx:284`, `export/download.ts:20`).
  - Once Dagplanning sits under Activiteiten, `tableOf` returns Activiteiten.
  - `e2e/step-0d.spec.ts:210` waits for `getByRole('grid', { name: 'Dagplanning' })` and would time out.
- **Smallest change:** Task 0 sets `title` from the view's own source label (`models[view.model].label`, or `view.table_label`), not from the rail node. Add one App.test assertion that a query view's grid is named by the query.

**S3-2. The list of e2e callers to update is incomplete.**
- **Where:** Task 0 Test/Step 6 greps only `openView(page, 'Dagplanning'`, `openModel(page, 'Dagplanning'` and `pick(page, 'Dagplanning'`.
- **Callers it misses, all of which default the model to the view's name or name the old node:**
  - `e2e/step-0a.spec.ts:119`: `openView(page, 'Per productie per dag')`.
  - `e2e/step-0b.spec.ts:122,141`: `open(page, 'Dagplanning')`.
  - `e2e/step-0c.spec.ts:169`: `open(page, 'Voorstellingen')`.
  - `e2e/step-0d.spec.ts:210`: `open(page, 'Dagplanning', …)`.
  - `e2e/step-0d.spec.ts:330`: `modelNode(page, 'Dagplanning')` toBeVisible.
  - `e2e/grid-ux.spec.ts:510`: `modelNode(page, 'Dagplanning')`, the R10.5 font check.
  - `e2e/rail-tree.spec.ts:17-20`: `tree-scrolls-in-rail` uses `modelNode(page, 'Voorstellingen')` as the last node and clicks "Weergave toevoegen aan Voorstellingen".
- **Smallest change:**
  - Grep for the three view names with any helper: `open(`, `openView(`, `pick(`, `modelNode(`.
  - Name these lines in the plan.
  - Give `tree-scrolls-in-rail` a new last node (Sjablonen).

**S3-3. The new "no query in a section" rule breaks the engine's space fixture, and the plan does not list it.**
- **Where:** Task 0 Step 1: "a section that lists a query is refused".
- **Source:**
  - `packages/engine/test/fixtures/space-domain.ts:52,76-78` declares `job_room` as a query and lists it in section `Work`.
  - `packages/engine/test/declarations.test.ts:51` ("the fixture passes") and `:134-137` (`sections: [{ label: 'Work', sources: ['job_room', 'job'] }]`) would both fail.
- **Smallest change:** add `space-domain.ts` and those two assertions to Task 0's Files. `job_room` comes out of the section and gains `of: 'job'`, which also gives the `/schema` `of` test a generic subject.

**S3-4. The confirm's wording contradicts spec R2.**
- **Where:** Task 4 App.tsx bullet: "<link label> van <titel> verwijderen?".
- **What goes wrong:**
  - Theatre's link label is `Mensen` (Task 4 Files), so the question reads "Mensen van Jan verwijderen?".
  - Spec R2 fixes the text as "Toewijzing van <naam> verwijderen?".
  - The link dataset's served label is `Toewijzingen` (`packages/theatre/src/datasets.ts:155`), so that does not produce the spec's text either.
  - The grid has no site-strings channel: `/schema` serves no `strings` (`packages/engine/src/app.ts:176`).
- **Smallest change:** put the wording to Stefan before Task 4. Either:
  - (a) accept the generic "<titel> verwijderen?" or "Mensen van <titel> …", or
  - (b) `LinkDecl` gains an `item` word (theatre: `Toewijzing`), served and used in the sentence.
- Do not let the executor resolve it alone.

**S3-5. The order of the three query views is stated two ways.**
- **The two statements:**
  - Interfaces: "each `of` query's views in the declared query order".
  - Step 2: "Activiteiten's views end with Dagplanning, Per productie per dag and Voorstellingen".
- **Source:** theatre declares `queries: [productieDag, dagplanning, voorstellingen]` (`packages/theatre/src/index.ts:32`). The declared order is therefore Per productie per dag, Dagplanning, Voorstellingen.
- **Smallest change:** either fix Step 2's expected order, or reorder `queries` in theatre's `index.ts` as part of Task 0.

**S3-6. The owner fallback has no grid test, and serving `of` the way `creates` is served would remove the need for it.**
- **Where:** Step 4: "A query whose `of` dataset the caller cannot read shows its views under a model node of its own". Interfaces: `of: string | null` is always served.
- **Source:**
  - `createsOf` (`packages/engine/src/app.ts:99-102`) serves `creates` only when the caller can read the target, so `/schema` never names a dataset the caller cannot read.
  - In theatre the fallback cannot be reached: no theatre query declares `owners`, so an owner reads none of them (`access.ts:48-49`). It only matters in the engine fixture (`per_project`, owners on `project_id`).
  - Step 2 has no grid test for the fallback.
- **Smallest change:**
  - Serve `of` only when `readable(actor, of)`, like `createsOf`.
  - Step 1's owner test becomes "an owner who cannot read the `of` dataset gets no `of`, and still reads the query".
  - The grid then needs no fallback branch: no `of` means its own node, as today.

## Note

- **N3-1. Per-table prefs are keyed by `view.table`, but the tree is now keyed by the model.**
  - `remember` writes `prefs.last[view.table]`, i.e. `last['dagplanning']` (`useSavedViews.ts:66-67`).
  - `lastIn` reads `last[table.key]`, i.e. `last['activiteit']` (`views.ts:149-150`). Clicking Activiteiten after using Dagplanning therefore opens a model view, not Dagplanning.
  - Drag-reordering is saved under `order['activiteit']` and can interleave query views with model views, against R5's "its own views, then the views of every query".
  - Any stored `order['dagplanning']` is orphaned.
  - Needs a ruling at execution: either key `last` by the rail node, or accept it. Either block drags across the boundary, or let the user's order win.
- **N3-2. Queries without `of`.** `of?:` is optional. Fiche's `zichtbare_fiches` (`packages/fiche/src/queries.ts:5`) stays its own rail node, so "the sidebar lists only data models" (R5) holds for theatre only. That is consistent with `fiche-renders-as-before`, but one sentence in Task 0 saying so would prevent a ruling.
- **N3-3. A query's own rename and icon become unreachable.** The model `…` menu on Activiteiten renames and re-icons `activiteit` (`App.tsx:286-295`, `changeDisplay(table.key)`), which is correct for the model. No menu reaches a query's display name any more. That is acceptable under R5, but nothing states it.
- **N3-4. `of` naming a query.** "Validation refuses an unknown dataset": the test should also refuse `of` naming a query (or itself), not only a missing name.
- **N3-5. Working tree.** R6 is now committed (`63f3b6f`), so the plan's "R6 is done before Task 0" holds. The working tree now holds an unrelated, uncommitted engine change: `packages/engine/src/seed-missing.ts` `removeUndeclared`, plus its test. It is in no task. Stage Task 0's paths explicitly so it is not swept in.
- **N3-6. These already work with the right grouping:** the space switcher, the new-view dialog and the landing view.
  - Each saved view keeps its own source's `space` (`toSavedViews` spreads `tableDefOf(view.source)`, `engine.ts:297`), so a query view's scope is unchanged.
  - `+ Weergave` uses the Activiteiten table's `space` and `types`, which matches R5's "a view on the model itself".
  - The landing view stays Planning: the first seeded view, `seed.ts:170`, and `tables[0].views[0]`.
  - Export from the Activiteiten `…` exports the open query view (`holdsActive`), but under the wrong title until S3-1 is fixed.
  - The query icon can come from `view.query`, which `tableDefOf` sets (`engine.ts:180`).

## Premises checked
- `toSchema` has a per-model entry that tables are added to → `apps/grid/src/engine.ts:191-200` → does not hold (B3-1)
- Views are grouped by `view.table` → `apps/grid/src/ui/tables.ts:30`, `apps/grid/src/ui/views.ts:125` → holds; the plan does not name either file (B3-1)
- `view.table` is the saved view's source for create, update and copy → `apps/grid/src/api.ts:192,198`, `useSavedViews.ts:134,154` → holds; it must stay the query
- `byFirstView` and the landing view → `tables.ts:46-52`, `App.tsx:192`, `seed.ts:170` (Planning first) → holds, landing unchanged
- Sections are read in `space.ts` → `apps/grid/src/space.ts` (space selector only); sections are read in `tables.ts:35` → does not hold (B3-1)
- The rail's model node icon comes from `table.query` → `Rail.tsx:105` → holds; `ViewList.tsx:134` uses only Grid3x3/Table, and `View.query` is present (`engine.ts:180`) → holds
- The model `…` menu's rename, icon and export apply to `table.key` and the open view → `Rail.tsx:114-117`, `App.tsx:286-297` → holds (N3-3)
- The engine refuses unknown and duplicate section sources only → `packages/engine/src/validate.ts:235-243` → holds; the plan adds the query rule
- `/schema` filters sections by readability → `app.ts:76-84` → holds
- `/schema` hides `creates` from a caller who cannot read the target → `app.ts:99-102` → holds (S3-6)
- `QueryDecl` has no `of` yet → `packages/engine/src/declare.ts:90-104` → holds
- Theatre's Planning section lists `dagplanning` → `packages/theatre/src/index.ts:48` → holds
- Theatre's declared query order → `index.ts:32` → productie_dag, dagplanning, voorstellingen (S3-5)
- No theatre query declares owners → `packages/theatre/src/queries.ts` → holds; the owner fallback is fixture-only (S3-6)
- The engine space fixture lists a query in a section → `packages/engine/test/fixtures/space-domain.ts:52,78` → holds; it breaks under the new rule (S3-3)
- The theatre sections test → `packages/theatre/test/grid-ux.test.ts:42-50` → holds; the plan lists it
- The grid title comes from the rail node → `App.tsx:202`, `Grid.tsx:301` → holds; it changes for query views (S3-1)
- The e2e helper `openView` defaults the model to the view's name → `e2e/tree.ts:14` → holds; the callers are listed in S3-2
- `rail-tree.spec.ts` uses Voorstellingen as the last node → `e2e/rail-tree.spec.ts:17-20` → holds; it breaks (S3-2)
- Fiche declares a query → `packages/fiche/src/queries.ts:5` → holds (N3-2)
- R6 is done before Task 0 → commit `63f3b6f` → holds
- The toewijzing dataset's label → `packages/theatre/src/datasets.ts:155` (`Toewijzingen`) → not the spec's "Toewijzing" (S3-4)
- `/schema` serves site strings → `app.ts:176` → does not hold (S3-4)
