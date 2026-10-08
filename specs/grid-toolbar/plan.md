# Grid Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The grid's title line loses its save words and gains Geschiedenis and Exporteren/delen. The filter bar becomes a real filter builder, with the period as an ordinary condition. Sorting shows in the header. The scrollbars get minimal.

**Architecture:**
- **Mostly grid.** The engine gains three filter operators and one read-only route:
  - `$like` / `$nlike` for "bevat" on text;
  - `$period` for a date relative to today, so a stored "deze week" moves with the calendar;
  - `GET /history/:source`.
- **Conditions are stored as engine filters.** A condition in the builder is stored in the view's `filters` as the engine's own filter language, which `filterWhere` already validates on save (`packages/engine/src/views.ts:96`).
- **First working version:** Task 1 (the title line without save words, the bar without the sort chip, Kolommen as an icon, minimal scrollbars). The period chip leaves in Task 3.

**Tech Stack:** Bun, Hono, bun:sqlite, Drizzle, TypeScript, React 19, Vitest, Playwright, Biome.

**Spec:** `specs/grid-toolbar/spec.md`

## Global Constraints
- `packages/engine` never knows a domain word, in code, comments or tests (`bun run check`).
- Dutch UI strings live in `apps/grid/src/i18n.ts`. No client data: fixtures and the mockup use invented names only.
- `bun scripts/check-export-terms.ts` runs after staging and before every commit. Stage paths explicitly. Never `git stash`. `docs/SPEC.md` is never staged; its lines go into the working-tree diff.
- Test regime per task: `bun run check`, `bun test packages scripts`, `cd apps/grid && bunx vitest run`, and only the e2e specs the task touches. The full `bun run gate` runs once after the last task.
- The e2e specs share one database and run in order: a flow removes what it creates.

## Simplest design
- The simplest period keeps the window (`from`/`to`) the grid sends today and only moves its control into the builder. It stores nothing, though, so Dagplanning could not start with "deze week" (R5) and a saved view would forget its period.
- A stored absolute range would freeze one week.
- `$period` is the smallest addition that lets a view remember "deze week" and still move. It is generic date arithmetic: Monday-to-Sunday weeks and calendar months in the server's local date, no domain word.
- "bevat" has no simpler home: the filter language has no substring operator for ordinary columns (`$contains` is array membership on custom JSON).
- History could reuse `GET /revisions/:dataset/:id`, one record at a time. That is one request per row; a view-level route is one read.

