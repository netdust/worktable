# Step 3e: the app behaves and looks like the mockups — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every skin uses one toolbar in one way, the board drags, and the drawer, the cards and the other gaps read as `design/*-prototype.html`.

**Architecture:** `apps/grid` only, plus the theatre package for three ruled data changes: seeding `rol_id` (Q8), the werklijst context column (Q13) and the substitute candidates (Q4).
- The period becomes one pure module, `ui/period.ts`. It reads the view's date condition and writes it back. App, ChipBar and Filters consume it, so the period never doubles as a chip.
- Board drag uses react-aria's `useDragAndDrop` and writes through the grid store App already builds.
- The drawer is rebuilt once in `grid/Drawer.tsx` from parts derived from model metadata. The schema (models, space, tables) comes from one `SchemaContext` that App provides. The row's own `model`, and optionally its `view`/`layout` (for hidden columns) and `nav: { ids, onStep }` (for N van M and ↑ ↓), come as props from each of the five mounts (`useOpenRow.tsx`, `Calendar.tsx`, `Grid.tsx`, `Dashboard.tsx`, `Matrix.tsx`). The Grid's related drawer, the Dashboard and the Matrix cell pass no `nav`: they show no position and no stepping.
- The held engine items (Q1, Q2, Q6, Q11) are the last tasks and are built only on Stefan's yes.

**First working version:** Task 1, the period. It fixes what Stefan hit first: Maand twice, the doubled chip, and the chips that come and go. It is visible on every skin.

**Simplest design:** Fix each symptom where it shows. That means hiding the date chip in Filters, letting a lit Maand clear, and always passing a period in App. That is roughly what step 3d did, and it left four separate rules about one fact. The plan instead names the fact once: `periodOf(view, layout, today)` returns the controlled condition, its window, its kind and its name, plus `setPeriod`, `clearPeriod`, `stepPeriod`, `todayPeriod` and `toMonth`/`toWeek` as pure layout-to-layout functions. Every consumer reads that. It is the smallest change that makes "same on every skin" true by construction rather than by checklist. Everything else is restyle-in-place or one new component per mockup part (drawer sections, board column list); nothing parallel.

**Tech Stack:** React 19, react-aria-components 1.22, Vite, Vitest + Testing Library (jsdom), Playwright e2e, Bun.

**Spec:** `specs/step-3e/spec.md`

