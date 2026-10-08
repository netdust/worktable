# React Aria Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Sakani with React Aria Components for every editor and every piece of chrome in `apps/grid`, keeping the sheet and the grid's look.

**Architecture:** React Aria parts, unstyled, wrapped where the grid uses them and styled in `app.css` with the grid's own tokens. One `I18nProvider` and one portal container at the app root carry the locale and the theme into every popover. The sheet (`Grid.tsx`, `keys.ts`, `GridBody.tsx`) keeps its key machine; editors talk to it only through `EditorProps` (`cells/props.ts`). Sakani stays installed until the last task removes it.

**Tech Stack:** React 19, `react-aria-components` 1.22, `@internationalized/date`, Vitest + Testing Library, Playwright.

**Spec:** `specs/react-aria/spec.md` (and `specs/field-contract.md`, the editors' behaviour).

**First working version:** Task 1 — the date, datetime and time editors on React Aria, in Dutch, in the running grid. It is the screenshot that started this feature.

**Simplest design:** Swap each Sakani import for its React Aria part with the same props, file by file, no wrappers. The plan does not use it for the editors and the popovers: every React Aria popover portals to `document.body`, outside `#root` where the dark tokens live and outside `[data-editor]` where the sheet looks for an open edit (`Grid.tsx:67`). One shared `Pop` wrapper that portals into the app root and marks itself `data-editor` solves both once. Everything else is the simple swap.

## Global Constraints

- One UI library: `react-aria-components` and `@internationalized/date`; at the end `grep -r sakaniui apps/grid` finds nothing and `bun.lock` holds no `@sakaniui` entry. (R1)
- No screen changes look except the editors of R4; light and dark; compact, normal and ruim. (R2)
- Locale from `locale()` (`apps/grid/src/i18n.ts:259`, the page's `<html lang="nl">`): `dd-mm-jjjj`, 24-hour, Monday first. (R3)
- Stored values stay as the engine keeps them: dates `YYYY-MM-DD`, datetimes `YYYY-MM-DDTHH:mm`, times `HH:MM`; no zone. (R4, R7)
- The sheet's key machine (`keys.ts`), `GridBody.tsx` and what a write sends are unchanged. (R6, R7)
- Toast stays the grid's own; Spinner becomes the grid's own CSS spinner; EmptyState plain markup. (R5)
- Names in UI copy are Dutch through `t()`; no client data in tests (the export-term check runs on every commit: `bun scripts/check-export-terms.ts`). (AGENTS.md)
- Comments only for a why; match the surrounding density. (CLAUDE.md §6)

## Review Focus

1. A click inside a portalled popover (calendar day, listbox option, combobox option) does not end the edit or select another cell — Task 1, `Pop` test "a click in the popover keeps the edit".
2. In dark mode every popover, menu and dialog is dark — Task 1, `Pop` renders inside the app root (`portalRoot()` test); Task 11 screenshots light and dark.
3. Enter, Tab and Escape inside an editor commit or cancel exactly once (no double write, no write on Escape) — each editor task's "commits once on Enter" and "Escape writes nothing" tests.
4. An incomplete date or time (a segment left empty) never writes and never writes the stored value twice — Task 1 "an incomplete date drafts nothing new".
5. A required column offers no empty choice and never clears — Tasks 1, 2, 3 "required offers no leeg".

## Test map

| Unit | Seam | Tests: tier · file · command | E2E flows |
|---|---|---|---|
| Date, datetime, time editors + `dates.ts` + `Pop` + root providers | `Editor` render (`cells/index.tsx`) | unit · `cells/Date.test.tsx`, `cells/dates.test.ts`, `ui/Pop.test.tsx` · `cd apps/grid && bunx vitest run src/grid/cells src/ui/Pop.test.tsx` | edit-date-cell, edit-datetime-cell, edit-time-cell |
| Select editor | `Editor` render | unit · `cells/Select.test.tsx` · same runner | edit-select-cell |
| To-one picker (`RelationPicker` on `ComboBox`) | `Editor` render | unit · `cells/Relation.test.tsx` · same runner | edit-relation-cell |
| To-many editor (`TagGroup` + `ComboBox`) | `Editor` render | unit · `cells/Links.test.tsx` · same runner | add-and-remove-link |
| Open-panel icon on a to-one cell | `Display` render + `Grid` | unit · `cells/Relation.test.tsx`, `Grid.test.tsx` · same runner | open-related-record |
| Long text, bool, matrix note | `Editor` / `Display` render, `matrix/Panel` | unit · `cells/Text.test.tsx` (new), existing `matrix/Panel.test.tsx` · same runner | edit-long-text, toggle-bool |
| Buttons, MoreMenu, Confirm, SidePanel, Drawer | component render | unit · existing `*.test.tsx` of each · `cd apps/grid && bunx vitest run` | none — proven by flow (every flow clicks them) |
| Column picker, Search, RailFoot/Theme, Toast, Spinner, EmptyState | component render | unit · existing `Toolbar`, `Search`, `Toast`, `App` tests · same | toggle-theme-density |
| Dialogs: NewViewDialog, Share, sign-in overlay | component render | unit · existing `NewViewDialog`, `Share`, `SignIn` tests · same | new-view, publish-from-share-menu |
| Pickers: SpaceSelect, Pick, FilterBuilder (with the `DateField` range) | component render | unit · existing `FilterBuilder`, `App` tests · same | filter-builder, period-between |
| ViewList on `GridList` with drag order | component render | unit · existing `ViewList.test.tsx` · same | reorder-views |
| Sakani removal | the build | `bun run gate` | the whole e2e suite |

Gate for every task: `bun run check && cd apps/grid && bunx vitest run` (the full `bun run gate` with e2e at Tasks 6, 10 and 12).

---

### Task 1: Date, datetime and time editors on React Aria

**Files:**
- Modify: `apps/grid/package.json` (add `react-aria-components@^1.22.0`, `@internationalized/date`)
- Modify: `apps/grid/src/main.tsx` (wrap the app in `I18nProvider locale={locale()}`)
- Create: `apps/grid/src/ui/Pop.tsx` — `Pop` and `portalRoot()`
- Create: `apps/grid/src/grid/cells/dates.ts`
- Rewrite: `apps/grid/src/grid/cells/Date.tsx` (`DateEditor`, `DateTimeEditor`), `cells/Time.tsx` (`TimeEditor`)
- Modify: `apps/grid/src/ui/app.css` (`.nv-datefield`, `.nv-calendar`, `.nv-pop` for React Aria)
- Test: `cells/dates.test.ts` (new), `cells/Date.test.tsx` (rewrite), `ui/Pop.test.tsx` (new)

**Interfaces:**
- Produces: `Pop(props: PopoverProps & { editor?: boolean })` — a React Aria `Popover` with `UNSTABLE_portalContainer={portalRoot()}`, class `nv-pop`, and `data-editor` when `editor`. `portalRoot(): HTMLElement` — the app's root element (`#root`). Every later task's popover, menu and modal uses these.
- Produces in `dates.ts`: `toDate(v: string): CalendarDate | null`, `fromDate(d: CalendarDate | null): string`, `toMoment(v: string): CalendarDateTime | null`, `fromMoment(d: CalendarDateTime | null): string`, `toTime(v: string): Time | null`, `fromTime(t: Time | null): string`. Empty string ⇄ null; malformed input → null.
- Consumes: `EditorProps` (`cells/props.ts`), unchanged.

- [ ] **Step 1: Write the tests**

`dates.test.ts`: `toDate('2026-10-13')` → `CalendarDate(2026,10,13)` and back; `toMoment('2026-10-13T20:30')` round-trips; `toTime('09:05')` round-trips to `'09:05'`; `toDate('')`, `toDate('13/10/2026')` → `null`; `fromMoment(null)` → `''`.

`Date.test.tsx` (rewrite against roles; React Aria segments are `role="spinbutton"`):
- "shows the stored date in Dutch order": `DateEditor` on `'2026-10-13'` → the segments read day `13`, month `10`, year `2026`, in that order.
- "drafts the typed date as YYYY-MM-DD": type into the segments → `onDraft` last called with `'2026-11-02'`.
- "datetime shows 24-hour time": `DateTimeEditor` on `'2026-10-13T20:30'` → an hour segment `20`, no AM/PM segment.
- "an incomplete date drafts nothing new": clear the day segment → `onDraft` not called with a malformed or stored value after the clear.
- "required offers no clearing": required column, Backspace on every segment → `onDraft` never called with `''`.
- "the calendar starts on Monday": open the calendar button → first column header is `ma`.
- "Escape writes nothing": Escape in a segment → `onCommit` not called; `onCancel` called once.

`Pop.test.tsx`:
- "portals into the app root": render inside a `<div id="root">`, open → the popover's element is inside `#root`.
- "a click in the popover keeps the edit": the popover carries `data-editor` when `editor`, so `fromCell` (`Grid.tsx:67`) accepts it.

- [ ] **Step 2: Run** `cd apps/grid && bunx vitest run src/grid/cells/dates.test.ts src/grid/cells/Date.test.tsx src/ui/Pop.test.tsx` — expect failures (modules missing).

- [ ] **Step 3: Implement**

`DateEditor`: React Aria `DatePicker` (`DateInput` + `DateSegment`s, a calendar `Button`, `Pop` with `Calendar`), `value={toDate(editing.draft)}`, `onChange={(d) => onDraft(fromDate(d))}`, `isRequired={column.required}`, autofocus on the first segment, `aria-label={column.label}`. `DateTimeEditor`: the same with `granularity="minute"`, `hourCycle={24}`, `toMoment`/`fromMoment`. `TimeEditor`: `TimeField`, `hourCycle={24}`, `toTime`/`fromTime`. Blur leaving the editor (focus not inside the field or its `Pop`) calls `onLeave`. A typed character that opened the editor (`editing.mode === 'enter'`): if it is a digit, it is entered into the first segment; verify React Aria takes it, else open on the stored value with the first segment focused and record a `Ruling:`.

- [ ] **Step 4: Run** the same command — all pass; then the task gate.

- [ ] **Step 5: Look at it.** Run the grid (`bun packages/engine/src/serve.ts …` + `bunx vite`), open Dagplanning, edit a start time and a date, light and dark; the calendar is Dutch, Monday first, dark in dark mode.

- [ ] **Step 6: Commit** `feat(grid): date, datetime and time editors on React Aria, in Dutch`

### Task 2: Select editor

**Files:** Modify `cells/Select.tsx`, `ui/app.css`; Test `cells/Select.test.tsx`.

**Interfaces:** Consumes `Pop` (Task 1). Produces `OptionMark({ column, option }: { column: Column; option: string })` — the pill, dot or icon-and-word the cell draws; `SelectCell` renders through it.

- [ ] **Step 1: Tests** (existing file, rewritten against roles): "each option is drawn as the cell draws it" (a `status` column's options carry `nv-pill nv-pill--<tone>`, `soort` options `nv-dot` or the kind icon); "the current option is marked" (`aria-selected` on it); "a letter jumps to the first option starting with it"; "commits once on Enter", "Tab commits and moves right"; "Escape writes nothing"; "required offers no leeg".
- [ ] **Step 2: Run** `bunx vitest run src/grid/cells/Select.test.tsx` — fail.
- [ ] **Step 3: Implement** `SelectEditor` as a React Aria `ListBox` (`selectionMode="single"`, `autoFocus`, typeahead built in) inside `Pop editor`, anchored to the cell (`triggerRef` the cell, `isOpen`); Enter/Tab call `onCommit(key, move)` as today. Options render `OptionMark`.
- [ ] **Step 4: Run** — pass; task gate.
- [ ] **Step 5: Commit** `feat(grid): the select editor on a React Aria ListBox, options drawn as the cell draws them`

### Task 3: To-one picker on ComboBox

**Files:** Rewrite `cells/RelationPicker.tsx`; modify `cells/Relation.tsx`, `ui/app.css`; Test `cells/Relation.test.tsx`.

**Interfaces:** Keeps `RelationPicker`'s props (`model, label, query, first, onPick, onCancel, onClose, onClear, before, hide, clearOnPick`) and `PICKER_CAP = 50` — Task 4 uses the same props. Consumes `records(model, search)` (`api.ts:135`), `Pop`.

- [ ] **Step 1: Tests:** "lists the space's records first"; "shows at most 50 and says how many more"; "the opening character starts the search"; "Enter picks the active record" (`onPick(row, 'key')` once); "Delete in an empty search clears, unless required"; "Escape cancels"; "the input has the column's accessible name".
- [ ] **Step 2: Run** `bunx vitest run src/grid/cells/Relation.test.tsx` — fail.
- [ ] **Step 3: Implement** on React Aria `ComboBox` (`allowsEmptyCollection`, `menuTrigger="input"`, controlled `inputValue`, `items` from the debounced `records` call, 150 ms as today), its `ListBox` in `Pop editor`; `before` renders before the `Input` inside the field group.
- [ ] **Step 4: Run** — pass; task gate.
- [ ] **Step 5: Commit** `feat(grid): the relation picker on a React Aria ComboBox`

### Task 4: To-many editor on TagGroup

**Files:** Modify `cells/Links.tsx`, `ui/app.css`; Test `cells/Links.test.tsx`.

**Interfaces:** Consumes `RelationPicker` (Task 3), `LinksContext` unchanged.

- [ ] **Step 1: Tests:** "chips flow inline and the box caps at two lines" (the box has class `nv-chosen` with `max-height` set; asserted in CSS by the e2e screenshot, here: chips render in one `TagGroup` `role="grid"`); "Backspace in an empty search removes the last chip"; "removing a confirmed link asks first" (an `alertdialog` with Annuleren and Verwijderen; Escape keeps it); "Enter adds and empties the search"; "a chip's remove button names the person".
- [ ] **Step 2: Run** — fail.
- [ ] **Step 3: Implement** `Chosen` as a React Aria `TagGroup`/`TagList`/`Tag` with `onRemove`, passed as `before` to `RelationPicker`; `Question` as `Dialog role="alertdialog"` inside `Pop editor`.
- [ ] **Step 4: Run** — pass; task gate.
- [ ] **Step 5: Commit** `feat(grid): the to-many editor on a React Aria TagGroup`

### Task 5: Open-panel icon on a to-one cell

**Files:** Modify `cells/Relation.tsx` (`RelationCell`), `grid/Grid.tsx` (drawer opens a related record), `grid/Drawer.tsx` only if it needs a `title` prop; Test `cells/Relation.test.tsx`, `grid/Grid.test.tsx`.

**Interfaces:** Consumes `rowOf(model, id)` (`api.ts:162`), `columnsFor(model, view, false, models)` (`columns.ts:260`). Produces a context or prop `openRelated(model: string, id: number)` from `Grid` to `RelationCell`.

- [ ] **Step 1: Tests:** "a filled to-one cell shows an open button named after the record" (React Aria `Button`, `aria-label` "Open <title>"); "an empty cell shows none"; in `Grid.test.tsx`: "the open button shows the related record in the drawer, read-only".
- [ ] **Step 2: Run** — fail.
- [ ] **Step 3: Implement**: the button appears on hover and focus of the cell (CSS), press calls `openRelated`; `Grid` fetches `rowOf` and opens the `Drawer` with that model's columns, `writable = false`.
- [ ] **Step 4: Run** — pass; task gate.
- [ ] **Step 5: Commit** `feat(grid): a to-one cell opens its record`

### Task 6: Long text, bool and the matrix note

**Files:** Modify `cells/Text.tsx` (`LongTextEditor`), `cells/Bool.tsx`, `matrix/Panel.tsx`, `ui/app.css`; Test `cells/Text.test.tsx` (new), `matrix/Panel.test.tsx`.

- [ ] **Step 1: Tests:** long text: "Enter is a new line, Ctrl+Enter commits once", "Escape writes nothing"; bool: "Space flips it", "a read-only switch does not flip"; matrix note: existing `Panel.test.tsx` passes against `TextArea`.
- [ ] **Step 2: Run** — fail.
- [ ] **Step 3: Implement** `LongTextEditor` as `TextField` + `TextArea` inside `Pop editor`; `BoolCell` as React Aria `Switch` (`isReadOnly={!column.editable}`, `excludeFromTabOrder`); the matrix note as `TextField` + `TextArea`.
- [ ] **Step 4: Run** — pass; full `bun run gate` (the editors are done: e2e must pass with the date flows updated — `e2e/dagplanning.spec.ts:166-167` and any flow that types a date into a cell type into the segments).
- [ ] **Step 5: Commit** `feat(grid): long text, switch and the matrix note on React Aria`

### Task 7: Buttons, MoreMenu, Confirm, SidePanel, Drawer

**Files:** Modify `grid/Drawer.tsx`, `grid/Grid.tsx`, `cells/Links.tsx`, `ui/Confirm.tsx`, `ui/NewViewDialog.tsx`, `ui/Share.tsx`, `ui/SidePanel.tsx`, `ui/SignIn.tsx`, `ui/Toolbar.tsx`, `ui/ViewPanel.tsx`, `ui/MoreMenu.tsx`, `ui/app.css`.

**Interfaces:** Produces `.nv-button` with modifiers `--primary`, `--secondary`, `--ghost`, `--destructive` and `--sm`, matching Sakani's four variants and two sizes as they look today. MoreMenu: `MenuTrigger` + `Menu` in a `Popover` with `UNSTABLE_portalContainer={portalRoot()}`.

- [ ] **Step 1: Run** the existing tests of these files — green before the change.
- [ ] **Step 2: Implement** the swap; `onClick` becomes `onPress`; MoreMenu drops its own portal.
- [ ] **Step 3: Run** the grid suite — pass; task gate. Compare the toolbar, drawer and menu against the shake-out screenshots in `specs/grid-toolbar/shakeout/`.
- [ ] **Step 4: Commit** `refactor(grid): buttons and menus on React Aria`

### Task 8: Column picker, Search, theme and density, Toast, Spinner, EmptyState

**Files:** Modify `grid/GridBar.tsx`, `ui/Search.tsx`, `ui/RailFoot.tsx`, `ui/Theme.tsx`, `ui/Toast.tsx`, `ui/App.tsx`, `grid/Grid.tsx`, `matrix/Matrix.tsx`, `ui/HistoryPanel.tsx`, `cells/RelationPicker.tsx` (spinner); Create `ui/Spinner.tsx`; modify `ui/app.css` (drop `#root .nv-search [class*="_input--sm"]` and every other `[class*="_…"]` rule).

**Interfaces:** Produces `Spinner()` — a `span` with `role="progressbar"`, `aria-label={t('loading')}`, class `nv-spinner` (CSS animation).

- [ ] **Step 1: Run** the existing tests of these files — green.
- [ ] **Step 2: Implement:** GridBar's picker as `DialogTrigger` + `Popover` + `CheckboxGroup`; Search as `SearchField` + `Keyboard`; RailFoot and Theme as `ToggleButtonGroup` (`selectionMode="single"`, `disallowEmptySelection`); Toast's `Kbd` as `Keyboard`; `EmptyState` as plain markup with the same text.
- [ ] **Step 3: Run** — pass; task gate.
- [ ] **Step 4: Commit** `refactor(grid): column picker, search, theme and density on React Aria`

### Task 9: Dialogs

**Files:** Modify `ui/NewViewDialog.tsx`, `ui/Share.tsx`, `ui/App.tsx` (sign-in overlay), `ui/app.css`.

- [ ] **Step 1: Tests** (existing, kept): plus "Escape closes the new-view dialog and focus returns to its trigger".
- [ ] **Step 2: Implement** each as `ModalOverlay` + `Modal` + `Dialog` with `UNSTABLE_portalContainer={portalRoot()}`; the sign-in overlay is not dismissable.
- [ ] **Step 3: Run** — pass; task gate.
- [ ] **Step 4: Commit** `refactor(grid): dialogs on React Aria`

### Task 10: SpaceSelect, Pick and the filter builder

**Files:** Modify `ui/SpaceSelect.tsx`, `ui/Pick.tsx`, `ui/FilterBuilder.tsx` (lines 106-107: the "ligt tussen" range), `ui/app.css`; Test `ui/FilterBuilder.test.tsx`, `ui/App.test.tsx`.

**Interfaces:** `Pick` keeps its props (`label, value, searchable, className, …`) so `FilterBuilder` call sites stay; it becomes `Select` (plain) or `ComboBox` (`searchable`) in a `Pop`. The range uses React Aria `DateRangePicker` with `toDate`/`fromDate` (Task 1).

- [ ] **Step 1: Tests** (existing, kept) plus: "ligt tussen shows Dutch dates and drafts YYYY-MM-DD for both ends"; "a reversed range is not drafted".
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** — pass; full `bun run gate` (e2e `dagplanning.spec.ts:166-167` types the range into segments).
- [ ] **Step 4: Commit** `refactor(grid): the space switcher, pickers and filter builder on React Aria`

### Task 11: ViewList on GridList

**Files:** Modify `ui/ViewList.tsx`, `ui/app.css`; delete `ui/useDragOrder.ts` if nothing else uses it.

- [ ] **Step 1: Tests** (existing `ViewList.test.tsx`, kept): the tree's order, links, selection and the reorder.
- [ ] **Step 2: Implement** as `GridList` with `useDragAndDrop` (`onReorder` calls what `useDragOrder` called); items render as links.
- [ ] **Step 3: Run** — pass; task gate.
- [ ] **Step 4: Commit** `refactor(grid): the views tree on a React Aria GridList`

### Task 12: Remove Sakani

**Files:** Modify `apps/grid/package.json`, `bun.lock`, `apps/grid/src/main.tsx` (drop `tokens.css` and `style.css` imports), `ui/theme.css` (declare any variable the CSS still reads that only Sakani declared, and the base styles `style.css` gave: font, box-sizing, focus ring).

- [ ] **Step 1: Remove** the package and the imports; `grep -r sakaniui apps/grid` → nothing; `grep -n sakaniui bun.lock` → nothing.
- [ ] **Step 2: Run** `bun run gate` — pass.
- [ ] **Step 3: Look:** every surface light and dark, compact and ruim, against `specs/grid-toolbar/shakeout/*.png`; fix any difference in `theme.css` or `app.css`.
- [ ] **Step 4: Commit** `chore(grid): Sakani removed`

## Close

Per `netdust-gates:policy`: `bun run gate` → `/feature-review react-aria` (no devops here) → one fix pass → `/shakeout` drives the E2E flows of the Test map and takes one screenshot per surface, light and dark.
