# Dagplanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Dagplanning, planners edit an activity's own columns, see and change who is on it as tags, and choose the period with a filter chip instead of the toolbar's week control.

**Architecture:**
- Editing is a theatre declaration change: three more `writes` on the Dagplanning query.
- People need one generic engine shape, `links`. It is read beside a page of rows, as the matrix already reads its join rows (`cellsOf`, `packages/engine/src/rows.ts:120`), and written with the link dataset's existing create and delete routes.
- The period is grid-only: the window already travels as `from`/`to` in the URL and the rows request. It moves from the toolbar into a chip.
- First working version: Task 1 (Stefan edits Omschrijving, Soort and Locatie in Dagplanning).

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
- For the period, the simplest design keeps the existing window state and hash. Only its control moves, and the presets are functions over `weekOf`/`shift` in `Window.tsx`.

## Threat model
**Assets:**
- Toewijzing rows, meaning who is assigned to what, with their state.
- Persons' names.
- Write access to Toewijzing.

**Attacks and mitigations:**
1. **An owner (person account) reads other people's assignments through a links column on a source they can read.** Mitigation: links are read with `scopeOf(actor, linkDataset)` (`packages/engine/src/rows.ts`, `linksOf`), as `cellsOf` does. An owner gets only its own link rows, and a source that declares no owner column gives `'none'`.
2. **A caller sees a link title for a target they cannot read.** Mitigation: the title comes from `withLookups`' title rule, as for any relation lookup: the target's title only, never its row.
3. **A planner adds or removes assignments past the writer's rules, for example a duplicate person or a role a writer reserves.** Mitigation: no new route. The grid uses `POST`/`DELETE /rows/toewijzing`, which run `toewijzingWriter` and the delete order (scope, writer, in-use).
4. **A declaration names a link dataset or column that does not exist, or a key that is not a relation back to the source.** Mitigation: `validateDomain` refuses it before anything is written (`packages/engine/src/validate.ts`).
5. **`/schema` reveals a links column whose dataset the caller cannot read.** Mitigation: `servedLinks` serves a link only when `readable(actor, linkDataset)`.

**Deferrals:** none.

## Test map
| Unit | Seam | Tests: tier · file · command | E2E flows |
| --- | --- | --- | --- |
| Engine `links` | `GET /api/schema`, `GET /api/rows/:source`, `validateDomain` | integration · `packages/engine/test/links.test.ts` (new) · `bun test packages/engine` | none, proven by people-tags |
| Theatre Dagplanning declarations | `PATCH /api/rows/dagplanning/:id`, `GET /api/rows/dagplanning` | integration · `packages/theatre/test/dagplanning.test.ts` (new or the existing theatre test file for queries) · `bun test packages/theatre` | edit-dagplanning, locatie-own-and-back |
| People cell | render, picker | unit · `apps/grid/src/grid/cells/Links.test.tsx` (new) · `cd apps/grid && bunx vitest run` | people-tags |
| Period chip | render, `rows()` window | unit · `apps/grid/src/ui/Period.test.tsx` (new), `ui/App.test.tsx` · `cd apps/grid && bunx vitest run` | period-chip |

## Review Focus
1. Threat 1: an owner reading a source with a links column gets only its own link rows. Test map row 1, asserting the denial on another person's row.
2. Threat 5: `/schema` omits a links column for a caller who cannot read its dataset. Test map row 1.
3. A link row soft-deleted elsewhere vanishes from the tags on the next read, and undoing the delete brings it back. Test map row 3, and the people-tags flow's undo step.
4. Clearing Dagplanning's Locatie writes null to the activity and shows the speelreeks' venue grey again. It never writes the speelreeks. Test map row 2.
5. The period: a matrix never offers Alles; a reload keeps the chosen period; Volgende week from a week across New Year lands on the right ISO week. Test map row 4.
6. Fiche (no links, but dated sources) renders the Periode chip and nothing else new. The fiche e2e.

---

### Task 1: Dagplanning's own columns are editable (R1)

**Files:**
- Modify: `packages/theatre/src/queries.ts:35-73` (dagplanning columns).
- Test: the theatre query test file, at `PATCH /api/rows/dagplanning/:id`. Use the existing helpers in `packages/theatre/test`; create `dagplanning.test.ts` if none fits.
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
  - `apps/grid/src/ui/Filters.tsx` or the filter bar container: render the chip first.
  - `apps/grid/src/i18n.ts`, `apps/grid/src/ui/app.css`.
  - The empty state's markup and CSS: centre it in the sheet.
- Test: the e2e specs that drive the week control. Grep `nv-window`, `Vorige week`, `Volgende week` and `formatWindow` in `e2e/` and update the selectors.

**Interfaces:**
- Consumes: `DateWindow`, `weekOf`, `shift` and `formatWindow` from `Window.tsx`; the hash keys `from`/`to` in `hash.ts`.
- Produces: `Period({ window, onChange, unbounded }: { window: Partial<DateWindow>; onChange: (w: Partial<DateWindow>) => void; unbounded: boolean })`. `unbounded` is true only for the table skin. Alles sets `{}`, and `rows()` sends no `from`/`to`; check `api.ts:89` accepts that.

- [ ] Step 1: Vitest `Period.test.tsx`:
  - The chip reads "Periode Week 45 · 2–8 nov" and has no remove button.
  - ‹ and › shift by 7 days, by a month under Deze maand, and by the span under Van–tot.
  - Deze week, Volgende week, Deze maand and Van–tot set the right window. Use a fixed date that crosses New Year: from 2026-12-28, Volgende week is ISO week 1 of 2027.
  - Alles is present when `unbounded` and absent otherwise.
  - Alles shows "Alles" and hides ‹ ›.
