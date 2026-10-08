# Plan review — react-aria (second review)
Reviewed-plan: 56c50e041abc67a83914de6a2dbbcba9cdb8003d specs/react-aria/plan.md
Verdict: not ready

The revision fixed B1, S4, S6, S7 and S8, and N1 and N2. These premises hold in the source:
- `UNSAFE_PortalProvider` is exported from `react-aria`.
- `isNonModal` is a Popover prop.
- Popover passes `onClick` and `data-*` through to the DOM.
- The CHECKS.md flow names and the existing Grid.test names are real.
- `keys.ts:91` is the Escape case.

One new premise is false: the plan says the sheet owns Escape, but React Aria takes Escape first. Four smaller problems come from the revision itself.

## Blocking

**B1. "The sheet owns Escape (`keys.ts:91`); editors never handle it" is false wherever focus sits inside a React Aria overlay or ComboBox.**
- **Plan:** Task 1 Interfaces, the rule for every in-cell editor. Review Focus 3 depends on it.
- **Popover:** `usePopover` always installs `useOverlay` (react-aria 3.53.0 `overlays/usePopover.mjs:28-35`). Its Escape shortcut (`overlays/useOverlay.mjs:60-68`) returns `undefined`. `createKeyboardShortcutHandler.mjs` turns that into "stop propagation", unless `isKeyboardDismissDisabled` makes it return `false`. So Escape from a focused calendar (Task 1), a ListBox in `Pop` (Task 2) or a TextArea in `Pop` (Task 6) never reaches the `<table onKeyDown>`. Instead the popover's `state.close` runs.
  - Task 2 controls `isOpen` and maps `onOpenChange(false)` to `onLeave`. Escape after typing `v` would then commit `show`: `onLeave` commits the draft (`Grid.tsx:234-244`). Without that mapping, Escape does nothing.
  - Either way the contract line "Escape leaves without a write" fails (`field-contract.md:31`).
- **ComboBox:** `useComboBox.mjs:165-171` stops Escape whenever the input holds text and nothing is selected. The opening character puts text there (Task 3 "the opening character starts the search"). So the first Escape only reverts the search.
- **Task 4 contradicts the rule.** Its Question must keep "Escape keeps it". Today `Links.tsx:62-70` does that by owning Escape and stopping every key.
- **Smallest change:**
  - `Pop` sets `isKeyboardDismissDisabled`, so Escape keeps propagating to the sheet.
  - The to-one picker catches Escape itself (`onKeyDownCapture` → `onCancel`).
  - Name the alertdialog as the one editor part that owns Escape and stops all keys, as `Links.tsx:62-70` does today.
  - Add the Grid-seam tests that are missing: "Escape in the select listbox writes nothing" (Task 2), "Escape with the calendar open…" (Task 1, with the ruling: close the calendar first, or cancel the edit), and "Escape after typing a search cancels in one press" (Task 3).

## Should fix

**S1. The Task 1 Enter rule contradicts the e2e flows the plan keeps.**
- **Plan:** Step 3 says "While a segment is empty, Enter is stopped". Interfaces says an editor stops Enter "only while its value is incomplete".
- **Source:**
  - `e2e/step-0e.spec.ts:279-290` and `:371-393` (`clear-start-segment-by-segment`) clear every segment, press Enter, and expect `{ start_at: null }`.
  - The contract agrees: "Empties it, unless required" (`field-contract.md:38-39`).
  - When every segment is cleared, React Aria emits `onChange(null)`, but under the plan's rule Enter is stopped and the clear is never written.
- **Fix:** stop Enter only when some segments, but not all, are empty. Add the Grid-seam test "clearing every segment and Enter writes null on an optional date".
- Task 1 Files also leaves out `step-0e.spec.ts:385-389`: line 389 is a second `validity.badInput` assertion, and 383-388 drive a native `input`. List 379-393 as rewritten.

**S2. Task 2 and the Test map row "Select editor" name an existing test that does not test the select.**
- `Grid.test.tsx:274` "cancels on Escape without a write" edits `place`, a text column, and expects 'Grote zaal'.
- So no select Escape test exists at the sheet seam. That gap is where B1 shows.
- **Fix:** add a new select test in Task 2. Keep 274 as text coverage.

