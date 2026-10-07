# Dagplanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Dagplanning, planners edit an activity's own columns, see and change who is on it as tags, and choose the period with a filter chip instead of the toolbar's week control.

**Architecture:**
- Editing is a theatre declaration change: three more `writes` on the Dagplanning query.
- People need one generic engine shape, `links`. It is read beside a page of rows, as the matrix already reads its join rows (`cellsOf`, `packages/engine/src/rows.ts:120`), and written with the link dataset's existing create and delete routes.
- The period is grid-only: the window already travels as `from`/`to` in the URL and the rows request. It moves from the toolbar into a chip.
- The tree change (R5) is a declaration `of` on a query plus the grid's tree placing a query's views under that model (Task 0).
- R6 (Tourstop) is done on this branch before Task 0 (label changes and the section order only).
- First working version: Task 0 (Stefan sees Dagplanning, Per productie per dag and Voorstellingen under Activiteiten).

**Tech Stack:** Bun, Hono, bun:sqlite, Drizzle, TypeScript, React 19, Vitest, Playwright, Biome.

**Spec:** `specs/dagplanning/spec.md`

## Global Constraints
- `packages/engine` never knows a domain word, in code, comments or tests. `bun run check` enforces it. The engine fixture uses its own generic names (project, taak, note).
- Domain rules live in domain writers. A refused link write is the writer's refusal, shown as any write error.
- Dutch UI strings in `apps/grid/src/i18n.ts`, beside the existing ones.
- `docs/SPEC.md` is never committed. Its lines go into the working-tree diff Stefan reads.
- Run `bun scripts/check-export-terms.ts` after staging and before every commit. Never `git stash`. Stage paths explicitly.
- No client data. Fixtures are invented.
- The gate is `bun run gate`: check, `bun test packages scripts`, grid vitest, e2e. It must exit 0 at the end of every task.

## Simplest design
- The simplest way to show people would be a SQL `group_concat` of names in the Dagplanning view. It gives read-only text: no state colour, no per-tag ×, and no id to delete. It does not meet R2.
- The next simplest is a `links` declaration read the way `cellsOf` reads matrix cells. It adds no write route, because the grid reuses `POST /rows/<dataset>` and `DELETE /rows/<dataset>/:id`, so the writers, the undo and the refusals stay as they are. This plan uses it.
- Serving the matrix's `cells` on Dagplanning would reuse `cellsOf` with no new declaration. It is rejected because cells need a bounded window of at most 92 days (`params.ts:118-123`), which rules out Alles, and because it would tie people to a matrix declaration.
- For the period, the simplest design keeps the existing window state and hash and widens them: `fromHash` honours a `to`, `period=all` means no window, and a month step is one new helper beside `shift`.

## Threat model
**Assets:**
- Toewijzing rows, meaning who is assigned to what, with their state.
- Persons' names.
- Write access to Toewijzing.

**Attacks and mitigations:**
1. **An owner (person account) reads other people's assignments through a links column on a source they can read.** Mitigation: links are read with `scopeOf(actor, linkDataset)` (`packages/engine/src/rows.ts`, `linksOf`), as `cellsOf` does. An owner gets only its own link rows, and a source that declares no owner column gives `'none'`.
2. **A caller sees a link title for a target they cannot read.** Mitigation: the title comes from `withLookups`' title rule, as for any relation lookup: the target's title only, never its row.
3. **A planner adds or removes assignments past the writer's rules, for example a duplicate person or a role a writer reserves.** Mitigation: no new route. The grid uses `POST`/`DELETE /rows/toewijzing`, which run `toewijzingWriter` and the delete order (scope, writer, in-use).
4. **A declaration names a link dataset or column that does not exist, or a key that is not a relation back to the source.** Mitigation: `validateDomain` refuses it before anything is written (`packages/engine/src/validate.ts`). On a dataset, the key's relation must be that dataset. On a query, the query must declare `creates`, and the key's relation must be that dataset. A query declaring `creates` promises that its `id` is that dataset's id; a query that breaks the promise attaches the wrong rows, but still only rows the caller's scope on the link dataset allows.
5. **`/schema` reveals a links column whose dataset the caller cannot read.** Mitigation: `servedLinks` serves a link only when `readable(actor, linkDataset)`.