- [ ] Step 2: Vitest in `App.test.tsx`: the toolbar has no week control; the filter bar starts with the Periode chip; choosing Alles makes the rows request carry no `from`/`to`.
- [ ] Step 3: Run them. Expected: FAIL.
- [ ] Step 4: Implement. Under Alles the hash holds `period=all`, so a reload keeps it. The empty state reads "Geen rijen in deze periode" with the period, centred in the sheet.
- [ ] Step 5: Run them. Expected: PASS.
- [ ] Step 6: E2E `period-chip @e2e`: step forward with ›, pick Deze maand, reload (the period stays), pick Alles in Dagplanning (rows from several weeks). In the Toewijzingen matrix the menu has no Alles.
- [ ] Step 7: `bun run gate` exits 0. Commit `feat(grid): the period is a filter chip; the week control leaves the toolbar`.

### Task 3: The engine's `links` shape (R3)

**Files:**
- Modify:
  - `packages/engine/src/declare.ts`: `LinkDecl` and `links?: Record<string, LinkDecl>` on `DatasetDecl` and `QueryDecl`.
  - `packages/engine/src/validate.ts`, `packages/engine/src/rows.ts` (`linksOf`).
  - `packages/engine/src/app.ts`: `/schema` and `/rows/:source`.
  - `packages/engine/src/index.ts`: exports.
- Test: `packages/engine/test/links.test.ts` (new). Extend `packages/engine/test/fixture.ts` with a generic link, for example `taak` gaining a `helpers` link over a new generic join dataset such as `hulp` (`taak_id`, `project_id` target, `state` with tones). Keep `bun run check`'s vocabulary clean.

**Interfaces:**
- Produces:
  - `interface LinkDecl { label: string; dataset: string; key: string; target: string; state?: string }`.
  - `/schema`: `sources[s].links = { [name]: { label, dataset, target, target_dataset, state?: { options, tones } } }`.
  - `/rows/:source`: each row gains `links: { [name]: { id: number; target: number | null; title: string; state: string | null }[] }`, ordered by link row id.
  - `linksOf(db, domain, source, ids, actor): Map<number, Record<string, LinkRow[]>>`.

- [ ] Step 1: Write the tests:
  - `validateDomain` refuses: a link dataset that does not exist; a `key` that is not a relation to the declaring source (for a query, to the dataset its `id` names, through `creates` or the key's relation target; pick the check that holds for both kinds and state it in the error); a `target` that is not a relation column; a `state` that is not an options column; a link name that clashes with a column.
  - `/schema` serves `links` with the target dataset and the state's options and tones. An owner who cannot read the link dataset gets no `links` entry.
  - `/rows` serves each row's link rows. A soft-deleted link row is absent. A link row without a target has `target: null` and its own title.
  - Owner denial: an owner account reading a source with links sees only link rows in its own scope. Another person's row on the same parent is absent, asserted by id.
  - One query per link column per page, not one per row. Assert through a counted `db` wrapper or a large page whose timing is not asserted, whichever the existing tests already use; otherwise assert the result for 300 parents.
- [ ] Step 2: Run `bun test packages/engine`. Expected: FAIL.
- [ ] Step 3: Implement, following `cellsOf`: read in chunks with `isNull(deleted_at)`, `scopeWhere(scopeOf(actor, linkDataset))` and `inArray(key, ids)`. Titles come through `withLookups`.
- [ ] Step 4: Run `bun test packages/engine`. Expected: PASS. `bun run check` exits 0 (vocabulary).
- [ ] Step 5: Add the proposed `links` lines to the `docs/SPEC.md` working-tree diff (spec "Proposed docs/SPEC.md lines"). Do not stage it.
- [ ] Step 6: `bun run gate` exits 0. Commit `feat(engine): a source may declare links: the rows of another dataset that point at it`.

### Task 4: People as tags in Dagplanning (R2)

**Files:**
- Modify: `packages/theatre/src/queries.ts` (dagplanning `links: { mensen: { label: 'Mensen', dataset: 'toewijzing', key: 'activiteit_id', target: 'persoon_id', state: 'state' } }`).
  - Pick the `key` check from Task 3 that holds here: Dagplanning's `id` is the activity's id and `creates: 'activiteit'`.
  - Add `mensen` to the seeded Dagplanning view's visible fields in `packages/theatre/src/seed.ts`, after Locatie. `--seed-missing` brings system views up to date (option b).
- Modify:
  - `apps/grid/src/engine.ts`, `types.ts`: a links column becomes a field of type `links`.
  - `apps/grid/src/grid/columns.ts`.
  - `apps/grid/src/grid/cells/Links.tsx` (new), `cells/index.tsx`.
  - `apps/grid/src/ui/App.tsx`: create and delete through `create`/`remove` in `api.ts`, pushed to the history like other writes, then the row re-read.
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
  - Keyboard: Enter opens the editor, Escape closes it.
- [ ] Step 2: Theatre integration: `/schema` dagplanning has `links.mensen` with target_dataset `persoon` and the state tones. `/rows/dagplanning` lists a seeded activity's toewijzingen.
- [ ] Step 3: Run them. Expected: FAIL.
- [ ] Step 4: Implement. A writer refusal (duplicate person) shows the existing error toast, and the tag list is re-read.
- [ ] Step 5: Run them. Expected: PASS.
- [ ] Step 6: E2E `people-tags @e2e`, as the editor in Dagplanning:
  - a row shows its seeded people as tags;
  - add a person; the tag appears amber (uitgenodigd);
  - reload; it stays;
  - remove it with ×; it is gone;
  - undo; it is back;
  - adding the same person twice shows the writer's refusal.
- [ ] Step 7: `bun run gate` exits 0. Commit `feat: people on an activity as tags in Dagplanning, added and removed through the Toewijzing writer`.