## Threat model
**Assets:**
- Rows the caller may not read.
- Who changed what (other accounts' emails).
- SQL integrity.

**Attacks:**
1. **A filter value that is SQL or a LIKE pattern** (`%`, `_`, `\`) reaches the database. **Mitigation:** `$like`/`$nlike` bind the value. `%`, `_` and `\` are escaped with `ESCAPE '\'` (`packages/engine/src/filter.ts`), so a value matches only itself as a substring.
2. **A `$period` value that is not one of the fixed tokens.** **Mitigation:** `filter-compile.ts` accepts only the tokens `week`, `next_week` and `month`. `filter.ts` accepts it only on a `date` or `datetime` column: `resolveKey` carries the column's type in `Lhs` (it holds only `numeric` today), and a `custom.<key>` is refused for `$like`/`$period`. Anything else is 400 `bad_filter` on `/rows`, and `bad_view` through `POST /views` (`views.ts:98`).
3. **History shows changes to rows the caller cannot read** (another project's, an owner's neighbours'). **Mitigation:** `GET /history/:source` first reads the source's row ids through the same `readRows` scope and parameters as `/rows`, then reads revisions only for those ids (`packages/engine/src/history.ts`, new).
   - For a query, the records are its `creates` dataset's, which needs `readable(actor, that dataset)`; else no entries.
   - The changes are limited to the source's own columns (a query's mapped `writes.field`s), so no unmapped column of the dataset leaks.
4. **History leaks colleagues' emails to an owner account.** **Mitigation:** the engine answers `actor: string | null`. It is the account's email for a caller who is not an owner, and null for an owner reading anyone's but its own. The grid renders the words (Dutch strings stay in the grid).
5. **Undo from the panel on someone else's change.** **Mitigation:** no new route. Undo is the existing `POST /batches/:id/undo`, which refuses another account's batch (403). The panel offers undo only where the entry says `undoable`:
   - the batch is the caller's;
   - its kind is write, action or undo;
   - it is not undone;
   - it holds no `deleted_at` change (`writes.ts:465-474`).

6. **Autosave on a public view puts rows on the website.** An administrator's own public view is editable, and removing a filter would change what `/api/public/views/:token` serves. **Mitigation:** a public view never autosaves. Its changes stay local like a locked view's; the `…` offers "Publieke weergave bijwerken" only when `view.public && view.editable` (an administrator's own public view, `views.ts:66`), which saves them on purpose. A public seeded or shared view is not `editable`, so it offers only Kopie maken. Test map row 1.

**Deferrals:** none.

## Test map
| Unit | Seam | Tests: tier · file · command | E2E flows |
| --- | --- | --- | --- |
| Title line, bar, scrollbars | render | unit · `apps/grid/src/ui/Toolbar.test.tsx`, `ui/App.test.tsx` · `cd apps/grid && bunx vitest run` | autosave-own-view |
| Filter operators | `GET /api/rows/:source?filter=`, `POST /api/views` | integration · `packages/engine/test/filter.test.ts`, `rows.test.ts` · `bun test packages/engine` | none, proven by filter-builder |
| Filter builder | render, `rowsQuery`, `toStoredView` | unit · `apps/grid/src/ui/FilterBuilder.test.tsx` (new), `engine.test.ts` · `cd apps/grid && bunx vitest run` | filter-builder, period-is-a-filter |
| History route | `GET /api/history/:source` | integration · `packages/engine/test/history.test.ts` (new), `route-matrix.test.ts` · `bun test packages/engine` | none |
| History panel | render | unit · `apps/grid/src/ui/HistoryPanel.test.tsx` (new) · `cd apps/grid && bunx vitest run` | history-undo-own |
| Fiche unchanged | the fiche grid | e2e · `e2e/grid-ux.spec.ts` › `fiche-renders-as-before` · `bunx playwright test e2e/grid-ux.spec.ts` | fiche-renders-as-before |
| Share menu, ics | render, `toIcs` | unit · `apps/grid/src/ui/Share.test.tsx` (new), `apps/grid/src/export/ics.test.ts` (new) · `cd apps/grid && bunx vitest run` | share-menu |

## Review Focus
1. **Threat 1:** a `$like` value of `50%_\` matches only the literal text. Test map row 2, asserting a row that a raw pattern would match is absent.
2. **Threat 3:** an owner's history never holds an entry for a row outside its scope, asserted by record id. Test map row 4.
3. **Threat 4:** an owner sees no other account's email. Test map row 4.
4. **Saved views:**
   - a seeded view's stored `$in` filter ("Optie of bevestigd") shows as a chip (row 3);
   - changing it on the locked view stays local, and Kopie maken keeps the local change (row 1).
5. **Periods:**
   - `$period: 'week'` on 2026-12-31 (a Thursday) covers 2026-12-28 to 2027-01-03;
   - `month` in February 2028 ends on the 29th.

   Tested at `filterWhere(…, now)`, with the clock injected there; the HTTP seam takes the real clock (row 2).
6. **Fiche:** fiche, with no dates, shows no date operators and no period; its views behave as before. Test map row 6.
7. **Scrollbars (R9):** jsdom cannot see them; the shake-out's screenshots are their proof.

---

### Task 1: The title line and the bar, quieter (R1, R2, R6, R7, R9)

**Files:**
- Modify:
  - `apps/grid/src/ui/Toolbar.tsx`: remove the save state (`saved`, `modified`, Opslaan) and the one Save button.
  - `apps/grid/src/ui/App.tsx`: autosave.
  - `apps/grid/src/grid/GridBar.tsx`: no sort chip; Kolommen as an icon at the right beside the count.
  - `apps/grid/src/grid/GridHeader.tsx`: the sorted header in the accent colour.
  - `apps/grid/src/ui/app.css`: scrollbars, `::-webkit-scrollbar` plus `scrollbar-width: thin`, both themes.
  - `apps/grid/src/i18n.ts`.
- Also modify:
  - `apps/grid/src/ui/useSavedViews.ts`: autosave, the in-flight follow-up, `duplicate` from `currentOf`. Autosave follows the person's own `setLayout`, never the stored local state: a landing or link applied with `keepLocal` does not save.
  - `apps/grid/src/engine.ts` (`EngineView` gains `public`, `toSavedViews` maps it) and `apps/grid/src/types.ts` (`SavedView.public`), for threat 6.
- Tests: `apps/grid/src/ui/Toolbar.test.tsx`, `ui/App.test.tsx`, and the e2e lines that click "Opslaan" or read "gewijzigd"/"Opgeslagen" (grep `e2e/` for `Opslaan`, `gewijzigd`, `Opgeslagen`, `Start ↑`, `Kolommen`).

**Interfaces:**
- Consumes: the top-level `save` in `useSavedViews.ts:194`; `saveAs`, `duplicate`; `isSaved`/`keepLocal`/`changed` in `apps/grid/src/ui/views.ts`.
- Produces:
  - An own view's arrangement is sent with `save` on every change, debounced 400 ms.
  - A change made while a save is in flight (`sending.current`, `useSavedViews.ts:145`) is sent once that save settles, when `changed(view)` still holds.
  - A locked view keeps the change local (`keepLocal`).
  - No save word renders; a refused or failed save still shows `Niet opgeslagen: …` (`Toolbar.tsx:68-74`).
  - Terugzetten stays in the toolbar's `…` while the view holds a local change (a locked view, a public one, or a change not saved yet). It throws the local change away.
  - One "Kopie maken", the rail's (`ViewList.tsx:49` → `duplicate`). It now copies `currentOf(from)`, the local change included, with `copyKept`/`clearIfSent` as `saveAs` does. The toolbar's save-as button leaves.

- [ ] Step 1: Write the tests:
  - The title line has no "gewijzigd", "Opslaan" or "Opgeslagen".
  - On an own view, a filter change calls `updateView` once after 400 ms.
  - On a seeded view, the change is kept local, and `updateView` is never called.
  - On a public view, the change is kept local; "Publieke weergave bijwerken" saves it (threat 6).
  - On a public view that is not `editable` (a seeded or shared one), "Publieke weergave bijwerken" is absent and Kopie maken is offered.
  - Two changes 300 ms apart, the first PATCH still pending, end with both stored.
  - A refused save still shows `Niet opgeslagen: …`; a save in flight shows nothing.
  - Kopie maken on a locked view with a local change copies the change.
  - Terugzetten shows only while there is a local change, and drops it.
  - The bar has no sort chip.
  - Kolommen is an icon button named "Kolommen" after the row count.
  - A sorted header carries the class `nv-th--sorted`.
- [ ] Step 2: Run them. Expected: FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: Run them. Expected: PASS.
- [ ] Step 5: E2E `autosave-own-view @e2e` in `e2e/toolbar.spec.ts` (new):
  - make a team view;
  - group it differently;
  - reload: the grouping stayed;
  - on the seeded Dagplanning change the grouping, reload in a new tab: the seeded view is unchanged;
  - remove the view it made.
- [ ] Step 6: The task's tests (Global Constraints). Commit `feat(grid): no save words; own views save themselves; sort in the header; Kolommen as an icon; minimal scrollbars`.

### Task 2: The engine's filter operators (R5, R8)

**Files:**
- Modify:
  - `packages/engine/src/filter-compile.ts`: `$like`, `$nlike`, `$period`.
  - `packages/engine/src/filter.ts`: compile them.
  - `packages/engine/src/params.ts` only if `parseRowsParams` filters operators.
- Test: `packages/engine/test/filter.test.ts`, `packages/engine/test/rows.test.ts`.

**Interfaces:**
- `$like: string` and `$nlike: string` on a `text` column:
  - a case-insensitive substring (`LIKE '%' || ? || '%' ESCAPE '\'`, with `%`, `_` and `\` in the value escaped);
  - `$nlike` leaves out rows where the column is null, as `$nin` does; SQLite's LIKE folds ASCII letters only.
- `$period: 'week' | 'next_week' | 'month'` on a `date` or `datetime` column:
  - compiled to `substr(col, 1, 10) BETWEEN ? AND ?`;
  - the days come from the server's local date: Monday to Sunday, or the calendar month.
- Today comes from a `now` that `filterWhere` takes, defaulting to `new Date()`, so tests inject it there.

- [ ] Step 1: Write the tests, at `filterWhere(input, source, table, now)` for the clock and through `GET /api/rows` for the rest:
  - `$like` matches a fixture `note.tekst` "Grote zaal" on "zaal" (the fixture's own words: `bun run check` refuses theatre names in engine tests).
  - `$like` with `50%_\` matches only the literal text: a row containing "50abc" is absent (threat 1).
  - `$like` on a non-text column is 400.
  - `$period` with `now` = 2026-12-31: `week` covers 2026-12-28 to 2027-01-03; `next_week` covers 2027-01-04 to 2027-01-10; `month` covers 2026-12-01 to 2026-12-31; February 2028 ends on the 29th.
  - `$period` with an unknown token, or on a text column, is 400 `bad_filter` on `/rows` and `bad_view` on `POST /views` (threat 2).
  - `$nlike` leaves out empty cells, as `$nin` does (spec Out).
  - `POST /api/views` stores `{ day: { $period: 'week' } }` on the fixture's dated source (`taak.day`).
  - `$like` and `$period` on a `custom.<key>` are 400: the key's type is unknown.
- [ ] Step 2: Run them. Expected: FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: Run them. Expected: PASS.
- [ ] Step 5: Add the three operators to the `docs/SPEC.md` working-tree diff (Revision/filter wording). Do not stage it.
- [ ] Step 6: The task's tests. Commit `feat(engine): $like, $nlike and $period in the filter language`.

### Task 3: The filter builder; the period as a filter (R5, R8)

**Files:**
- Create: `apps/grid/src/ui/FilterBuilder.tsx`, `apps/grid/src/ui/FilterBuilder.test.tsx`.
- Modify:
  - `apps/grid/src/grid/layout.ts`: `Filter` becomes `{ field: string; op: Op; values: string[] }` with `Op = 'in' | 'nin' | 'empty' | 'filled' | 'like' | 'nlike' | 'eq' | 'week' | 'next_week' | 'month' | 'between'`.
  - `apps/grid/src/engine.ts`: `splitFilters`, `mergeFilters` and `rowsQuery`. A condition maps to the engine operator and back, and `fixed` keeps only what the builder cannot show.
  - `apps/grid/src/ui/Filters.tsx`: the chips, with ×, and the Filter button with its count.
  - `apps/grid/src/ui/App.tsx`, `ui/Period.tsx`: Period leaves the bar.
  - `apps/grid/src/ui/Window.tsx`, `ui/App.tsx:209-229`: the window has one source, the condition on the source's declared `date` column. `useWindow` and Period leave.
    - A table sends no `from`/`to`; its date condition is in `filter`.
    - A matrix sends its window as `from`/`to` and leaves the date condition out of `filter`. The window is the condition's days, or the current week when the condition spans over 92 days or there is none.
    - `newRow`/`madeFrom` receive the condition's window where they took `range`, else none (today stays today inside the window, `newRow.ts:25`).
    - The matrix store's `reload` (`App.tsx:250`), the empty hints (`App.tsx:405,409`) and `Sheet` (`App.tsx:413`) read the same window.
    - The export's file name takes the condition's days, else none.
  - `apps/grid/src/grid/filter.ts`: `filterFields` gives each field its operators. `filterRows` drops the condition re-filter: the server is the authority (SQLite's LIKE and the grid's `fold` disagree on diacritics). The search text keeps filtering client-side.
  - `apps/grid/src/grid/Grid.tsx:98`, `apps/grid/src/matrix/Matrix.tsx:149`: call `filterRows` with the search only.
  - `apps/grid/src/ui/views.ts` (`toStored`, `comparable`), `apps/grid/src/ui/useFilterNames.ts:35`: the new `Filter` shape.
  - `apps/grid/src/grid/layout.ts`: `filter()` holds one condition per field and operator; `parse` (:94) reads the new shape; the stored layout key moves from `v1` to `v2`, so an old local copy is dropped, not misread.
  - `apps/grid/src/ui/hash.ts`: a link carries the conditions as `#view=<key>&f=<json>`.
    - Link kopiëren (Task 5) composes it at the click; `f` is never written on an ordinary change.
    - A landing applies `f` only when `view` resolves to that exact key. The conditions become a local change, not saved (an own view saves only on the person's own next change).
    - A malformed `f` is dropped. `f` leaves the hash once applied, so a reload does not apply it again.
    - `from`/`to`/`period` are no longer read from the hash: an old address with them lands on the view without a date condition from the address.
    - A date field holds one date condition, from the builder or a link: a new one (`week`, `next_week`, `month`, `between`) replaces the field's existing one (`$period` or `$gte`/`$lte`). It is never stored beside it, and the builder does not offer a second.
    - `f` is applied or dropped only once the saved views have answered (`settled`, `App.tsx:182`), so a saved view's key resolves before the check.
  - `packages/theatre/src/seed.ts`: Dagplanning's `filters: { plandag: { $period: 'week' } }`; `--seed-missing` brings the system view up to date.
- Tests: `FilterBuilder.test.tsx`, `apps/grid/src/engine.test.ts`, `packages/theatre/test/seed-missing.test.ts`, `packages/theatre/test/grid-ux.test.ts`. Also the e2e that use the period chip: grep `Periode`, `period-chip`, `nv-period`, `Vorige periode`, `Volgende periode`, `period=all` in `e2e/`. The `#from=` landings stop narrowing. A shared helper takes the view and the week: it resolves the view's key, then lands on `#view=<key>&f=<the date condition for that week>`, so `f` targets the view the flow then reads. The helper replaces `land(page, hash)`, which knows no view.
  - Rewrite:
    - `e2e/dagplanning.spec.ts:56` (`openDagplanning`), and `:609` (`period-empty-result`);
    - `e2e/grid-ux.spec.ts:70` (`land`) and its callers;
    - `e2e/step-1.spec.ts:148` (its own `land`) and the calls at 205, 337, 345, 442 and 480. The comment at 205 ("The window is the app's, not the view's") goes;
    - `e2e/step-0b.spec.ts:5,24`, which then opens Dagplanning at 122 and 141;
    - `e2e/step-0d.spec.ts:5,35,327`: the matrix at 117–172 reads 2026-10-12, so it lands with a date condition; Dagplanning at 210;
    - `e2e/step-0e.spec.ts:39,86,91,418`: Afwezigheden at 89 and the empty text at 93 (lowercase "periode");
    - `e2e/title-line.spec.ts:9,25`: it expects a visible Dagplanning row, which on "deze week" depends on the run's date;
    - `e2e/step-0a.spec.ts:4,13`: Planning's day sections at 93–95 (Planning loses its default week);
    - flows that step with ‹ › ("Vorige/Volgende periode").
  - Harmless (the `#from=` is now ignored): `e2e/rail-tree.spec.ts:7,27`, `e2e/dagplanning.spec.ts:584,668` (tree only). `e2e/smoke/dagplanning.spec.ts:6` (sign-in page) is rewritten to land with `#view=&f=` so the smoke test checks an address the app reads.
- Also amend the `docs/SPEC.md` working-tree Sidebar line ("The period is a filter chip … with the window in the URL"): the period is a condition on the date column, stored in the view; a matrix reads the condition's days, else the current week.

**Interfaces:**
- Consumes: Task 2's operators; `RelationPicker` for relation values, with `before`/`hide` as the people box uses them; the option lists for choices, searched the same way.
- Produces: the mapping from conditions to engine operators.

| Op | Engine filter |
| --- | --- |
| `in` | `$in: values` (one value: `$eq`) |
| `nin` | `$nin` |
| `empty` | `$exists: false` |
| `filled` | `$exists: true` |
| `like` | `$like` |
| `nlike` | `$nlike` |
| `eq` | `$eq` |
| `week`, `next_week`, `month` | `$period` |
| `between` | `$gte` and `$lte` (on a datetime, `$lte` takes the day's `T23:59:59`, as `api.ts:99` does) |

- One field holds at most one condition per engine key (the stored object's keys): `week`/`next_week`/`month` share `$period`, `empty`/`filled` share `$exists`, and a one-value `in` is `$eq`. The builder does not offer a second period, emptiness or equality condition on a field.

- [ ] Step 1: Write the tests:
  - Each Op maps to its engine filter and back.
  - A seeded `$in` filter shows as a chip "Status is Optie of Bevestigd".
  - In the builder: a row per condition; the operators follow the field type; a choice value box searches and lists only what is not chosen; Backspace on an empty search removes the last value.
  - A chip's × removes its condition.
  - There is no Periode chip.
  - The rows request carries the conditions as `filter`.
  - "ligt tussen" on a datetime keeps a row at 09:00 on the last day.
  - A landing with `#view=&f=` shows its conditions and does not save them; on a saved view's key it applies once the saved views have answered.
  - A linked date condition replaces the view's own (`$period`), not beside it.
  - An old `v1` local layout is ignored, not misread.
  - A matrix reads the date condition's window, else the current week.
- [ ] Step 2: Run them. Expected: FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: Run them. Expected: PASS.
- [ ] Step 5: E2E flows:
  - `filter-builder @e2e`: add "Soort is Repetitie of Opbouw" by searching; add "Omschrijving bevat 'zaal'"; the rows narrow; remove one chip; reload keeps the rest.
  - `period-is-a-filter @e2e`: Dagplanning opens with "Plandag deze week"; × shows every date; "ligt tussen" two dates narrows again.
  - `filter-link @e2e`: on the seeded Dagplanning, copy the address with two conditions; open it in a fresh context; the same chips show and the view is unchanged on the server.
  - In `fiche-renders-as-before`: the builder opens and offers the fiche's text operators (bevat, bevat niet, is, is leeg).
  - Both in `e2e/toolbar.spec.ts`.
- [ ] Step 6: The task's tests. Commit `feat(grid): a filter builder; the period is a filter`.

### Task 4: History (R3)

**Files:**
- Create: `packages/engine/src/history.ts`, `packages/engine/test/history.test.ts`, `apps/grid/src/ui/HistoryPanel.tsx`, `apps/grid/src/ui/HistoryPanel.test.tsx`. (`ui/history.ts` is the tab's undo stack; the panel's name keeps them apart.)
- Modify: `packages/engine/test/fixture.ts`. `note_lijst` gains `creates: 'note'` for the mapped-columns case. For the denial, add a dataset `stempel` with a `project_id` column (relation `project`), no `owners`, and a `create` writer; and a query `stempel_lijst` that selects `id, project_id, …` from `stempel`, with `owners: { owner: 'project_id' }` and `creates: 'stempel'`. Update the tests that list the fixture's sources exactly: `access.test.ts:99-100`, `rows.test.ts:256-265`, `writes.test.ts:214-229` and `:442-450`, and `route-matrix.test.ts`. Keep the new names off the vocabulary list (`bun run check`). Also `packages/engine/src/app.ts` (route), `packages/engine/test/route-matrix.test.ts` (two rows: `/api/history/taak`, owner 200; `/api/history/plat`, owner 404; both unauthenticated 401), `apps/grid/src/api.ts`, `apps/grid/src/ui/Toolbar.tsx` (icon button), `apps/grid/src/ui/App.tsx`, `apps/grid/src/i18n.ts`.

**Interfaces:**
- `GET /api/history/:source?filter&from&to&entries`.
- It reads the source's row ids exactly as `/rows` would, through the caller's scope.
- For a query, the records are its `creates` dataset's: the query's `id` is that dataset's id, by the `creates` promise. A query without `creates` (Per productie per dag, Voorstellingen) answers no entries, and neither does one whose `creates` dataset the caller cannot read.
- Query: the same parameters `rowsQuery` builds for the view (`filter`, `from`, `to`, scope included). The ids are read at `MAX_LIMIT` and in chunks of 500 (`rows.ts` `CHUNK`). `entries` caps the entries: default 50, at most 100. It is not `limit`, which `parseRowsParams` reads as a row cap.
- For a query source, an id stays only when it is also in the `creates` dataset's own scope for the caller (`inScope(scopeOf(actor, dataset), row)`, as `readRevisions` does, `writes.ts:415`).
- It answers `{ entries: [{ batch, at, by: 'self' | 'account' | 'system' | 'gone' | 'hidden', actor: string | null, undoable: boolean, batch_kind, created: boolean, record: { id, title }, changes: [{ field, label, old, new }] }] }`, newest batch first, one entry per batch per record.
  - `changes` hold only the source's columns. For a query these are its mapped `writes.field`s, labelled with the query's labels.
  - A relation's old and new values come as titles.
  - A create is one entry with `created: true`.
- `by` says whose: `self` (the caller), `account` (another account, with `actor` its email), `system` (actor -1), `gone` (an account that no longer exists), or `hidden` (another account, to an owner caller: `actor` null, threat 4).
- The grid renders `self` → "jij", `system` → "systeem", `hidden` → "planning", `gone` → "onbekend", `account` → the email. A disabled account still has its row and email: it is `account`; `gone` is an actor id with no row.
- One batch spanning several records gives an entry per record, each `undoable`: undoing one undoes the whole batch, and the panel says so ("Dit maakt ook N andere wijzigingen ongedaan"). A refusal (409 `changed_since`) shows as the undo toast does today.
- `undoable` follows threat 5.

- [ ] Step 1: Write the engine tests:
  - Entries for the view's rows, newest first.
  - An owner's history holds no entry for a row outside its scope, asserted by record id (threat 3).
  - An owner sees no other account's email (threat 4).
  - `by` is `self` only for the caller's batches, `system` for -1, `hidden` for an owner reading another's.
  - An owner's history holds no id that is in the query's scope but not in the `creates` dataset's own scope.
  - A query without `creates` (the fixture's `per_project`) answers no entries; the theatre's `productie_dag` answering none is tested in `packages/theatre/test`.
  - A query whose `creates` dataset the caller cannot read answers no entries.
  - The changes of a query entry hold only its mapped columns.
  - A `mine` entry that holds a delete, or a seed batch, has `undoable: false`.
  - The route-matrix row: unauthenticated 401.
  - An unreadable source is 404.
- [ ] Step 2: Write the grid tests:
  - The panel lists entries grouped by day.
  - Ongedaan maken shows only when `undoable` and calls the batch undo.
  - The actor renders as "jij", "systeem", "planning", "onbekend" or the email.
  - After an undo the list and the view read again.
- [ ] Step 3: Run them. Expected: FAIL.
- [ ] Step 4: Implement.
- [ ] Step 5: Run them. Expected: PASS.
- [ ] Step 6: E2E `history-undo-own @e2e`: change a status; open Geschiedenis; the entry is there with Ongedaan maken; undo; the status is back. Clean up.
- [ ] Step 7: The route's line goes into the `docs/SPEC.md` working-tree diff.
- [ ] Step 8: The task's tests. Commit `feat: a view's history, read through the caller's scope`.

### Task 5: Exporteren / delen (R4)

**Files:**
- Create: `apps/grid/src/ui/Share.tsx`, `ui/Share.test.tsx`, `apps/grid/src/export/ics.ts`, `export/ics.test.ts`.
- Modify: `apps/grid/src/ui/Toolbar.tsx` (icon button; Exporteren leaves `…`), `apps/grid/src/ui/App.tsx`, `apps/grid/src/api.ts` (the share-token call, absent today). `SavedView.public` comes from Task 1.

**Interfaces:**
- `toIcs(rows: Row[], view: View, columns: Column[]): string`. It writes one VEVENT per row with a date:
  - SUMMARY is the title;
  - DTSTART/DTEND come from the date column, or the datetime range (the grid's `range`);
  - DESCRIPTION is the view's other visible columns as "label: text" lines.

  There is no LOCATION: the grid cannot tell which column is a place without a domain word. Lines are CRLF, folded at 75 octets, and text is escaped. The download is `<view>.ics`.
- Link kopiëren copies the address Task 3 writes: `view` plus `#f=` with the conditions. Then a toast: "Link gekopieerd".
- Publiceren shows only for an administrator.
  - It calls the existing `PUT /api/views/:id/share-token` and shows the public data address (`/api/public/views/<token>`, JSON for the website) once, with a copy button.
  - On a dataset view the engine answers `not_query`; the menu then says publishing works on a computed view only.
  - A second publish rotates the token and the old address stops (`views.ts:308`), so the menu asks first: "Nieuwe link maken? De vorige stopt."
  - The grid learns `public` from `ViewOut`.

- [ ] Step 1: Write the tests:
  - `toIcs`: two rows give two VEVENTs with escaped commas and semicolons, folded long lines and CRLF.
  - The menu lists Excel, Agenda, Link kopiëren, and Publiceren only for an administrator.
  - Link kopiëren writes the address to the clipboard, conditions included.
  - Publiceren on a public view asks before rotating.
- [ ] Step 2: Run them. Expected: FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: Run them. Expected: PASS.
- [ ] Step 5: E2E `share-menu @e2e`: the menu's items as the editor, and as the administrator; the .ics download has the view's rows.
- [ ] Step 6: The task's tests, then the full `bun run gate`. Commit `feat(grid): Exporteren / delen — Excel, agenda, link, publiceren`.