**Deferrals:** none.

## Test map
| Unit | Seam | Tests: tier · file · command | E2E flows |
| --- | --- | --- | --- |
| Query `of` and the tree | `GET /api/schema`, `validateDomain`, the rail | integration · `packages/engine/test/declarations.test.ts` · `bun test packages/engine`; unit · `apps/grid/src/ui/tables.test.ts`, `ui/Rail.test.tsx`, `ui/App.test.tsx`, `engine.test.ts` · `cd apps/grid && bunx vitest run` | query-views-under-model |
| Engine `links` | `GET /api/schema`, `GET /api/rows/:source`, `validateDomain` | integration · `packages/engine/test/links.test.ts` (new) · `bun test packages/engine` | none, proven by people-tags |
| Theatre Dagplanning declarations | `PATCH /api/rows/dagplanning/:id`, `GET /api/rows/dagplanning` | integration · `packages/theatre/test/writer.test.ts` (`describe('dagplanning')`, :220) · `bun test packages/theatre` | edit-dagplanning, locatie-own-and-back |
| People cell | render, picker | unit · `apps/grid/src/grid/cells/Links.test.tsx` (new) · `cd apps/grid && bunx vitest run` | people-tags |
| Period chip | render, `rows()` window | unit · `apps/grid/src/ui/Period.test.tsx` (new), `ui/App.test.tsx` · `cd apps/grid && bunx vitest run` | period-chip |

## Review Focus
1. Threat 1: an owner reading a source with a links column gets only its own link rows. Test map row 1, asserting the denial on another person's row.
2. Threat 5: `/schema` omits a links column for a caller who cannot read its dataset. Test map row 1.
3. A link row soft-deleted elsewhere vanishes from the tags on the next read. Removing a tag is final; removing one whose state is not the default asks first. Adding is undone by one undo. Test map row 3 and the people-tags flow.
4. Clearing Dagplanning's Locatie writes null to the activity and shows the speelreeks' venue grey again. It never writes the speelreeks. Test map row 2.
5. The period: a matrix never offers Alles; a reload keeps the chosen period; Volgende week from a week across New Year lands on the right ISO week. Test map row 4.
6. Fiche declares no date and no links: it renders no Periode chip and nothing else new. The `fiche-renders-as-before` e2e (`e2e/grid-ux.spec.ts:640`) asserts the chip's absence.
7. A saved Dagplanning arrangement that shows Mensen saves (no 400). Mensen offers no sort, group or filter. Test map rows 1 and 3.

---

### Task 0: A query's views sit under its data model (R5)

**Files:**
- Modify: `packages/engine/src/declare.ts` (`of?: string` on `QueryDecl`), `packages/engine/src/validate.ts`, `packages/engine/src/app.ts` (`/schema` serves `of`).
- Modify: `packages/theatre/src/queries.ts` (`of: 'activiteit'` on all three queries); `packages/theatre/src/index.ts` (the Planning section loses `dagplanning`).
- Modify (grid):
  - `apps/grid/src/engine.ts` `toSchema` / `tableDefOf`: only carry `of` onto `TableDef`. `view.table` stays the query: it is the source every saved-view write uses (`api.ts:192,198`, `useSavedViews.ts:134,154`).
  - `apps/grid/src/ui/tables.ts` `groupTables` (:30) and `apps/grid/src/ui/views.ts` `listFor` (:125): a table also takes the views whose table's `of` is its key, its own views first, then each query's in declared order. A table with `of` gets no node of its own.
  - `apps/grid/src/ui/App.tsx:202`: the grid's title comes from the view's own source label (`models[view.model].label`), not from the rail node, so a query view's grid, matrix and export stay named by the query.
  - `apps/grid/src/ui/ViewList.tsx` (:134): a view with `view.query` shows the query icon.
  - Prefs: `last` is keyed by the rail node (`remember` in `useSavedViews.ts:66`), so Activiteiten reopens Dagplanning after it was used. Drag-reordering stays inside a block: a model's own views, or one query's views.
