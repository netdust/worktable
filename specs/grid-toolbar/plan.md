# Grid Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The grid's title line loses its save words and gains Geschiedenis and Exporteren/delen. The filter bar becomes a real filter builder, with the period as an ordinary condition. Sorting shows in the header. The scrollbars get minimal.

**Architecture:**
- **Mostly grid.** The engine gains three filter operators and one read-only route:
  - `$like` / `$nlike` for "bevat" on text;
  - `$period` for a date relative to today, so a stored "deze week" moves with the calendar;
  - `GET /history/:source`.
- **Conditions are stored as engine filters.** A condition in the builder is stored in the view's `filters` as the engine's own filter language, which `filterWhere` already validates on save (`packages/engine/src/views.ts:96`).
- **First working version:** Task 1 (the title line without save words, the bar without the sort and period chips, Kolommen as an icon, minimal scrollbars).

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
2. **A `$period` value that is not one of the fixed tokens.** **Mitigation:** `filter-compile.ts` accepts only `week`, `next_week` and `month`, and only on a `date` or `datetime` column; anything else is 400 `bad_filter`.
3. **History shows changes to rows the caller cannot read** (another project's, an owner's neighbours'). **Mitigation:** `GET /history/:source` first reads the source's row ids through the same `readRows` scope and parameters as `/rows`, then reads revisions only for those ids (`packages/engine/src/history.ts`, new).
4. **History leaks colleagues' emails to an owner account.** **Mitigation:** an entry's actor is the account's email only for a caller who is not an owner. An owner sees "planning" for anyone else and "jij" for itself.
5. **Undo from the panel on someone else's change.** **Mitigation:** no new route. Undo is the existing `POST /batches/:id/undo`, which refuses another account's batch (403). The panel offers undo only on the caller's own entries.

**Deferrals:** none.

## Test map
| Unit | Seam | Tests: tier · file · command | E2E flows |
| --- | --- | --- | --- |
| Title line, bar, scrollbars | render | unit · `apps/grid/src/ui/Toolbar.test.tsx`, `ui/App.test.tsx` · `cd apps/grid && bunx vitest run` | autosave-own-view |
| Filter operators | `GET /api/rows/:source?filter=`, `POST /api/views` | integration · `packages/engine/test/filter.test.ts`, `rows.test.ts` · `bun test packages/engine` | none, proven by filter-builder |
| Filter builder | render, `rowsQuery`, `toStoredView` | unit · `apps/grid/src/ui/FilterBuilder.test.tsx` (new), `engine.test.ts` · `cd apps/grid && bunx vitest run` | filter-builder, period-is-a-filter |
| History route | `GET /api/history/:source` | integration · `packages/engine/test/history.test.ts` (new) · `bun test packages/engine` | none |
| History panel | render | unit · `apps/grid/src/ui/History.test.tsx` (new) · `cd apps/grid && bunx vitest run` | history-undo-own |
| Share menu, ics | render, `toIcs` | unit · `apps/grid/src/ui/Share.test.tsx` (new), `apps/grid/src/export/ics.test.ts` (new) · `cd apps/grid && bunx vitest run` | share-menu |

## Review Focus
1. **Threat 1:** a `$like` value of `50%_\` matches only the literal text. Test map row 2, asserting a row that a raw pattern would match is absent.
2. **Threat 3:** an owner's history never holds an entry for a row outside its scope, asserted by record id. Test map row 4.
3. **Threat 4:** an owner sees no other account's email. Test map row 4.
4. **Saved views:**
   - a seeded view's stored `$in` filter ("Optie of bevestigd") shows as a chip;
   - changing it on the locked view stays local;
   - Kopie maken keeps it.

   Test map row 3.
5. **Periods:**
   - `$period: 'week'` on 2026-12-31 (a Thursday) covers 2026-12-28 to 2027-01-03;
   - `month` in February 2028 ends on the 29th.

   Test map row 2, with an injected clock.
6. **Fiche:** fiche, with no dates, shows no date operators and no period; its views behave as before. The fiche e2e.

---

### Task 1: The title line and the bar, quieter (R1, R2, R6, R7, R9)

**Files:**
- Modify:
  - `apps/grid/src/ui/Toolbar.tsx`: remove the save state (`saved`, `modified`, Opslaan) and the one Save button.
  - `apps/grid/src/ui/App.tsx`: autosave; the save-as path stays in `…` as Kopie maken.
  - `apps/grid/src/grid/GridBar.tsx`: no sort chip; Kolommen as an icon at the right beside the count.
  - `apps/grid/src/grid/GridHeader.tsx`: the sorted header in the accent colour.
  - `apps/grid/src/ui/app.css`: scrollbars, `::-webkit-scrollbar` plus `scrollbar-width: thin`, both themes.
  - `apps/grid/src/i18n.ts`.
- Tests: `apps/grid/src/ui/Toolbar.test.tsx`, `ui/App.test.tsx`, and the e2e lines that click "Opslaan" or read "gewijzigd"/"Opgeslagen" (grep `e2e/` for `Opslaan`, `gewijzigd`, `Opgeslagen`, `Start ↑`, `Kolommen`).

**Interfaces:**
- Consumes: `useSavedViews` actions (`update`, `saveAs`); `isSaved`/`keepLocal` in `apps/grid/src/ui/views.ts`.
- Produces: an own view's arrangement is sent with `updateView` on every change, debounced 400 ms. A locked view keeps it local (`keepLocal`). No save word renders.

- [ ] Step 1: Write the tests:
  - The title line has no "gewijzigd", "Opslaan" or "Opgeslagen".
  - On an own view, a filter change calls `updateView` once after 400 ms.
  - On a seeded view, the change is kept local, and `updateView` is never called.
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
  - `$nlike` also keeps rows where the column is null.
- `$period: 'week' | 'next_week' | 'month'` on a `date` or `datetime` column:
  - compiled to `substr(col, 1, 10) BETWEEN ? AND ?`;
  - the days come from the server's local date: Monday to Sunday, or the calendar month.
- Today comes from a `now` the compiler takes, defaulting to `new Date()`, so tests inject it.

- [ ] Step 1: Write the tests:
  - `$like` matches "Repetitie" on "repet".
  - `$like` with `50%_\` matches only the literal text: a row containing "50abc" is absent (threat 1).
  - `$nlike` keeps nulls.
  - `$like` on a non-text column is 400.
  - `$period` with `now` = 2026-12-31: `week` covers 2026-12-28 to 2027-01-03; `next_week` covers 2027-01-04 to 2027-01-10; `month` covers 2026-12-01 to 2026-12-31; February 2028 ends on the 29th.
  - `$period` with an unknown token, or on a text column, is 400 `bad_filter` (threat 2).
  - `POST /api/views` stores `{ plandag: { $period: 'week' } }` on the fixture's dated source.
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
  - `apps/grid/src/ui/Window.tsx`: the matrix window comes from a date condition, else the current week.
  - `apps/grid/src/grid/filter.ts`: `filterFields` gives each field its operators.
  - `packages/theatre/src/seed.ts`: Dagplanning's `filters: { plandag: { $period: 'week' } }`; `--seed-missing` brings the system view up to date.
- Tests: `FilterBuilder.test.tsx`, `apps/grid/src/engine.test.ts`, `packages/theatre/test/seed-missing.test.ts`, `packages/theatre/test/grid-ux.test.ts`. Also the e2e that use the period chip: grep `Periode`, `period-chip`, `nv-period` in `e2e/`. Their landings `#from=` keep working for the matrix and stop narrowing tables. Update them to add a "Plandag ligt tussen" condition, or to land on a date the seed fills.

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
| `between` | `$gte` and `$lte` |

- One field holds at most one condition per operator (the stored object's keys). The builder does not offer a second condition with the same field and operator.

- [ ] Step 1: Write the tests:
  - Each Op maps to its engine filter and back.
  - A seeded `$in` filter shows as a chip "Status is Optie of Bevestigd".
  - In the builder: a row per condition; the operators follow the field type; a choice value box searches and lists only what is not chosen; Backspace on an empty search removes the last value.
  - A chip's × removes its condition.
  - There is no Periode chip.
  - The rows request carries the conditions as `filter`.
  - A matrix reads the date condition's window, else the current week.
- [ ] Step 2: Run them. Expected: FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: Run them. Expected: PASS.
- [ ] Step 5: E2E flows:
  - `filter-builder @e2e`: add "Soort is Repetitie of Opbouw" by searching; add "Omschrijving bevat 'zaal'"; the rows narrow; remove one chip; reload keeps the rest.
  - `period-is-a-filter @e2e`: Dagplanning opens with "Plandag deze week"; × shows every date; "ligt tussen" two dates narrows again.
  - Both in `e2e/toolbar.spec.ts`.
- [ ] Step 6: The task's tests. Commit `feat(grid): a filter builder; the period is a filter`.

### Task 4: History (R3)

**Files:**
- Create: `packages/engine/src/history.ts`, `packages/engine/test/history.test.ts`, `apps/grid/src/ui/History.tsx`, `apps/grid/src/ui/History.test.tsx`.
- Modify: `packages/engine/src/app.ts` (route), `apps/grid/src/api.ts`, `apps/grid/src/ui/Toolbar.tsx` (icon button), `apps/grid/src/ui/App.tsx`.

**Interfaces:**
- `GET /api/history/:source?filter&from&to&limit` (limit ≤ 100, default 50).
- It reads the source's row ids exactly as `/rows` would, through the caller's scope.
- For a query, the records are its `of` dataset's (the row id is that dataset's id, as `creates` promises); without `of`, a query has no history (empty list).
- It answers `{ entries: [{ batch, at, actor: string, mine: boolean, kind, record: { id, title }, changes: [{ field, label, old, new }] }] }`, newest batch first, one entry per batch per record.
- `actor` is the account's email; for an owner caller it is "planning" for others and "jij" for itself (threat 4).

- [ ] Step 1: Write the engine tests:
  - Entries for the view's rows, newest first.
  - An owner's history holds no entry for a row outside its scope, asserted by record id (threat 3).
  - An owner sees no other account's email (threat 4).
  - `mine` is true only for the caller's batches.
  - A query without `of` answers no entries.
  - An unreadable source is 404.
- [ ] Step 2: Write the grid tests:
  - The panel lists entries grouped by day.
  - Ongedaan maken shows only when `mine` and calls the batch undo.
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
- Modify: `apps/grid/src/ui/Toolbar.tsx` (icon button; Exporteren leaves `…`), `apps/grid/src/ui/App.tsx`.

**Interfaces:**
- `toIcs(rows: Row[], view: View, columns: Column[]): string`. It writes one VEVENT per row with a date:
  - SUMMARY is the title;
  - DTSTART/DTEND come from the date column, or the datetime range (the grid's `range`);
  - DESCRIPTION is the view's other visible columns as "label: text" lines.

  There is no LOCATION: the grid cannot tell which column is a place without a domain word. Lines are CRLF, folded at 75 octets, and text is escaped. The download is `<view>.ics`.
- Link kopiëren copies `location.href` (view, filters, period are in the hash). Then a toast: "Link gekopieerd".
- Publiceren shows only for an administrator. It calls the existing `PUT /api/views/:id/share-token` and shows the public link once, with a copy button. On a dataset view the engine answers `not_query`; the menu then says publishing works on a computed view only.

- [ ] Step 1: Write the tests:
  - `toIcs`: two rows give two VEVENTs with escaped commas and semicolons, folded long lines and CRLF.
  - The menu lists Excel, Agenda, Link kopiëren, and Publiceren only for an administrator.
  - Link kopiëren writes the address to the clipboard.
- [ ] Step 2: Run them. Expected: FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: Run them. Expected: PASS.
- [ ] Step 5: E2E `share-menu @e2e`: the menu's items as the editor, and as the administrator; the .ics download has the view's rows.
- [ ] Step 6: The task's tests, then the full `bun run gate`. Commit `feat(grid): Exporteren / delen — Excel, agenda, link, publiceren`.
