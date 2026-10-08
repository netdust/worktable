# React Aria Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Sakani with React Aria Components for every editor and every piece of chrome in `apps/grid`, keeping the sheet and the grid's look.

**Architecture:** React Aria parts, unstyled, styled in `app.css` with the grid's own tokens. At the app root, one `I18nProvider` carries the locale and one `UNSAFE_PortalProvider` (from `react-aria`) sends every popover, menu and modal into `#root`, where the dark tokens live; no call site passes a portal prop. The sheet (`Grid.tsx`, `keys.ts`, `GridBody.tsx`) keeps its key machine; editors talk to it only through `EditorProps` (`cells/props.ts`). Sakani stays installed until the last task removes it.

**Tech Stack:** React 19, `react-aria-components` 1.22, `@internationalized/date`, Vitest + Testing Library, Playwright.

**Spec:** `specs/react-aria/spec.md` (and `specs/field-contract.md`, the editors' behaviour).

**First working version:** Task 1 — the date, datetime and time editors on React Aria, in Dutch, in the running grid. It is the screenshot that started this feature.

**Simplest design:** Swap each Sakani import for its React Aria part with the same props, file by file, no wrappers. The plan uses it everywhere except the cell editors' popover. A React Aria popover portals out of the DOM but not out of the React tree: a click on a calendar day or an option bubbles to the cell's `<td onClick>` (`GridBody.tsx:56-61`), which selects the cell and drops the edit without a write (`keys.ts:141-142, 77-79`) — the reason `Links.tsx:106-108` already stops propagation. So cell editors share one small `Pop`: a non-modal `Popover` that stops click and double-click propagation and carries `data-editor`, which is what lets its keys reach the key machine (`fromCell`, `Grid.tsx:66-68`, judges keys, copy and paste only). The portal target is not `Pop`'s job: the root provider does that once for every popover.

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

1. A click inside a portalled popover (calendar day, listbox option, combobox option) commits that choice and does not end the edit through the cell's click — Task 1 `Grid.test.tsx` "a calendar day click commits the date once", Task 2 "an option click commits once".
2. In dark mode every popover, menu and dialog is dark — Task 1 `Providers.test.tsx` "popovers render inside #root"; Task 12 screenshots light and dark.
3. Enter, Tab and Escape inside an editor commit or cancel exactly once — tested at the `Grid` seam counting `update` calls, in each editor task ("Enter commits once", "Escape writes nothing").
4. An incomplete date or time (a segment left empty) never writes: Enter keeps the editor open — Task 1 `Grid.test.tsx` "Enter on an incomplete date writes nothing and keeps the editor".
5. A required column offers no empty choice and never clears — Tasks 1, 2, 3 "required offers no leeg".

## Test map

| Unit | Seam | Tests: tier · file · command | E2E flows |
|---|---|---|---|
| Date, datetime, time editors + `dates.ts` + `Pop` + root providers | the sheet (`Grid`), and `Editor` render | unit · `grid/Grid.test.tsx` (sheet seam: commit, cancel, click), `cells/Date.test.tsx`, `cells/dates.test.ts`, `ui/Providers.test.tsx` · `cd apps/grid && bunx vitest run src/grid src/ui/Providers.test.tsx` | edit-date-cell, edit-datetime-cell, edit-time-cell (new, `/shakeout` writes them); the existing cell-date flows of step-0b, step-0e, step-1, rewritten in Task 1 |
| Select editor | the sheet, and `Editor` render | unit · `Grid.test.tsx` ("picks a select from its listbox by letter and Enter", the new "Escape in the select listbox writes nothing"), `cells/Select.test.tsx` · same runner | edit-select-cell (new, `/shakeout`) |
| To-one picker (`RelationPicker` on `ComboBox`) | the sheet, and `Editor` render | unit · `Grid.test.tsx`, `cells/Relation.test.tsx` · same runner | edit-relation-cell (new, `/shakeout`) |
| To-many editor (`TagGroup` + `ComboBox`) | the sheet, and `Editor` render | unit · `Grid.test.tsx`, `cells/Links.test.tsx` · same runner | add-and-remove-link (new, `/shakeout`) |
| Open-panel icon on a to-one cell | `Display` render + `Grid` | unit · `cells/Relation.test.tsx`, `Grid.test.tsx` · same runner | open-related-record (new, `/shakeout`) |
| Long text, bool, matrix note | the sheet, `matrix/Panel` | unit · `Grid.test.tsx`, `cells/Text.test.tsx` (new), existing `matrix/Panel.test.tsx` · same runner | edit-long-text, toggle-bool (new, `/shakeout`) |
| Buttons, MoreMenu, Confirm, SidePanel, Drawer | component render | unit · `Grid.test.tsx` ("the drawer", DeleteRow's Zeker?), `Drawer.test.tsx`, new `ui/MoreMenu.test.tsx` (Escape closes and returns focus) · `cd apps/grid && bunx vitest run` | the-open-models-menu-exports, rename-and-icon-a-model |
| Column picker, Search, RailFoot/Theme, Toast, Spinner, EmptyState | component render | unit · existing `Toolbar`, `Search`, `Toast`, `App` tests · same | dark-and-density |
| Dialogs: NewViewDialog, Share, sign-in overlay | component render | unit · existing `NewViewDialog`, `Share`, `SignIn` tests · same | create-team-and-personal-view, publish-from-share-menu |
| Pickers: SpaceSelect, Pick, FilterBuilder (with the date range) | component render | unit · existing `FilterBuilder`, `App` tests · same | filter-builder, period-is-a-filter |
| ViewList on `GridList` with drag order | component render | unit · `ViewList.test.tsx`, its reorder tests rewritten · same | query-views-under-model, tree-scrolls-in-rail; reorder-views (new, `/shakeout`) |
| Sakani removal | the build | `bun run gate` | the whole e2e suite |

Gate for every task: `bun run check && cd apps/grid && bunx vitest run` (the full `bun run gate` with e2e at Tasks 6, 10 and 12).

---

### Task 1: Date, datetime and time editors on React Aria

**Files:**
- Modify: `apps/grid/package.json` (add `react-aria-components@1.22.0` and `react-aria@3.53.0`, both exact: the components pin that `react-aria`, and a second copy would carry its own portal context; plus `@internationalized/date`)
- Modify: `apps/grid/src/main.tsx` (wrap the app in `I18nProvider locale={locale()}` and `UNSAFE_PortalProvider getContainer={() => document.getElementById('root')}`)
- Create: `apps/grid/src/ui/Pop.tsx` — `Pop`; `apps/grid/src/ui/Providers.tsx` — `Providers`
- Modify: `apps/grid/src/test-setup.ts` — `renderNl(ui)`
- Create: `e2e/segments.ts` — `fillDate(field: Locator, value: string)` typing a stored value into React Aria segments; the three specs above call it from their own `typeInto` for dates and times
- Modify: `e2e/step-0b.spec.ts` (108, 163-171, 205), `e2e/step-0e.spec.ts` (192-196, 262, 312-334, 420; 270-290 and 371-393 rewritten as segment flows: clearing some segments keeps the stored value, clearing all and Enter writes `{ start_at: null }`), `e2e/step-1.spec.ts` (175-177, 311, 335, 342)
- Create: `apps/grid/src/grid/cells/dates.ts`
- Rewrite: `apps/grid/src/grid/cells/Date.tsx` (`DateEditor`, `DateTimeEditor`), `cells/Time.tsx` (`TimeEditor`)
- Modify: `apps/grid/src/ui/app.css` (`.nv-datefield`, `.nv-calendar`, `.nv-pop` for React Aria)
- Test: `cells/dates.test.ts` (new), `cells/Date.test.tsx` (rewrite), `grid/Grid.test.tsx` (new sheet-seam tests; and the three that `fireEvent.change` a time editor — `:303` "reads a typed time the way a hand types it" types `930` into the segments and expects `09:30`; `:353` and `:377` move to a text column, keeping their re-sort coverage), `ui/Providers.test.tsx` (new)

**Interfaces:**
- Produces: `Providers({ locale, children }: { locale: string; children: ReactNode })` in `src/ui/Providers.tsx` — `I18nProvider locale={locale}` + `UNSAFE_PortalProvider getContainer={() => document.getElementById('root')}`. `main.tsx` renders `<Providers locale={locale()}>`; every test that renders an editor or the `Grid` wraps in `<Providers locale="nl">` (a `renderNl` helper in `src/test-setup.ts`), since jsdom's empty `lang` makes `locale()` answer `'en'`.
- Produces: `Pop(props: PopoverProps)` — the cell editors' popover: React Aria `Popover` with `isNonModal`, `isKeyboardDismissDisabled` (so Escape travels on to the sheet instead of closing the popover), class `nv-pop`, `data-editor`, and `onClick`/`onDoubleClick` that stop propagation. Tasks 2, 3, 4 and 6 use it; chrome popovers (Tasks 7-10) use React Aria's own `Popover`, `Menu` and `Modal` and need no portal prop.
- Rules for every in-cell editor:
  - Its root element carries `data-editor`, so its keys reach the key machine, and stops click propagation, so a click on a segment or a chip does not end the edit (as `Links.tsx:108` does today).
  - Escape cancels the edit in one press, wherever focus is, through the sheet (`keys.ts:91`). Three parts would otherwise swallow it: the select `ListBox` (Task 2: `selectionMode="none"` lets it through), the to-one `ComboBox` (Task 3: its wrapper catches Escape, calls `onCancel` and stops it, so a second Escape cannot discard a draft row, `Grid.tsx:266-270`), and the to-many removal question, which owns Escape and every key, as `Links.tsx:62-70` does today (Escape keeps the person).
  - A key handler an editor needs before React Aria sees the key goes on a plain wrapper element (`onKeyDownCapture` on a `div`), never on a React Aria component: they drop capture key props (`filterDOMProps` keeps no key events).
  - An editor whose `Pop` stands alone (select, long text, the removal question) renders its own anchor element in the cell and passes it as `triggerRef`, with `isOpen`.
  - Leaving: focus moving outside the editor root and its `Pop` calls `onLeave` (which commits the draft, `Grid.tsx:234-244`).
  - A date editor stops Enter only while some segments, not all, are empty. All empty is a clear; React Aria then emits `onChange(null)`.
  - ↑↓ and ←→ inside segments: React Aria already stops them; no code, one guard test.
- Produces in `dates.ts`: `toDate(v: string): CalendarDate | null`, `fromDate(d: CalendarDate | null): string`, `toMoment(v: string): CalendarDateTime | null`, `fromMoment(d: CalendarDateTime | null): string`, `toTime(v: string): Time | null`, `fromTime(t: Time | null): string`. Empty string ⇄ null; malformed input → null.
- Consumes: `EditorProps` (`cells/props.ts`), unchanged.

- [ ] **Step 1: Write the tests**

`dates.test.ts`: `toDate('2026-10-13')` → `CalendarDate(2026,10,13)` and back; `toMoment('2026-10-13T20:30')` round-trips; `toTime('09:05')` round-trips to `'09:05'`; `toDate('')`, `toDate('13/10/2026')` → `null`; `fromMoment(null)` → `''`.

`Date.test.tsx` (rewrite against roles; React Aria segments are `role="spinbutton"`):
- "shows the stored date in Dutch order": `DateEditor` on `'2026-10-13'` → the segments read day `13`, month `10`, year `2026`, in that order.
- "drafts the typed date as YYYY-MM-DD": type into the segments → `onDraft` last called with `'2026-11-02'`.
- "datetime shows 24-hour time": `DateTimeEditor` on `'2026-10-13T20:30'` → an hour segment `20`, no AM/PM segment.
- "required never drafts empty": required column, clear every segment → `onDraft` never called with `''`.
- "the calendar starts on Monday": open the calendar button → first column header is `ma` (the `CalendarGrid` takes `weekdayStyle="short"`; the default narrow style gives `M`).
- "the editor root carries data-editor".

`Grid.test.tsx` (the sheet seam, counting the mocked `update`):
- "Enter commits a typed date once": open a date cell, type a date, Enter → `update` called once with the `YYYY-MM-DD` value.
- "Escape writes nothing": open, type, Escape → `update` not called, the cell shows the stored value.
- "a calendar day click commits the date once": open, open the calendar, click a day → the edit stays open on that day (the cell's click did not end it); Enter → `update` once.
- "Enter on an incomplete date writes nothing and keeps the editor": clear the day segment, Enter → `update` not called, the editor still open.
- "clearing every segment and Enter writes null on an optional date" → `update` once with `null`.
- "Escape with the calendar open cancels the edit": open the calendar, Escape → `update` not called, the editor closed. `Ruling:` Escape cancels in one press even with the calendar open — cost if wrong: one key handler to close the calendar first.
- "a click on a segment keeps the edit".
- "↑ steps the focused segment and does not move the cell", in an editor opened by typing a digit.

`Providers.test.tsx`: "popovers render inside #root": render `Providers` inside a `<div id="root">` around an open React Aria `Popover` → its element is inside `#root`.

- [ ] **Step 2: Run** `cd apps/grid && bunx vitest run src/grid src/ui/Providers.test.tsx` — expect failures (modules missing).

- [ ] **Step 3: Implement**

`DateEditor`: React Aria `DatePicker` with `data-editor` on its root (`DateInput` + `DateSegment`s, a calendar `Button`, `Pop` with `Calendar`), `value={toDate(editing.draft)}`, `onChange={(d) => { if (d === null && column.required) return; onDraft(fromDate(d)) }}`, autofocus on the first segment, `aria-label={column.label}`. While some segments, not all, are empty, Enter is stopped at the editor root (React Aria emits no `onChange` for an incomplete value, so the draft would still hold the last complete one). `DateTimeEditor`: the same with `granularity="minute"`, `hourCycle={24}`, `toMoment`/`fromMoment`. `TimeEditor`: `TimeField`, `hourCycle={24}`, `toTime`/`fromTime`. Blur leaving the editor (focus not inside the field or its `Pop`) calls `onLeave`. A typed character that opened the editor (`editing.mode === 'enter'`): if it is a digit, it is entered into the first segment; verify React Aria takes it, else open on the stored value with the first segment focused and record a `Ruling:`.

- [ ] **Step 4: Run** the same command — all pass; then the task gate, plus `bunx playwright test e2e/step-0b.spec.ts e2e/step-0e.spec.ts e2e/step-1.spec.ts`.

- [ ] **Step 5: Look at it.** Run the grid (`bun packages/engine/src/serve.ts …` + `bunx vite`), open Dagplanning, edit a start time and a date, light and dark; the calendar is Dutch, Monday first, dark in dark mode.

- [ ] **Step 6: Commit** `feat(grid): date, datetime and time editors on React Aria, in Dutch`

### Task 2: Select editor

**Files:** Modify `cells/Select.tsx`, `ui/app.css`; Test `cells/Select.test.tsx`.

**Interfaces:** Consumes `Pop` (Task 1). Produces `OptionMark({ column, option }: { column: Column; option: string })` — the pill, dot or icon-and-word the cell draws; `SelectCell` renders through it.

- [ ] **Step 1: Tests.** `Select.test.tsx` (rewritten against roles): "each option is drawn as the cell draws it" (a `status` column's options carry `nv-pill nv-pill--<tone>`, `soort` options `nv-dot` or the kind icon); "the current option is marked" (`data-current`; `selectionMode="none"` renders no `aria-selected`); "required offers no leeg". `Grid.test.tsx`: the existing "picks a select from its listbox by letter and Enter" is rewritten at `:294-296` — the opening letter's option is `document.activeElement` (text `Voorstelling`) and Enter is fired on it — with `update` once; new "↑ on the first option keeps the select open and writes nothing"; new "Escape in the select listbox writes nothing" (after typing a letter), "an option click commits once and stays", "Tab commits and moves right", "the listbox opens on the option the opening letter picks".
- [ ] **Step 2: Run** `bunx vitest run src/grid/cells/Select.test.tsx src/grid/Grid.test.tsx` — fail.
- [ ] **Step 3: Implement** `SelectEditor` as a React Aria `ListBox` with `selectionMode="none"` and `onAction` (typeahead built in), inside a plain `div` wrapper inside `Pop`, anchored to an anchor element in the cell. `selectionMode="none"` makes a click fire `onAction` → `onCommit(key, 'stay')` and lets Escape through to the sheet. The current option carries `data-current` (styled as marked; the test "the current option is marked" asserts it). On open, an effect focuses the `startAt` option's element (the opening letter went to the cell, not the typeahead). The wrapper's `onFocusCapture` drafts the focused option's key (`onDraft`), so leaving commits the highlighted option as today (`Select.tsx:42-44`). The wrapper's `onKeyDownCapture` turns Enter and Tab on the focused option into `onCommit(key, 'down' | 'right' | 'left')`, with `preventDefault` and `stopPropagation`, before `usePress` consumes Enter. A bubble-phase `onKeyDown` on the same wrapper stops ↑ and ↓ that come back out of the ListBox at its first or last option (today's clamp, `Select.tsx:47-48`), so they never reach `keys.ts:97-100` and write the cell. Options render `OptionMark`.
- [ ] **Step 4: Run** — pass; task gate.
- [ ] **Step 5: Commit** `feat(grid): the select editor on a React Aria ListBox, options drawn as the cell draws them`

### Task 3: To-one picker on ComboBox

**Files:** Rewrite `cells/RelationPicker.tsx`; modify `cells/Relation.tsx`, `ui/app.css`; Test `cells/Relation.test.tsx`.

**Interfaces:** Keeps `RelationPicker`'s props (`model, label, query, first, onPick, onCancel, onClose, onClear, before, hide, clearOnPick`) and `PICKER_CAP = 50` — Task 4 uses the same props. Consumes `records(model, search)` (`api.ts:135`), `Pop`.

- [ ] **Step 1: Tests:** "lists the space's records first"; "shows at most 50 and says how many more"; "the opening character starts the search"; in `Grid.test.tsx` "Enter picks the active record and writes once", "an option click writes once" and "Escape after typing a search cancels in one press"; "Delete in an empty search clears, unless required"; "Escape cancels"; "the input has the column's accessible name".
- [ ] **Step 2: Run** `bunx vitest run src/grid/cells/Relation.test.tsx` — fail.
- [ ] **Step 3: Implement** on React Aria `ComboBox` (`allowsEmptyCollection`, `menuTrigger="input"`, controlled `inputValue`, `items` from the debounced `records` call, 150 ms as today), its `ListBox` in `Pop`; `before` renders before the `Input` inside the field group. A plain `div` wrapper around the field carries `onKeyDownCapture` for these keys, each stopped (Tab also `preventDefault`): Escape → `onCancel`; Tab → `onClose` (as `RelationPicker.tsx:95-96` today; React Aria would otherwise commit and pass Tab to the sheet, which writes the opening letter); Delete or Backspace in an empty search → `onClear` (as `RelationPicker.tsx:98-99`; Task 4's last-chip removal rides on it); Enter on the `Input` with no `aria-activedescendant` → picks the first listed record, unless the search is still loading (`RelationPicker.tsx:92-93`) — never from a chip's button. Tests add, in `Grid.test.tsx`: "Tab in the to-one picker writes nothing" and "Escape in the to-one picker of a draft row keeps the draft row".
- [ ] **Step 4: Run** — pass; task gate.
- [ ] **Step 5: Commit** `feat(grid): the relation picker on a React Aria ComboBox`

### Task 4: To-many editor on TagGroup

**Files:** Modify `cells/Links.tsx`, `ui/app.css`; Test `cells/Links.test.tsx`.

**Interfaces:** Consumes `RelationPicker` (Task 3), `LinksContext` unchanged.

- [ ] **Step 1: Tests:** "chips flow inline and the box caps at two lines" (the box has class `nv-chosen` with `max-height` set; asserted in CSS by the e2e screenshot, here: chips render in one `TagGroup` `role="grid"`); "Backspace in an empty search removes the last chip"; "removing a confirmed link asks first" (an `alertdialog` with Annuleren and Verwijderen; Escape keeps it); "Enter adds once and empties the search" and "Escape leaves the editor without a create or delete" (both in `Grid.test.tsx`, counting link creates and deletes); "a chip's remove button names the person".
- [ ] **Step 2: Run** — fail.
- [ ] **Step 3: Implement** `Chosen` as a React Aria `TagGroup`/`TagList`/`Tag` with `onRemove`, passed as `before` to `RelationPicker`; `Question` as `Dialog role="alertdialog"` inside `Pop`.
- [ ] **Step 4: Run** — pass; task gate.
- [ ] **Step 5: Commit** `feat(grid): the to-many editor on a React Aria TagGroup`

### Task 5: Open-panel icon on a to-one cell

**Files:** Modify `cells/Relation.tsx` (`RelationCell`), `grid/Grid.tsx` (drawer opens a related record), `grid/Drawer.tsx` only if it needs a `title` prop; Test `cells/Relation.test.tsx`, `grid/Grid.test.tsx`.

**Interfaces:** Consumes `rowOf(model, id)` (`api.ts:162`), `columnsFor(model, view, false, models)` (`columns.ts:260`). Produces a context `openRelated(model: string, id: number)` from `Grid` to `RelationCell`, and a new `Grid` prop `onNotice(message: string)` that `App` wires to its `notify` (`App.tsx:152`, the `Grid` at `App.tsx:466`).

- [ ] **Step 1: Tests:** "a filled to-one cell shows an open button named after the record" (React Aria `Button`, `aria-label` "Open <title>"); "an empty cell shows none"; "no open button when the target model is not readable" (not in `models`); in `Grid.test.tsx`: "the open button shows the related record in the drawer, read-only" and "a missing record opens no drawer and says so" (`rowOf` null or a 404 → `onNotice` called once, no drawer).
- [ ] **Step 2: Run** — fail.
- [ ] **Step 3: Implement**: the button appears on hover and focus of the cell (CSS), press calls `openRelated`; `Grid` fetches `rowOf` and opens the `Drawer` with that model's columns, `writable = false`; a null or a thrown `rowOf` calls `onNotice(t('recordGone'))` (a new Dutch string: "Dit record bestaat niet meer of je mag het niet zien").
- [ ] **Step 4: Run** — pass; task gate.
- [ ] **Step 5: Commit** `feat(grid): a to-one cell opens its record`

### Task 6: Long text, bool and the matrix note

**Files:** Modify `cells/Text.tsx` (`LongTextEditor`), `cells/Bool.tsx`, `matrix/Panel.tsx`, `ui/app.css`; Test `cells/Text.test.tsx` (new), `matrix/Panel.test.tsx`.

- [ ] **Step 1: Tests:** long text, in `Grid.test.tsx`: "Enter is a new line, Ctrl+Enter commits once", "Escape writes nothing"; bool: "Space flips it", "a read-only switch does not flip"; matrix note: existing `Panel.test.tsx` passes against `TextArea`.
- [ ] **Step 2: Run** — fail.
- [ ] **Step 3: Implement** `LongTextEditor` as `TextField` + `TextArea` inside `Pop`; `BoolCell` as React Aria `Switch` (`isReadOnly={!column.editable}`, `excludeFromTabOrder`); the matrix note as `TextField` + `TextArea`.
- [ ] **Step 4: Run** — pass; full `bun run gate` (the editors are done; the cell-date flows were rewritten in Task 1).
- [ ] **Step 5: Commit** `feat(grid): long text, switch and the matrix note on React Aria`

### Task 7: Buttons, MoreMenu, Confirm, SidePanel, Drawer

**Files:** Modify `grid/Drawer.tsx`, `grid/Grid.tsx`, `cells/Links.tsx`, `ui/Confirm.tsx`, `ui/NewViewDialog.tsx`, `ui/Share.tsx`, `ui/SidePanel.tsx`, `ui/SignIn.tsx`, `ui/Toolbar.tsx`, `ui/ViewPanel.tsx`, `ui/MoreMenu.tsx`, `ui/app.css`.

**Interfaces:** Produces `.nv-button` with modifiers `--primary`, `--secondary`, `--ghost`, `--destructive` and `--sm`, matching Sakani's four variants and two sizes as they look today. MoreMenu: `MenuTrigger` + `Menu` in a React Aria `Popover` (the root provider places it).

- [ ] **Step 1: Tests:** new `ui/MoreMenu.test.tsx` "Escape closes the menu and returns focus to its button"; run it and the existing `Grid.test.tsx` drawer and Zeker? tests and `Drawer.test.tsx` — green except the new one where the current menu differs.
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
- [ ] **Step 2: Implement** each as `ModalOverlay` + `Modal` + `Dialog` (the root provider places them); the sign-in overlay is not dismissable.
- [ ] **Step 3: Run** — pass; task gate.
- [ ] **Step 4: Commit** `refactor(grid): dialogs on React Aria`

### Task 10: SpaceSelect, Pick and the filter builder

**Files:** Modify `ui/SpaceSelect.tsx`, `ui/Pick.tsx`, `ui/FilterBuilder.tsx` (lines 106-107: the "ligt tussen" range), `ui/app.css`; Test `ui/FilterBuilder.test.tsx`, `ui/App.test.tsx`.

**Interfaces:** `Pick` keeps its props (`label, value, searchable, className, …`) so `FilterBuilder` call sites stay; it becomes `Select` (plain) or `ComboBox` (`searchable`) with React Aria's own `Popover` (it is chrome, not a cell editor). The range is two React Aria `DatePicker`s, Van and Tot, with `toDate`/`fromDate` (Task 1), keeping today's two labelled fields so `e2e/dagplanning.spec.ts:166-167` changes only how it types (`fillDate`).

- [ ] **Step 1: Tests** (existing, kept) plus: "ligt tussen shows Dutch dates and drafts YYYY-MM-DD for both ends". A reversed range drafts as typed, as today (R7).
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** — pass; full `bun run gate` (e2e `dagplanning.spec.ts:166-167` types the range into segments).
- [ ] **Step 4: Commit** `refactor(grid): the space switcher, pickers and filter builder on React Aria`

### Task 11: ViewList on GridList

**Files:** Modify `ui/ViewList.tsx`, `ui/app.css`, `ui/ViewList.test.tsx`; delete `ui/useDragOrder.ts` (only ViewList uses it).

- [ ] **Step 1: Tests:** the order, links and selection tests kept; the pointer-driven reorder tests (`ViewList.test.tsx:209-289`) rewritten against React Aria's keyboard drag and `onReorder`: "a view moves within its own group", "a view never drops into another group", "a view drops past the last view of its group".
- [ ] **Step 2: Implement** as `GridList` with `useDragAndDrop` (`onReorder` calls what `useDragOrder` called; `acceptedDragTypes`/`getDropOperation` refuse a drop outside the group); items render as links.
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
