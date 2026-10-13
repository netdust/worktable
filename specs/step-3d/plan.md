# Step 3d part 2: the app styled as the mockups — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native, as chosen) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Opened on the same view in the same state at 1600×900, light and dark, the app reads as the seven prototypes in `design/` in detail.

**Architecture:** Styling and layout in `apps/grid` only.
- The shell comes first: theme tokens, rail, Bijstellen in the rail foot, toolbar, chip row, footer hints, and the drawer as a column of `.nv-work`. The other six skins stand on it.
- Each skin then gets its own task, which ends in a compare pair.
- The theatre package gains one seeded view ("Per status", a board on Activiteiten) so the board prototype's state exists.
- No engine change and no new behaviour. What a prototype shows beyond the API or the app's behaviours is listed out in the spec's ledger.

**First working version:** Task 1, the shell. Every view at once shows the prototype's rail, toolbar, chip row, foot and drawer column, which is what Stefan sees first.

**Simplest design:** Restyle what exists, in place: theme tokens and `app.css`, plus markup only where the prototype's structure differs from the app's. Three structural changes remain, each the smallest form of what the prototype shows:
- The drawer moves to full height through a portal, not a state lift. `SidePanel` renders into an app-level slot that is the third column of `.nv-app`, and inline when no slot exists (tests, the auth pages). The seven skins keep owning their open row; only the DOM place moves.
- The skins' chip row is one small presentational `ChipRow` that renders the grid's markup from the nodes App already builds (scope chip, filter chips).
- The dashboard's week tile is restyled to read as the calendar's band (day heads, one-line bars with the start time). It keeps its own markup and its timed rows, which the calendar's all-day band does not hold.

"One Tijd column" is already built: `grid/columns.ts:271-305` with `cells/Date.tsx:12-19`, tested at `Grid.test.tsx:1701` and `columns.test.ts:183-215`. Task 2 only styles it.

A parallel component set or a CSS framework would be faster to write and wrong to keep. The plan does neither, and keeps every behaviour and its tests.

**Tech Stack:** React with React Aria Components, Vite, Vitest + Testing Library, Playwright for the compare screenshots (a scratch script, not a test).

**Spec:** `specs/step-3d/spec.md`. Design of record: `design/*-prototype.html` at `0bcb535`.

**Execution:** native. Rule: no security-boundary unit; it's styling.

## Global Constraints

- Nothing in `packages/engine`. Theatre changes only in `packages/theatre/src/seed.ts` and its seed tests, for view declarations.
- No new behaviour. A control appears only where it binds to an existing behaviour. Otherwise it is out and in the spec's ledger.
- Stefan's rules:
  - no coloured rounded borders (tone sits in a dot, badge text or a flat fill);
  - the grid's toolbar on every skin;
  - no cockpit density;
  - side panels only.
- Values come from the prototype's CSS, copied, never re-guessed.
- Most token names in `apps/grid/src/ui/theme.css` match the prototypes. `--color-bg-column` and `--today` are added.
- The soort hues stay the app's `--tone-*` as theatre declares them. `afbouw` is amber in the app and a brown `#a0612a` in the prototype; that goes to the ledger.
- User-facing strings are Dutch (`apps/grid/src/i18n.ts`).
- Commit by path, never `git add -A`. The untracked `*.url` files are never added.
- Before every gate: `bunx biome check --write .`. The gate is `bun run gate`, run alone: never beside a screenshot run or an edit.
- Never touch ports :4330/:5180/:4341/:5181 or `~/laika-export`. The compare runs use a scratch engine on 4371 and Vite on 5197.
- Every task ends with its pair (and dark pair) under `specs/step-3d/compare/`, judged side by side; differences are fixed before the next task.

## Review Focus

1. **A view the prototypes don't show** (Producties, Personen, Werklijst, a query view): the shell change must not break its toolbar, chips or drawer. Checked by the existing grid and App tests and the e2e suite (Task 1 row).
2. **The drawer in the slot:**
   - Escape and the capture handlers keep working through the portal.
   - The matrix's Enter/double-click hand-off to the panel used a DOM query under `.nv-body`, so it gets a slot-aware query (`matrix/Matrix.tsx:294`) and a test (Task 1 row).
   - Below 900px the slot overlays rather than becoming a bottom row.