- Modify (engine fixture): `packages/engine/test/fixtures/space-domain.ts:52,76-78`: `job_room` leaves section `Work` and gains `of: 'job'`; update `packages/engine/test/declarations.test.ts:51,134-137`.
- Modify (theatre): `packages/theatre/src/index.ts:32`: `queries: [dagplanning, productieDag, voorstellingen]`, so the declared order is the tree's.
- Test: `packages/engine/test/declarations.test.ts`, `packages/theatre/test/grid-ux.test.ts` (sections), `apps/grid/src/ui/tables.test.ts` (`groupTables`, `sectionsOf`), `apps/grid/src/ui/Rail.test.tsx`, `apps/grid/src/ui/App.test.tsx` (title), `apps/grid/src/engine.test.ts`.
- E2E callers that open a query as a model, each now under Activiteiten (grep the three names with `open(`, `openView(`, `pick(`, `modelNode(`):
  - `e2e/step-0a.spec.ts:119` `openView(page, 'Per productie per dag')`;
  - `e2e/step-0b.spec.ts:122,141` `open(page, 'Dagplanning')`;
  - `e2e/step-0c.spec.ts:169` `open(page, 'Voorstellingen')`;
  - `e2e/step-0d.spec.ts:210` `open(page, 'Dagplanning', …)` and `:330` `modelNode(page, 'Dagplanning')`;
  - `e2e/grid-ux.spec.ts:510` `modelNode(page, 'Dagplanning')` (the font check moves to the Activiteiten node);
  - `e2e/rail-tree.spec.ts:17-20` `tree-scrolls-in-rail`: its last node becomes Sjablonen;
  - every other hit of the grep.

**Interfaces:**
- Produces: `/schema` `sources[q].of` for a query, served only when the caller can read that dataset (as `createsOf` serves `creates`, `app.ts:99`); otherwise absent, and the grid shows the query as a node of its own, as today. In the grid, a model's views are its own tables' views, then each `of` query's views in the declared query order; each view keeps its own `model` (the query) for reads and writes.