**S3. Task 1 breaks four existing Grid tests on a time column and names none of them.**
- In the Calais fixture `start` is a `time` column (`columns.ts:102, 197`).
- `Grid.test.tsx:303` "reads a typed time the way a hand types it", `:353` "follows the record…" and `:377` "commits an open editor…" all do `fireEvent.change(editor(), { target: { value: … } })`. `editor()` is `document.activeElement as HTMLInputElement` (line 56).
- Once Task 1 turns `TimeEditor` into a `TimeField`, the focused element is a `spinbutton` segment.
- **Fix:** list them in Task 1. Test 303 drops the lenient `930` parse; that is a ruling under R7. The two re-sort tests can move to a text column so their coverage survives.

**S4. The `Pop` interface contradicts itself and React Aria.**
- **Plan:** Task 1 Interfaces says "`onOpenChange(false)` (focus left, a click elsewhere) calls the editor's `onLeave`", but `Pop(props: PopoverProps)` never receives `onLeave`.
- Inside `DatePicker` and `ComboBox`, React Aria's Popover uses the parent's state (`react-aria-components/dist/private/Popover.mjs:53-55`), so a `Pop`-level `onOpenChange` is never called.
- Where it does fire (a standalone `isOpen`), it fires on Escape too (B1).
- Step 3 already gives the real mechanism: blur outside the field and its `Pop` calls `onLeave`.
- **Fix:** delete the `onOpenChange` clause and keep the one blur rule.

**S5. Task 5 relies on "the existing error toast" from `Grid`, which has no route to it.**
- The toast's `notify` lives in `App` (`App.tsx:152`).
- `Grid` gets no notify prop (`App.tsx:466`, the props at `Grid.tsx:30-60`), and `Grid.tsx` has no toast.
- **Fix:** add a `Grid` prop (e.g. `onNotice(message)`, wired to `notify` in `App`) to Task 5 Interfaces, and assert on it in "a missing record opens no drawer and says so".

**S6. The tests have no seam for the locale or for the root providers.**
- **Locale:**
  - The `I18nProvider` lives only in `main.tsx`.
  - In jsdom `document.documentElement.lang` is empty, so `locale()` returns `'en'` (`i18n.ts:259-265`), and `Date.test.tsx` and `Grid.test.tsx` render without a provider.
  - "shows the stored date in Dutch order", "first column header is `ma`" and every Grid-seam segment test would run in en-US.
- **Providers:** `main.tsx` renders at import (`main.tsx:14-22`) and exports nothing, so `main.test.tsx` "popovers render inside #root" has nothing to render.
- **Fix:** extract an exported `Providers` component (I18nProvider + PortalProvider) that `main.tsx` uses and the tests wrap with `locale="nl"`, or set `lang="nl"` in `test-setup.ts` and wrap in `Providers`.

**S7. Task 1 Step 2 (line 97) is a broken merge of two lines.**
- The step appears twice on one line.
- The second copy runs `src/ui/Pop.test.tsx`, which no Files or Test line creates anymore.
- **Fix:** keep `cd apps/grid && bunx vitest run src/grid src/main.test.tsx`.

## Note

- **N1. Pin `react-aria` to `3.53.0`.** `react-aria-components` 1.22.0 pins `react-aria` exactly at `3.53.0` (its package.json). Task 1 adds `react-aria` unversioned, so bun writes `^3.53.0`. A later 3.54 would install a second copy with its own `PortalContext`, and the provider would silently stop placing popovers. `main.test.tsx` would catch it, but pinning prevents it.
- **N2. Task 2 needs a ruling on how Enter becomes `onCommit(key, 'down')`.** On a ListBox option, Enter is consumed by `usePress` (`interactions/usePress.mjs:251-266`, which stops propagation), so an `onKeyDown` on the ListBox or `Pop` never sees it. The commit has to come from `onAction`/`onSelectionChange` or a capture handler, and a click must still mean `'stay'`. The listbox must also start on the option the opening letter picks (today `startAt`, `Select.tsx:33-35`). Typeahead does not see that letter, because it went to the cell.
- **N3. Clicking a segment ends the edit.** The in-cell editor root could also stop click propagation, as `Links.tsx:108` does. `useDateSegment` stops only `pointerdown`/`mousedown` (`datepicker/useDateSegment.mjs:365-370`), so clicking a segment to fix the month bubbles a click to `<td onClick>` and ends the edit. Today's native input does the same, so this is not a regression, but it is cheap to fix while the rule is being written.
- **N4. The ↑↓ rule is redundant.** React Aria already stops ↑↓ in segments (`useSpinButton` shortcuts) and ←→ (`useDatePickerGroup`, which `TimeField` uses too), so the editor needs no code for it. The Grid-seam test "↑ steps the focused segment and does not move the cell" stays useful as the guard.
- **N5. To-many cancel is not tested.** The spec's done-when asks for each editor's commit and cancel. Task 4 tests Escape only inside the removal question, not Escape leaving the to-many editor.