3. **Dark theme parity:** every new rule uses tokens, so dark follows (each task's dark pair).
4. **Accessible names:** where the prototype renames a control ("Dichtheid" → "Rijhoogte"), or hides it in the collapsed Bijstellen card, the tests that name or click it change with it. They are listed in Task 1. Every other role and name stays (Task rows' e2e column).
5. **Keyboard focus:** chips, Bijstellen segments and the drawer controls keep a visible focus ring. jsdom loads no CSS, so the proof is the compare pairs, with a focused chip in Task 1's pair.

## Test map

| Unit | Seam | Tests: tier · file · command | E2E flows |
|---|---|---|---|
| Shell: Bijstellen in the rail foot | `RailFoot` render | unit · `apps/grid/src/ui/RailFoot.test.tsx` (new) · `cd apps/grid && bunx vitest run src/ui/RailFoot.test.tsx`. Asserts: collapsed by default; opening shows the radiogroups Rijhoogte, Dagkop, Rasterlijnen, Zebrarijen and Thema; choosing Rasterlijnen Aan sets `data-lines="on"` on `#root` and stores it | `grid-ux` (theme and density, edited to open Bijstellen first and to say Rijhoogte), `step-3` (Donker, the same) |
| Shell: the drawer in the app's slot | `App` render with an open row | unit · `apps/grid/src/ui/App.test.tsx` (one case). Asserts: the open drawer's `aside` is a child of `.nv-drawer-slot`, a sibling of `main.nv-main` | existing drawer flows |
| Grid: Tijd as one range (existing) | `Grid` render | regression guards only: `Grid.test.tsx:1701`, `columns.test.ts:183-215`, no new case | `dagplanning`, `step-0e` |
| Shell: the matrix hands the keyboard to its panel in the slot | `App` render of a matrix view | unit · `apps/grid/src/ui/App.test.tsx` (two cases, in "a matrix view"). Asserts: Enter on a cell opens the panel in `.nv-drawer-slot`, with focus inside it; with History open first, focus still lands in the cell panel | `step-3` matrix flows |
| Board: the card's lines | `Board` render | unit · `apps/grid/src/skins.test.tsx` (existing file, one case). Asserts: soort, title, date/time and locatie on the card | `step-3c` board flow |
| Rasterlijnen off by default, everything else visual | the compare pairs | none in Vitest (jsdom loads no CSS); each task's pair under `specs/step-3d/compare/` is the proof | existing flows |

## Tasks

### Task 1: The shell

**Files:**
- `apps/grid/src/ui/theme.css`, `ui/app.css`
- `ui/Rail.tsx`, `ui/ViewList.tsx`, `ui/RailFoot.tsx` (+ `RailFoot.test.tsx`), `ui/Theme.tsx`
- `ui/Toolbar.tsx`, `ui/SpaceSelect.tsx`, `ui/Pop.tsx`, `ui/Pick.tsx`
- `ui/SidePanel.tsx`, `ui/App.tsx` (the drawer slot and the foot)
- `grid/GridBar.tsx` (chip styles), `i18n.ts` (`density` → "Rijhoogte"; new `bijstellen`, `dayHead`, `gridLines`, `zebra`, `band`, `line`, `on`, `off`)
- `matrix/Matrix.tsx:294` (the hand-off finds the matrix's own panel in the slot: `.nv-drawer-slot .nv-panel` → its `.nv-drawer`)
- Test edits, every one following the collapsed Bijstellen card and the "Rijhoogte" name:
  - `ui/App.test.tsx:305`, `ui/Rail.test.tsx:233-247`;
  - `e2e/grid-ux.spec.ts:435-467`, `e2e/step-3.spec.ts:352`, `e2e/ui-fit.spec.ts:53,57`, `e2e/step-3c.spec.ts:121,126`, `e2e/scrollbars.spec.ts:36-46`, `e2e/react-aria.spec.ts:127`.
  - Where a spec reaches the looks more than once, a helper `openLooks(page)` in `e2e/editor.ts` opens the card first.

**Interfaces:**
- `SidePanel` keeps its props. It renders `createPortal(aside, slot)` when the `DrawerSlot` context holds an element, and inline otherwise.
- `App` provides `DrawerSlot` from the ref of `<div className="nv-drawer-slot" />`, rendered after `main.nv-main` in `.nv-app`. `.nv-app` becomes `grid-template-columns: 268px minmax(0, 1fr) auto`, so an empty slot takes no width.
- `RailFoot({ signed })` renders `<section className="nv-looks" aria-label="Bijstellen">` with a toggle button (`aria-expanded`).
- Its five settings are `Segmented` radiogroups, stored as follows:
  - `ntdst-views/density` (Rijhoogte, existing key);
  - the theme's existing key (Thema);
  - `ntdst-views/groups` (Dagkop: band|line → `data-groups`);
  - `ntdst-views/lines` (Rasterlijnen: off|on → `data-lines`);
  - `ntdst-views/zebra` (Zebrarijen: off|on → `data-zebra`).
- The card's open state is kept under `ntdst-views/looks-open`, closed by default.
- The account line follows, with Afmelden.

- [ ] Step 1: Write the RailFoot test, the App slot case and the two matrix hand-off cases; run them to see them fail.
- [ ] Step 2: Copy the prototype's tokens into `theme.css`, light and dark, with `--color-bg-column` and `--today` added.
- [ ] Step 3: Rail: the brand line "Worktable", the switcher card (the mark in the accent; no meta line, see ledger), section labels, a "Dashboards" label over the dashboards group, model and view rows, the guide line, the active state. No counts (ledger).
- [ ] Step 4: RailFoot as the Bijstellen card, per the interface; the Sneltoetsen block goes, as the footer hints carry the keys.
- [ ] Step 5: Toolbar in the prototype's order and sizes: glyph tile, h1, lock, summary pill, search, history before share, primary. There is no insight (ledger).
- [ ] Step 6: The chip row's styles (chip, set chip, count bubble, Groep chip, row count, Kolommen), and the popovers (`Pop`, `Pick`): 6px radius, shadow-pop, 4px padding, items 7px 10px.
- [ ] Step 7: The drawer slot and the drawer's look:
  - 392px wide, full height, a 1px left border, the head line with kind and close;
  - a 19px title, props as label/value rows, section headings 11px uppercase;
  - in the 900px query (`app.css:3535`) the slot overlays the work (fixed, right, full height) rather than taking a third row;
  - the 760px rule makes it full screen;
  - two open panels (history and a row) sit side by side in the slot, as before.
  - No position, up, down or expand (ledger).
- [ ] Step 8: The footer hints line (`nv-foot`), rendered by App under `.nv-work` for every skin: "↑↓←→ bewegen · ↵ bewerken · ⌘Z ongedaan maken". On a matrix view App adds the matrix legend at its end (Task 7). Esc and ⌘K leave the rail with the Sneltoetsen block, as spec row 31 approves.
- [ ] Step 9: Edit the named tests (open Bijstellen first; Rijhoogte). Run the new tests (green), then the grid's Vitest suite.
- [ ] Step 10: Screenshot the grid view; compare the shell parts (rail, toolbar, chip row, foot, drawer) light and dark; fix; commit.

### Task 2: The grid

**Files:** `grid/GridHeader.tsx`, `grid/GridBody.tsx`, `grid/cells/index.tsx` (the inherited value and its "via tourstop" chip), `grid/columns.ts` (widths), `app.css`.

**Interfaces:** none new. The Tijd range is existing code (`columns.ts:271-305`, `cells/Date.tsx:12-19`).

- [ ] Step 1: Run the regression guards (`Grid.test.tsx`, `columns.test.ts`); they stay green throughout.
- [ ] Step 2: Header cells, the 16px body, the row-number column, the selection and focus states, borders off by default with `[data-lines="on"]`, `[data-zebra="on"]`.
- [ ] Step 3: Style the existing range: `.nv-time` in mono 12.5px, `.nv-time__end` in subtle, `.nv-blank` as the prototype's dashed pill.
- [ ] Step 4: Column widths favouring the description; the inherited value italic with "via tourstop" (`cells/index.tsx`).
- [ ] Step 5: Soort square and label; the status pill with its dot.
- [ ] Step 6: The day band (band and line variants) with the facts. The bezetting part is out.
- [ ] Step 7: Tests green; pair `grid-app(-dark).png`; judge; fix; commit.

### Task 3: The board

**Files:** `packages/theatre/src/seed.ts` (the "Per status" view), `packages/theatre/test/seed-missing.test.ts` (counts 22→23 added and 30→31 present at :149/:170; "Per status" in `ADDED`/`STEP_3C` at :22-36), `board/Board.tsx`, `app.css`, `skins.test.tsx`.

- [ ] Step 1: Seed "Per status" (board, activiteit, plandag this week, visible fields soort, plandag, start_at, eind_at, locatie, mensen).
- [ ] Step 2: The chip row through `ChipRow({ scope, filters, group, children, count, cut })` (new, `ui/ChipRow.tsx`, the names GridBar uses): the grid's chip-row markup, a static "Groep: …" chip when `group` is given, and the row count. App newly passes `scopeChip` to Board, Gallery, Timeline, Calendar and Matrix, and `filters` to Board and Gallery (Calendar, Timeline and Matrix get it already). Board, Gallery and Timeline render `ChipRow`. Calendar (Task 5) and Matrix (Task 7) keep their bars, restyled to the same classes, with the scope chip added.
- [ ] Step 3: Columns and headers (no plus: the board takes no new row); cards with their lines (the `.slice(0, 3)` cap in `Board.tsx:14` widens to the view's fields); the selected card; the empty column; a click opens the drawer.
- [ ] Step 4: The skins.test case for the card's lines; the pair; judge; fix; commit.

### Task 4: The timeline

**Files:** `timeline/Timeline.tsx`, `timeline/layout.ts` (display only), `app.css`.

- [ ] Step 1: Chip row through `ChipRow`: a static "Groep: productie" chip, then Vandaag (new in the timeline; it calls the existing `onShown` with this week's window), ‹ and ›. No Week/Maand switch: nothing in the app switches the timeline's window (ledger).
- [ ] Step 2: Axis (weeks and days rows), lane heads, tracks with day lines and weekends, the today line.
- [ ] Step 3: Bars: flat fill, two lines, optie hatched, geannuleerd struck; the one-line tip.
- [ ] Step 4: Pair in a week with tourstops (the seed's dates); judge; fix; commit.

### Task 5: The calendar

**Files:** `calendar/Calendar.tsx`, `app.css`.

- [ ] Step 1: Chip row (Vandaag, ‹, ›, Maand/Week, and the lane switch as a Groep chip).
- [ ] Step 2: The week:
  - the day head;
  - the Hele dag band on top;
  - the hour grid at 46px (`HOUR_PX` 48→46; `Calendar.test.tsx` reads the constant) with half-hour lines, its range as `weekGrid` computes it;
  - events as flat tints;
  - the now line;
  - the date-only frame.
  The Maand/Week radios stay radios, styled as chips.
- [ ] Step 3: Month: week numbers, packed bars, lines with "+n meer".
- [ ] Step 4: Pairs (week and month); judge; fix; commit.

### Task 6: The gallery

**Files:** `gallery/Gallery.tsx`, `app.css`.

- [ ] Step 1: Chip row through `ChipRow` (no Groep chip and no S/M/L: the gallery neither groups nor sizes, see ledger).
- [ ] Step 2: Card: picture 4:3, title, date/time, soort; hover; the no-picture placeholder with initials.
- [ ] Step 3: Pair; judge; fix; commit.

### Task 7: The matrix

**Files:** `matrix/Matrix.tsx`, `matrix/Panel.tsx` (styles), `app.css`.

- [ ] Step 1: Chip row; head with avatar initials and name; Open and Bezet columns; sticky.
- [ ] Step 2: Day band; row head; cell marks on flat tints; away hatched with the reason; away and assigned red; the note dot; the selected cell and the crossed heads.
- [ ] Step 3: The legend at the end of App's foot on a matrix view; pair; judge; fix; commit.

### Task 8: The dashboard

**Files:** `dashboard/*.tsx`, `app.css`.

- [ ] Step 1: Title row and chip row (quick actions as chips, Bewerken as a plain button). There is no "bijgewerkt" time (ledger).
- [ ] Step 2: Stat tiles, the progress tile, section labels.
- [ ] Step 3: The week tile restyled to read as the calendar's band (day heads with the today pill, one-line tinted bars with the start time), keeping its markup and its timed rows. `more-tiles.test.tsx:61-63` and `e2e/step-3c.spec.ts:168-170` stay green. Vandaag beside it.
- [ ] Step 4: The Werklijst list; the composer's treatment.
- [ ] Step 5: Pair; judge; fix; commit.

### Close

- [ ] Gate green, run alone.
- [ ] Review (superpowers' reviewer; no security-sentinel, as no route is touched).
- [ ] One fix pass.
- [ ] All seven pairs retaken on the final commit.
- [ ] `/shakeout`: one screenshot per surface under `specs/step-3d/shakeout/`, flows registered.
- [ ] Report to worktable-ac with the pairs' paths.