**Execution:** native (Stefan's default via worktable-ac). There is no security-boundary unit, and each task's interfaces are local.

## Global Constraints

- No change in `packages/engine` until Stefan rules on Q1/Q2/Q6/Q11. On a yes, `docs/SPEC.md` changes first, in its own commit.
- Theatre changes only:
  - the seed's `rol_id` on toewijzingen (Q8);
  - a `context` column in werklijst.sql (Q13);
  - substitute candidates for an assigned slot. This is a separate query or column; `kandidaten.sql`'s rows, order and tests stay unchanged (Q4).
- `apps/grid` holds no domain word. Kind, parent, inherited, inbound and warn option are all derived from model metadata (`Field.tones`, `Schema.space`, `Field.via`, relations, `links`, lifecycle).
- Stefan's rules:
  - no coloured rounded borders;
  - one toolbar, used the same way on every skin;
  - no cockpit density;
  - side panels only.
- Values come from the mockup CSS, copied. Strings are Dutch, in `i18n.ts`.
- Commit by path, never `git add -A`. The untracked `*.url` files are never added.
- No full gate between fixes. Vitest and targeted e2e only. The gate runs alone at the close.
- Ports:
  - e2e on 4311/5174/4312/5175;
  - scratch engine 4371 and Vite 5197 for the compare shots;
  - never 4321/5181/5190 (worktable-ac's preview) or 4330/5180/4341 (Laika), and never `~/laika-export`.

## Review Focus

1. **A view with an unusual period:** its date condition is `today`, `next_week` or a hand-set `between` that is neither a week nor a month. The control shows, no chip is lit, the name is `formatWindow`, and steps move by the window's length → Task 1 rows (`period.test.ts`).
2. **A view whose date condition was set in the filter builder** on `view.date_field`. It is the period. It never shows twice, and the builder doesn't list it → Task 1 (`App.test.tsx` period block).
3. **A board drop that the writer refuses** (lifecycle on Bord toewijzingen' `state`). The card returns, the error shows, and history holds no entry → Task 3 (`Board.test.tsx`; e2e `board-drag-refused`, which step 3f moved to `e2e/step-3f.spec.ts`).
4. **A layout group that isn't the board's declared column, sent as `/rows ?group=`.** The engine accepts any source column (`params.ts:121`); the e2e proves the board regroups → Task 2 (e2e `groep-everywhere`).
5. **A record with no kind, no space relation and no dated inbound.** The drawer head is the dataset name alone, and there's no subline and no sections, with nothing broken → Task 5 (`Drawer.test.tsx`).
6. **History on a query row** (Per persoon per dag, Werklijst): `/history/:source?filter={"id":N}` answers 400 on a query. Geschiedenis is hidden when `model.query` → Task 5 (`Drawer.test.tsx`).
7. **"N van M" when the open row leaves the view** (edited out by a filter). The position shows "–" and ↑ ↓ are disabled → Task 5.

## Test map

| Unit | Seam | Tests: tier · file · command | E2E flows |
|---|---|---|---|
| Period model | `periodOf`, `todayPeriod`, `pressMonth/Week`, `stepPeriod` | unit · `apps/grid/src/ui/period.test.ts` · `bun run --filter @worktable/grid test period` | period-sequence (6 skins) |
| Toolbar wiring (period, chips, Groep, skin chips, Kolommen) | render `App` | component · `ui/App.test.tsx`, `ui/ChipBar.test.tsx`, `ui/Filters` in `FilterBuilder.test.tsx` · grid vitest | period-sequence, groep-everywhere |
| Board | render `Board` with a store | component · `board/Board.test.tsx` (new) · grid vitest | board-column-plus-in-window (the column's option is not asked and is sent); the drags are step 3f's: board-sorted-cross-column (mouse, ⌘Z on the page), board-keyboard (→ and ←), board-drop-between (every card fits its column) |
| Hints and period keys | render `App` per skin | component · `App.test.tsx` · grid vitest | period-sequence (keys on calendar) |
| Drawer anatomy | render `Drawer` | component · `grid/Drawer.test.tsx` · grid vitest | drawer-anatomy (grid, calendar) |
| Matrix cell drawer, Bezet, role line, Afwezigheden | render `Matrix`, `Panel` | component · `matrix/Matrix.test.tsx`, `matrix/Panel.test.tsx` · grid vitest | matrix-cell-drawer |
| Substitute candidates | `GET /rows/<query>` | integration · `packages/theatre` tests · `bun test packages` | matrix-cell-drawer |
| Seed rol_id, werklijst context | seed and query | integration · theatre seed and query tests · `bun test packages` | none — proven by flow |
| Gallery sections, S M L | render `Gallery` | component · `gallery/Gallery.test.tsx` (new) · grid vitest | gallery-sections (Task 7) |
| Calendar packing | `blocksOf` | unit · `calendar/layout.test.ts` · grid vitest | none — proven by compare pair |
| Rail counts, insight, Bezetting column, hover card | render `Rail`, `Toolbar`, `Grid` | component · existing test files · grid vitest | none — proven by compare pair |
| Dashboard | render `Dashboard` | component · `dashboard/*.test.tsx` · grid vitest | none — proven by compare pair |

## Tasks

### Task 1: One period (A1–A6, R1–R5, A9)

**Files:**
- Create: `apps/grid/src/ui/period.ts`, `ui/period.test.ts`
- Modify: `ui/App.tsx`, `ui/ChipBar.tsx`, `ui/Filters.tsx`, `ui/FilterBuilder.tsx`, `ui/bar.ts`, `ui/Toolbar.tsx`, `i18n.ts`

**Interfaces (produces):**
```ts
type PeriodKind = 'week' | 'month' | 'other' | null
interface Period { field: string; condition: Filter | null; window: DateWindow | null; kind: PeriodKind; name: string | null; optional: boolean }
periodOf(view: View, layout: Layout, today: Date): Period | null   // null when the view has no date_field
todayPeriod(p: Period): Filter      // op 'week' or 'month' (relative), per the lit kind; 'week' when none
pressMonth(p: Period, today: Date): Filter | null // lit and optional → null (clear); lit and required → unchanged; else the month of the week's Thursday
pressWeek(p: Period, today: Date): Filter | null  // lit and optional → null; else today's week if the month holds today, else the month's first week
stepPeriod(p: Period, by: 1 | -1): Filter | null // 'between' fixed dates; null (inert) when no window
withPeriod(layout: Layout, field: string, next: Filter | null): Layout
```
`optional` is true for grid, board and gallery. A required skin (calendar, timeline, matrix) with no condition gets the window it shows today: `calendarWindow`, `timelineWindow`, `matrixDays`.

- [ ] Write `period.test.ts` covering:
  - lit Maand on grid → cleared;
  - lit Maand on calendar → unchanged;
  - Vandaag from none → `{op:'week'}`;
  - Vandaag in a month → `{op:'month'}`;
  - Week from oktober 2026 with today 14 okt → 12–18 okt;
  - Week from november 2026 → 2–8 nov;
  - › from `week` → `between` 19–25 okt;
  - ‹ ›, no period → null;
  - `today` op → kind 'other', name "14 okt";
  - name "Week 42 · 12–18 okt" / "oktober 2026" / "deze week".
  Run: it fails.
- [ ] Implement `period.ts`.
- [ ] Wire it in:
  - App computes `period` once from `periodOf` and replaces `dateCondition`, `showDays` and the `period` ternary.
  - Filters and FilterBuilder receive the filters without `period.condition` and merge it back on change.
  - Toolbar's summary pill shows `period.name` on every skin. Calendar and Timeline stop setting `label` themselves.
  - ChipBar's PeriodChips takes `Period` plus `onPeriod(next: Filter | null)`.
  - ‹ › get `disabled` when there's no window.
  - A non-period date chip gets the Calendar icon and Dutch dates, via a `betweenDays` formatter using `formatWindow`.
  - Maand renders before Week.
  - App stops nulling `shown` on the matrix, so its pill shows the period too.
- [ ] App tests:
  - a grid with a date field and no condition shows the period chips;
  - clicking Maand, then Maand again, leaves no date condition and no chip;
  - a calendar keeps Maand lit after a second press;
  - no "Plandag · tussen" chip text anywhere.
  Run grid vitest: green.
- [ ] e2e `e2e/step-3e.spec.ts` › `period-sequence`, per skin (grid Planning, board Per status, gallery Galerij activiteiten, calendar Kalender activiteiten, timeline Tijdlijn tourstops, matrix Toewijzingen per activiteit): Maand, Maand again, Week, ›, Vandaag, remove (grid/board/gallery only). Assert the lit chips, the title pill and the absence of a period chip. Bord toewijzingen (no date) shows no period control.
- [ ] Commit.

### Task 2: Groep everywhere, skin chips, chip anatomy, Kolommen on card skins (A7, A8, R6, R7, D10)

**Files:** `ui/bar.ts`, `ui/ChipBar.tsx`, `ui/App.tsx`, `board/Board.tsx`, `gallery/Gallery.tsx`, `calendar/Calendar.tsx`, `timeline/Timeline.tsx`, `grid/layout.ts`, `app.css`

**Interfaces:**
- `GroupSlot` always has `options` and `onChange`.
  - Board: the select fields, with `column = layout.group ?? view.board.column`.
  - Gallery: date and select fields plus none.
- `ChipBarProps.skin?: ReactNode` is rendered after the period and before + Kolom.
- `Layout.size?: 'S'|'M'|'L'` for the gallery.
- `Layout.hidden` and `Layout.order` drive card and bar facts through a `factsOf(view, model, layout): string[]` in `ui/facts.ts`.

- [ ] Write the tests first:
  - Groep on the board lists Status and Soort and regroups the columns;
  - the Kolommen panel on the board hides a card fact;
  - the gallery's Groep lists the date and select fields plus geen;
  - the date chip has an svg.
- [ ] Implement. The engine accepts `?group=` on any source column (`engine/src/params.ts:121`), so the board sends `layout.group` as is.
- [ ] CSS from `grid-prototype.html` for the count bubble, the ×, the Filter icon and the Kolommen radius. Add matrix Afwezigheden and gallery S M L as `skin` chips.
- [ ] e2e `groep-everywhere`: Groep is a chooser on every skin; board regroup.
- [ ] Commit.

### Task 3: Board drag, column +, empty text, card face (B1–B3, B5)

**Files:**
- Create: `board/Board.test.tsx`, `board/Card.tsx`
- Modify: `board/Board.tsx`, `ui/App.tsx` (pass `store` and its painted rows), `dashboard/QuickCreate.tsx` (`preset?: Record<string, unknown>`), `app.css`, `i18n.ts`

**Interfaces:** `Board` props add `store: Store`, `onCreate(preset)` and `draggable: boolean`. `draggable` is false when `model.query`, `!served.writable[model]` or `model.fields[column].readonly`.

- [ ] Tests:
  - a drop by keyboard (react-aria's drag button: Enter, arrow to the target, Enter) calls `store.apply({id, field: column, value})`;
  - a refused write puts the card back and shows the message;
  - an empty option column shows "Geen activiteiten";
  - the + on a column opens QuickCreate with the column's value preset;
  - a query board has no drag button.
- [ ] Implement one `GridList` per column, with `useDragAndDrop`:
  - `getItems` gives `{'application/x-row': id}`;
  - `onRootDrop` and `onInsert` on the target apply the value;
  - `renderDragPreview` gives the tilted card;
  - `DropIndicator` is the slot.
  - CSS: `[data-dragging]` at 35%, the column `[data-drop-target]` tint, and the slot from `board-prototype.html`.
- [ ] The card face from the mockup: kind dot, mono date/time or "zonder tijd", the inherited italic, a 22px avatar stack with tones, the dashed open place and "+N".
- [ ] e2e `board-drag` (since removed: step 3f's `board-sorted-cross-column` drives the mouse drag and its ⌘Z, `board-keyboard` the keyboard both ways, `board-drag-refused` the refused drop):
  - mouse drag Optie → Bevestigd: the card moves, ⌘Z returns it, and the toast shows;
  - keyboard drag;
  - a refused drop on Bord toewijzingen (a lifecycle refusal on `state`; the board falls back to the lifecycle column when the table declares no `board.column`) snaps back with the message.
  - `board-column-plus`: the column + creates a record with that column's value (since removed: `Board.test.tsx` `creates in a column with that column's value from its head's +`, and `board-column-plus-in-window`, which sees the option sent).
- [ ] Commit.

### Task 4: Hints per skin and period keys (B4, Q19)

**Files:** `ui/hints.ts` (new), `ui/App.tsx`, `calendar/Calendar.tsx`, `timeline/Timeline.tsx`, `i18n.ts`

- [ ] Write `hintsOf(skin): string[]` in `ui/hints.ts`, with the strings verbatim from the spec's B4.
- [ ] Add ← → and T on the calendar and timeline. They work when focus is in the skin's body and not in an input, and they call the Task 1 `stepPeriod`/`todayPeriod`.
- [ ] Tests:
  - each skin's footer text;
  - → on the calendar steps a week;
  - T returns to today's week;
  - the arrows on the grid still move the cell cursor.
- [ ] Commit.

### Task 5: The drawer (C1–C5, Q5, Q7, Q14–Q16)

**Files:**
- Create: `grid/drawer/Head.tsx`, `drawer/Props.tsx`, `drawer/Sections.tsx`, `drawer/derive.ts`, `drawer/derive.test.ts`
- Create: `grid/drawer/context.ts` (`SchemaContext`: the served schema)
- Modify: `grid/Drawer.tsx`, `ui/SidePanel.tsx` (head slot, expand), `ui/App.tsx` (provides the context), the five mounts `grid/useOpenRow.tsx` (and its callers `board/Board.tsx`, `gallery/Gallery.tsx`, `timeline/Timeline.tsx`, which hand it the rows and layout), `calendar/Calendar.tsx`, `grid/Grid.tsx`, `dashboard/Dashboard.tsx`, `matrix/Matrix.tsx` (pass `model`, and `view`, `layout`, `nav` where they own a view's rows; the Grid's related drawer, the Dashboard and the Matrix cell pass no `nav`), `i18n.ts`, `app.css`

**Interfaces (`derive.ts`, pure):**
```ts
kindOf(model): string | null                 // the first select field with tones
subOf(model, schema, row): { field: string; title: string; tone?: string; icon: string }[]  // the space relation, then at most one more relation shown in the view
propsOf(model, row, view?, layout?): { field; label; icon; value: ReactNode; inherited?: string; empty: boolean }[]  // the start/end pair merged to "Tijd"; hidden columns dropped
inboundOf(schema, model): { model: string; field: string; label: string }[]  // dated datasets with a relation to model
dayLabel(iso): string                         // "wo 14 okt 2026"
actorOf(email): string                        // the local part
```
- [ ] Write `derive.test.ts`:
  - activiteit → kind 'soort';
  - pairing → one "Tijd 20:00–21:15";
  - a hidden column (`legacy_post_id`) is dropped; with no view and layout, none is;
  - speelreeks inbound → activiteit;
  - persoon gets no undated inbound;
  - a record with no kind → head is the dataset name alone.
- [ ] Build the head: kind dot + label · dataset name, "N van M" ("–" and ↑ ↓ disabled when the row has left the view), ↑ ↓ with keys ↑/↓ and `k`/`j` while focus is in the head, expand (`data-wide` on the slot; Esc or the button returns it) and close.
- [ ] Build the title, the subline, `dl.props` (112px | 1fr), and "+ n lege velden", which unfolds.
- [ ] Build the sections:
  - the links (Bezetting: person · role · status, "+ Toewijzen" through the existing link add);
  - inbound (at most 5, "alle n" opens that view with a condition on the key);
  - Geschiedenis (`GET /history/:source?filter={"id":N}`, actors by `actorOf`; hidden on a query model, which the engine refuses);
  - the existing RecordLink and declared Actions stay, as a section after the inbound sections;
  - Bijlagen and Verwijderen restyled as sections.
- [ ] The afwezig alert banner (C5) needs the matrix's away rows, so it is built in Task 6's cell drawer. The conflict banner waits for Task 12.
- [ ] Drawer tests: the head, position, ↑ stepping, `j` in the head steps down and `k` at row 1 does nothing, "–" and disabled ↑ ↓ when the row has left the view, no position without `nav`, the empty-fields fold, the sections' order, the history list, and no Geschiedenis on a query model.
- [ ] e2e `drawer-anatomy`: open Planning's first activity and check the head, Tijd, the inherited "via", Bezetting and Geschiedenis; ↓ moves to the second row.
- [ ] Commit.

### Task 6: Matrix (C6, D6, Q4, Q8, Q9)

**Files:** `matrix/Panel.tsx` (rebuilt on the Task 5 parts), `matrix/Matrix.tsx`, `matrix/Legend.tsx`, `packages/theatre/src/seed.ts` (rol_id), `packages/theatre/src/queries/` (a substitute query `vervangers` or a column; `kandidaten.sql` untouched) plus its test, `app.css`

- [ ] Theatre:
  - seed `rol_id` on toewijzingen that have a person;
  - add a query `vervangers`, declared in `queries.ts`, listing people who could take an assigned slot (same role, not away, not booked that day), with a test.
  - `bun test packages`: the existing kandidaten tests pass unchanged.
- [ ] Rebuild the cell drawer:
  - head;
  - Persoon, Rol, Status (a badge that opens the status picker), Activiteit, Notitie;
  - "Ook op {dag}" from the loaded rows;
  - "Wie kan in de plaats" with Kiezen (open cells use the existing kandidaten picker; assigned cells use the new query);
  - Geschiedenis;
  - the afwezig banner from `absentOn` with its two actions (Panel.test case).
- [ ] Add the role line under each person head. The right column becomes "Bezet" with have/need (Q10). The Totaal row stays, styled quietly. Add the Afwezigheden chip as the skin chip from Task 2, on by default; it hides the away layer.
- [ ] Tests in Matrix.test and Panel.test. e2e `matrix-cell-drawer`.
- [ ] Commit.

### Task 7: Gallery (D5)

- [ ] Sections by Groep with a sticky head and count (test: Groep "Plandag" draws day sections with counts; e2e `gallery-sections`). S M L at 172/236/330px (`Layout.size`). The placeholder as drawn. Tests in `Gallery.test.tsx`. Commit.

### Task 8: Calendar packing, timeline hover card, rail counts, Bezetting column, insight (D1–D4, Q12)

- [ ] `calendar/layout.ts` `blocksOf`:
  - columns are assigned in start order, with lane as the tiebreak;
  - width is shared only within a cluster's overlapping set;
  - 2px gutter.
  Test: Monday 12 Oct's five events give ≤ 3 columns, each ≥ 30% wide.
- [ ] Timeline hover card styled as in the mockup. Lanes and bars take the lane palette by order (Q6 fallback, replaced in Task 13 on a yes).
- [ ] Rail counts: one `rows(limit 1).total` per dataset table, in `Rail`. Queries show none.
- [ ] Map the served `lifecycle.column` onto `Model` (`engine.ts`, `types.ts`), with a test that it gets through; the insight reads it.
- [ ] Grid Bezetting column: a bar plus have/need from `links` (Q10), rendered for a `links` field in `cells/Links.tsx`.
- [ ] Insight per Q12: the warn-toned option of the lifecycle column (else the first select with a warn tone) as its badge plus the count of the view's rows holding it, in the title line. The timeline adds "N overlap" from its packing.
- [ ] Tests per unit. Commit.

### Task 9: Dashboard (D7, Q13)

- [ ] Title pill "{space} · week N". "bijgewerkt hh:mm" from the last read. The change line where a stat's view is dated.
- [ ] Theatre `werklijst.sql` context column, declared in `queries.ts`, plus its test. The change line compares with the same view's previous period: a second `rows(limit 1)` with the period stepped back by one.
- [ ] Werklijst rows with context, avatar and Gedaan.
- [ ] The week tile as a cross-day band.
- [ ] Tests. Commit.

### Task 10: The walk and the pairs (D9)

- [ ] Walk every rail view, light and dark, against the scratch engine 4371 / Vite 5197 with a Playwright scratch script. List each defect in the spec under D9, then fix it (RED→GREEN where it is behaviour).
- [ ] Retake `specs/step-3e/compare/<skin>-{proto,app}{,-dark}.png` with the drawer open on the mockup's record. Commit.

### Tasks 11–14: Held for Stefan (Q1, Q2, Q6, Q11)

Built only on his yes, each starting with its `docs/SPEC.md` commit. On a no, the fallback in the spec's ruling table stands and the task is dropped.

- 11: Q1 `long: true` → textarea → the NOTITIES block.
- 12: Q2 `flags` on a query → the conflict banner ("Openen", "Toon conflicten"), marks on cards, bars, events and the week tile, and the "N conflicten" insight.
- 13: Q6 `kleur` on productie plus the tone pointer → production tones on the timeline, the drawer subline and cards.
- 14: Q11 `sum` group fact → the grid group-head totals.

### Close

Gate run alone → `/feature-review step-3e` → one fix pass → `/shakeout` → one final gate run alone. Report to worktable-ac.