## Premises checked

- `UNSAFE_PortalProvider` from `react-aria` → react-aria 3.53.0 `exports/index.d.ts:92` → holds (not re-exported by RAC)
- Popover and Modal honour the provider → `overlays/Overlay.mjs:31-41` (`getContainer` when no `portalContainer`) → holds
- `isNonModal` on Popover → `usePopover.d.ts:30`; RAC `PopoverProps` extends `AriaPopoverProps` → holds
- Popover accepts `onClick`/`onDoubleClick`/`data-editor` → RAC `Popover.mjs:183` `filterDOMProps(props, {global: true})` → holds
- `Pop`'s `onOpenChange(false)` reaches the editor → `Popover.mjs:53-55` uses the context state inside DatePicker/ComboBox → does not hold
- The sheet owns Escape while an editor is open → `useOverlay.mjs:60-68`, `useComboBox.mjs:165-171`, `Links.tsx:62-70` → does not hold
- `keys.ts:91` Escape → `keys.ts:91-92` → holds
- Dark tokens on `#root` → `theme.css:62, 110`, `Theme.tsx:26-27`, `app.css:10-18` → holds
- `fromCell` judges keys, copy and paste only → `Grid.tsx:66-68, 260, 279, 286` → holds
- A td click drops the edit → `GridBody.tsx:56-61`, `keys.ts:77-79, 141-142` → holds
- `Links.tsx:106-108` stops propagation → holds
- Calendar day and option clicks stop on their own as well → `usePress.mjs:277-301` → holds (`Pop`'s click stop is a second guard)
- `locale()` at `i18n.ts:259` → holds, but returns `'en'` under jsdom
- e2e step-0b 108, 163-171, 205 → holds
- e2e step-0e 192-196, 262, 270-290, 312-334, 377, 383, 420 → holds, but 385-389 (native input, `badInput`) is missing
- e2e step-1 175-177, 311, 335, 342 → holds
- `dagplanning.spec.ts:166-167` is the Van/Tot range (Task 10) → holds
- Grid.test "picks a select from its listbox by letter and Enter" → `Grid.test.tsx:286` → holds
- Grid.test "cancels on Escape without a write" is a select test → `Grid.test.tsx:274` edits `place` (text) → does not hold
- Grid.test "the drawer", "Zeker?" → `Grid.test.tsx:620-725` → holds
- The existing time-cell Grid tests survive Task 1 → `Grid.test.tsx:303, 353, 377` use `fireEvent.change` on an input → does not hold (not named)
- CHECKS.md names (dark-and-density, create-team-and-personal-view, period-is-a-filter, filter-builder, publish-from-share-menu, the-open-models-menu-exports, rename-and-icon-a-model, query-views-under-model, tree-scrolls-in-rail) → `specs/CHECKS.md:30-87` → holds
- "the existing error toast" reachable from `Grid` → `App.tsx:152, 466`; Grid has no notify prop → does not hold
- `rowOf` `api.ts:162`, `records` `api.ts:135`, `columnsFor` `columns.ts:260`, `PICKER_CAP`/props `RelationPicker.tsx:7-30` → holds
- `useDragOrder` used only by ViewList → `ViewList.tsx:8, 100` → holds
- FilterBuilder 106-107 range, `app.css:768` `[class*="_input--sm"]` → holds
- RAC 1.22.0 pins `react-aria` 3.53.0 → RAC package.json → holds (the plan does not pin)

## The cut
One plan for one spec: one feature. The judgement in the first review stands.

Files: /home/ntdst/Sites/worktable/specs/react-aria/plan.md, /home/ntdst/Sites/worktable/specs/react-aria/plan-review.md (first review), /home/ntdst/Sites/worktable/apps/grid/src/grid/Grid.tsx, /home/ntdst/Sites/worktable/apps/grid/src/grid/Grid.test.tsx, /home/ntdst/Sites/worktable/apps/grid/src/grid/cells/Links.tsx, /home/ntdst/Sites/worktable/apps/grid/src/main.tsx, /home/ntdst/Sites/worktable/apps/grid/src/ui/App.tsx, /home/ntdst/Sites/worktable/e2e/step-0e.spec.ts. The React Aria sources I checked are unpacked under /tmp/claude-1000/-home-ntdst-Sites-worktable/06225491-7288-42da-ac3a-20327873f390/scratchpad/pkgs/.

The first review (of blob 3941bc8) is in git: `git show 8231620:specs/react-aria/plan-review.md`.