- [ ] Step 1: Engine tests: `of` naming an unknown dataset, a query, or itself is refused; a section listing a query is refused; `/schema` serves `of` (on the fixture's `job_room`); an owner who cannot read the `of` dataset gets no `of` and still reads the query.
- [ ] Step 2: Grid tests: the rail lists no query with `of` as a node; Activiteiten's views end with Dagplanning, Per productie per dag and Voorstellingen, in that order, each with the query icon; opening one reads `/rows/<query>` and the grid is named by the query; "+ Weergave" on Activiteiten makes a view on `activiteit`; Kopie maken on a query view makes a view on the query; a query without `of` keeps its own node.
- [ ] Step 3: Run them. Expected: FAIL.
- [ ] Step 4: Implement.
- [ ] Step 5: Run them. Expected: PASS.
- [ ] Step 6: E2E `query-views-under-model @e2e` in `e2e/rail-tree.spec.ts`: Activiteiten folds out to its views then the three query views; Dagplanning opens from there; no query sits at the bottom of the rail. Update the callers listed above.
- [ ] Step 7: `bun run gate` exits 0. Commit `feat: a query's views sit under the data model it reads`.

### Task 1: Dagplanning's own columns are editable (R1)

**Files:**
- Modify: `packages/theatre/src/queries.ts:35-73` (dagplanning columns).
- Test: `packages/theatre/test/writer.test.ts`, in `describe('dagplanning')` (:220), at `PATCH /api/rows/dagplanning/:id`.
- E2E: `e2e/dagplanning.spec.ts` (new).

**Interfaces:**
- Consumes: `writesActiviteit(field)` in `queries.ts`.
- Produces: nothing new.

- [ ] Step 1: Write the integration tests:
  - `omschrijving, soort and locatie in dagplanning write the activity`: PATCH each through `/api/rows/dagplanning/:id` and assert the activity row changed.
  - `clearing dagplanning locatie falls back to the speelreeks`: on an activity in a speelreeks with a venue, PATCH `locatie_id` to another venue, then `locatie_bron` reads `eigen`. PATCH null, then `locatie_id` is the speelreeks' venue, `locatie_bron` is `speelreeks`, and the speelreeks row is unchanged.
- [ ] Step 2: Run `bun test packages/theatre`. Expected: FAIL (the columns are not mapped, or are readonly).
- [ ] Step 3: Add `writes: writesActiviteit('omschrijving')`, `writesActiviteit('soort')` and `writesActiviteit('locatie_id')`. Drop `readonly: true` on `locatie_id` and keep `inherited`.
- [ ] Step 4: Run `bun test packages/theatre`. Expected: PASS.
- [ ] Step 5: E2E `edit-dagplanning @e2e`: as the editor, open Dagplanning and edit a row's Omschrijving, then its Soort. Reload; both stay.
- [ ] Step 6: E2E `locatie-own-and-back @e2e`: on an inherited (grey) Locatie, pick a venue. It shows without "via speelreeks". Clear it, and it is grey again.
- [ ] Step 7: `bun run gate` exits 0. Commit `feat(theatre): Dagplanning edits the activity's omschrijving, soort and own venue`.

### Task 2: The period chip (R4)

**Files:**
- Create: `apps/grid/src/ui/Period.tsx`, `apps/grid/src/ui/Period.test.tsx`.
- Modify:
  - `apps/grid/src/ui/Toolbar.tsx`: remove `WindowControl`.
  - `apps/grid/src/ui/Window.tsx`: keep the helpers; the control's markup moves into Period.
  - `apps/grid/src/ui/App.tsx`: pass the window to the filter bar.
  - `apps/grid/src/grid/GridBar.tsx` (beside the scope chip, :34) and the matrix's bar, which renders `{filters}` in `apps/grid/src/matrix/Matrix.tsx:383` (pass the chip as its own prop): render the chip first. It renders even when the source has no filterable field (`filters` is `null` at `App.tsx:277` then).
  - `apps/grid/src/ui/Window.tsx`: `fromHash` honours a valid `to >= from` and falls back to `weekOf(from)` when `to` is absent, so every e2e landing `/#from=<date>` keeps meaning that week. `period=all` gives `{}`. Add `shiftMonth`. `formatWindow` gains a month label ("oktober 2026"), a range label ("12 okt – 3 nov") and "Alles". `useWindow` becomes `Partial<DateWindow>`.
  - `apps/grid/src/grid/newRow.ts:26`: falls back to today under `{}`.
  - `apps/grid/src/i18n.ts`, `apps/grid/src/ui/app.css`.
  - The empty state's markup and CSS: centre it in the sheet.
- Tests to update:
  - `e2e/grid-ux.spec.ts:482` (`.nv-window__week`);
  - `e2e/step-0e.spec.ts:93` and `e2e/step-1.spec.ts:260` ("Geen rijen in deze week" becomes "Geen rijen in deze periode");
  - `apps/grid/src/ui/Window.test.tsx`, `apps/grid/src/grid/Grid.test.tsx`;
  - every `Geen rijen in deze week` in `apps/grid/src` (about 45 in `ui/App.test.tsx`, plus `Window.test.tsx:116,124`, `Grid.test.tsx:38,176,184`, `SignIn.test.tsx:138`): the `noRowsInWindow` string (`i18n.ts:9`) changes;
  - any other hit of `nv-window`, `Vorige week`, `Volgende week` and `formatWindow` in `e2e/` and `apps/grid/src`.
- Also: `exportSheet` / `xlsx.ts` take `DateWindow | null`; under Alles pass `null` (`App.tsx:284`).
- Van–tot in a matrix is capped at 92 days, the engine's matrix window (`params.ts:121`): the Van–tot inputs refuse a longer range when `unbounded` is false.
- The `/#from=<date>` landings in every spec stay as they are (the from-only fallback).

**Interfaces:**
- Consumes: `DateWindow`, `weekOf`, `shift` and `formatWindow` from `Window.tsx`; the hash keys `from`/`to` in `hash.ts`.
- Produces: `Period({ window, onChange, unbounded }: { window: Partial<DateWindow>; onChange: (w: Partial<DateWindow>) => void; unbounded: boolean })`. `unbounded` is true only for the table skin. Alles sets `{}`, and `rows()` sends no `from`/`to`; `api.ts:89` and `rowsQuery` (`grid/engine.ts:367`) already pass `{}` through. A matrix under `{}` reads and shows the current week, because a matrix read without a window is 400 `window_required` (`params.ts:118`).

- [ ] Step 1: Vitest `Period.test.tsx`:
  - The chip reads "Periode Week 45 · 2–8 nov" and has no remove button.
  - ‹ and › shift by 7 days for a Mon–Sun window, by a calendar month for a 1st-to-last window (31 jan → february, whole month), and by the span for any other range.
  - `fromHash`: `#from=2026-10-14` gives that Mon–Sun week; `#from=2026-10-01&to=2026-10-31` stays a month; `#period=all` gives `{}`.
  - Deze week, Volgende week, Deze maand and Van–tot set the right window. Use a fixed date that crosses New Year: from 2026-12-28, Volgende week is ISO week 1 of 2027.
  - Alles is present when `unbounded` and absent otherwise.
  - Alles shows "Alles" and hides ‹ ›.
- [ ] Step 2: Vitest in `App.test.tsx`: the toolbar has no week control; the filter bar starts with the Periode chip; choosing Alles makes the rows request carry no `from`/`to`.
- [ ] Step 3: Run them. Expected: FAIL.
- [ ] Step 4: Implement. Under Alles the hash holds `period=all`, so a reload keeps it. The empty state reads "Geen rijen in deze periode" with the period, centred in the sheet.
- [ ] Step 5: Run them. Expected: PASS.
- [ ] Step 6: E2E `period-chip @e2e`: step forward with ›, pick Deze maand, reload (the period stays), pick Alles in Dagplanning (rows from several weeks), then open the Toewijzingen matrix: the chip reads the current week, no error shows, and its menu has no Alles (no row count: the clock is real). In `e2e/dagplanning.spec.ts`. Add `toHaveCount(0)` for the chip to `fiche-renders-as-before`.
- [ ] Step 6b: Add the period line to the `docs/SPEC.md` working-tree diff (spec "Proposed docs/SPEC.md lines"). Do not stage it.
- [ ] Step 7: `bun run gate` exits 0. Commit `feat(grid): the period is a filter chip; the week control leaves the toolbar`.

### Task 3: The engine's `links` shape (R3)

**Files:**
- Modify:
  - `packages/engine/src/declare.ts`: `LinkDecl` and `links?: Record<string, LinkDecl>` on `DatasetDecl` and `QueryDecl`.
  - `packages/engine/src/validate.ts`, `packages/engine/src/rows.ts` (`linksOf`).
  - `packages/engine/src/app.ts`: `/schema` and `/rows/:source`.
  - `packages/engine/src/index.ts`: exports.
  - `packages/engine/src/views.ts`: `hasColumn` (:39) accepts a declared link name in `visible_fields`; `publicRows` (:345) leaves link keys out.
  - `packages/engine/src/params.ts`: sort and group on a link name stay 400 (`bad_sort`/`bad_group`); a test pins it.
  - `packages/engine/src/validate.ts`: `links` joins the overwritten row keys (`OVERWRITTEN`, :85), so no column may be named `links`.
- Test: `packages/engine/test/links.test.ts` (new). Extend `packages/engine/test/fixture.ts` with two generic links, so both threats have something to prove:
  - one over an owned join (`owners: { owner: 'project_id' }`, `taak_id` key, `project_id` target, `state` with tones and a `default`) for Threat 1: the owner's own link row is present and another project's row is absent, by id;
  - one over a join with no owner column for Threat 5: an owner's `/schema` has no entry for it.
  - Keep `bun run check`'s vocabulary clean.

**Interfaces:**
- Produces:
  - `interface LinkDecl { label: string; item: string; dataset: string; key: string; target: string; state?: string }`. `/schema` serves `item` with the link.
  - `/schema`: `sources[s].links = { [name]: { label, dataset, target, target_dataset, state?: { options, tones, default } } }`. The grid knows the state column's default from it.
  - `/rows/:source`: each row gains `links: { [name]: { id: number; target: number | null; title: string; state: string | null }[] }`, ordered by link row id.
  - `linksOf(db, domain, source, ids, actor): Map<number, Record<string, LinkRow[]>>`.

- [ ] Step 1: Write the tests:
  - `validateDomain` refuses, each with a test:
    - a link dataset that does not exist;
    - on a dataset, a `key` whose relation is not that dataset;
    - on a query, a links declaration without `creates`, and a `key` whose relation is not the `creates` dataset;
    - a `target` that is not a relation column;
    - a `state` that is not an options column;
    - a link name that clashes with a column;
    - a column named `links`.
  - `POST /views` and `PATCH /views/:id` accept a link name in `visible_fields`; a public view's rows leave it out; `POST /views` with `sort: ['<link>']` or `group_by: '<link>'` is 400, and so is `GET /rows` sorting or grouping on it.
  - `/schema` serves `links` with the target dataset and the state's options and tones. An owner who cannot read the link dataset gets no `links` entry.
  - `/rows` serves each row's link rows. A soft-deleted link row is absent. A link row without a target has `target: null` and its own title.
  - Each link entry's keys are exactly `id, target, title, state`; no column of the target or the link row leaks. `title` is the target's title (`lookups[target]?.title`), else the link row's own title.
  - Owner denial: an owner account reading a source with links sees only link rows in its own scope. Another person's row on the same parent is absent, asserted by id.
  - 600 parents (two chunks of 500) each get their own link rows, none missing or misplaced.
- [ ] Step 2: Run `bun test packages/engine`. Expected: FAIL.
- [ ] Step 3: Implement, following `cellsOf`: read in chunks with `isNull(deleted_at)`, `scopeWhere(scopeOf(actor, linkDataset))` and `inArray(key, ids)`. Titles come through `withLookups`.
- [ ] Step 4: Run `bun test packages/engine`. Expected: PASS. `bun run check` exits 0 (vocabulary).
- [ ] Step 5: Add the proposed `links` lines to the `docs/SPEC.md` working-tree diff (spec "Proposed docs/SPEC.md lines"). Do not stage it.
- [ ] Step 6: `bun run gate` exits 0. Commit `feat(engine): a source may declare links: the rows of another dataset that point at it`.

### Task 4: People as tags in Dagplanning (R2)

**Files:**
- Modify: `packages/theatre/src/queries.ts` (dagplanning `links: { mensen: { label: 'Mensen', item: 'Toewijzing', dataset: 'toewijzing', key: 'activiteit_id', target: 'persoon_id', state: 'state' } }`).
  - Pick the `key` check from Task 3 that holds here: Dagplanning's `id` is the activity's id and `creates: 'activiteit'`.
  - Add `mensen` to the seeded Dagplanning view's visible fields in `packages/theatre/src/seed.ts`, after Locatie. `--seed-missing` brings system views up to date (option b).
  - Update the tests that pin those fields: `packages/theatre/test/seed-missing.test.ts:14` (`DAGPLANNING`, and assert `mensen` lands), `packages/theatre/test/grid-ux.test.ts:138`, and the header list at `e2e/grid-ux.spec.ts:486-493` (Mensen after Locatie).
- Modify:
  - `apps/grid/src/engine.ts`, `types.ts`: a links column becomes a field of type `links`.
  - `apps/grid/src/grid/columns.ts`.
  - `apps/grid/src/grid/cells/Links.tsx` (new), `cells/index.tsx`.
  - `apps/grid/src/ui/App.tsx`: add through `create` in `api.ts`, pushed to the history like other creates; remove through `remove`, which is final (a delete batch is never undone) and not pushed. Removing a link whose state is not the state column's default first asks with a new small confirm popover inside `Links.tsx`, anchored on the tag: "<item> van <titel> verwijderen?" with Verwijderen and Annuleren, where `item` is the link's declared word for one link (theatre: `Toewijzing`), so the grid holds no domain word. Then the row is re-read.
  - The add is pushed to the history with `id: linkId`; a × on that link calls `history.forget(dataset, linkId)`, as `grid/store.ts` does for a row delete.
  - `apps/grid/src/engine.ts` `fieldsOf` (:227) includes the source's link names, so `toStoredView` / `fromStoredView` keep `mensen` in `visible_fields` and its order.
  - `apps/grid/src/grid/columns.ts`: a links column is not sortable or groupable, and `grid/filter.ts` `filterFields` leaves it out.
  - `apps/grid/src/i18n.ts`, `app.css`.
- Test: `apps/grid/src/grid/cells/Links.test.tsx`, `packages/theatre/test` (the declaration is served), `e2e/dagplanning.spec.ts`.

**Interfaces:**
- Consumes: Task 3's `/schema` `links` and the rows' `links`. `RelationPicker` (`cells/RelationPicker.tsx`) for the search list of people, extended to multi-pick, or wrapped. Keep one picker.
- Produces: `Links` cell. Display: tags in the state's tone, `title` as text, a grey tag without × when `target` is null. Edit: the multiselect dropdown with the people already linked shown checked.

- [ ] Step 1: Vitest `Links.test.tsx`:
  - Tags render with the tone class of their state.
  - A null-target tag has no ×.
  - Picking an unchecked person calls `onAdd(personId)`; × calls `onRemove(linkId)`.
  - An already-linked person shows checked, and unchecking it calls `onRemove` with its link id.
  - Removing a tag whose state is not the default opens the confirm; Verwijderen calls `onRemove`, Annuleren does not; removing a tag in the default state calls `onRemove` at once.
  - The column offers no sort and no group, and the filter menu does not list it.
  - Keyboard: Enter opens the editor, Escape closes it.
- [ ] Step 1b: Vitest in `apps/grid/src/engine.test.ts`: `toStoredView` / `fromStoredView` round-trip `mensen`, shown in place and hidden.
- [ ] Step 2: Theatre integration in `packages/theatre/test/writer.test.ts` `describe('dagplanning')`: `/schema` dagplanning has `links.mensen` with target_dataset `persoon`, the state tones and `default: 'uitgenodigd'`. `/rows/dagplanning` lists a seeded activity's toewijzingen.
- [ ] Step 3: Run them. Expected: FAIL.
- [ ] Step 4: Implement. A writer refusal (duplicate person) shows the existing error toast, and the tag list is re-read.
- [ ] Step 5: Run them. Expected: PASS.
- [ ] Step 6: E2E `people-tags @e2e`, as the editor in Dagplanning:
  - a row shows its seeded people as tags;
  - add a person; the tag appears amber (uitgenodigd);
  - undo; the added tag is gone; add it again; reload; it stays (the history is per page, so undo comes before the reload);
  - remove it with ×; it is gone, without a question (uitgenodigd);
  - × on a bevestigd tag asks first; Annuleren keeps it;
  - save a copy of the view showing Mensen; reopen the copy; Mensen is where it was;
  - create the same Toewijzing through the API after the page loaded (a stale row), then pick that person: the writer's refusal shows (`checkAssignee`, `writers.ts:136`).
- [ ] Step 7: `bun run gate` exits 0. Commit `feat: people on an activity as tags in Dagplanning, added and removed through the Toewijzing writer`.
