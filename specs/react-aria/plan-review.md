# Plan review: react-aria (third review)
Reviewed-plan: c5807d2d97ca1a11723db0fa9f999a724e3515f5 specs/react-aria/plan.md
Verdict: not ready

## Summary

The revision fixed the old B1 in the places it named, and fixed S2 to S7 and N1 to N5. Four mechanisms you asked about check out in source:
- **`isKeyboardDismissDisabled` lets Escape through.** `useOverlay.mjs:60-68` returns `false`, and `createKeyboardShortcutHandler.mjs` turns `false` into `continuePropagation`.
- **A Popover inside a DatePicker honours it.** DatePicker's `PopoverContext` value (`DatePicker.mjs:141-146`) sets only trigger, triggerRef, placement and clearContexts. Local props win, and `usePopover.mjs:28-35` hands the prop to `useOverlay`.
- **Escape gets past the calendar.** `useCalendarGrid.mjs:39-43` returns `false`, so Escape continues. Escape from a calendar day or a TextArea in `Pop` now reaches `<table onKeyDown>` once.
- **Date segments let Enter through.** `useDateSegment.mjs:125-136` binds only Backspace, Delete and Mod+a.

Two things the plan relies on do not hold:
- A RAC ListBox swallows Escape too, and `onKeyDownCapture` on a RAC component is thrown away.
- The ListBox's `onAction` does not fire on a click in the normal case.

All three Blocking findings are in Task 2. The ComboBox key handling in Task 3 needs to be spelled out.

## Blocking

**B1. The select ListBox swallows Escape. The plan's Escape rule leaves it out.**
- **Plan:** Task 1 Interfaces says "Two parts would otherwise swallow it": the to-one ComboBox and the removal question. Task 2 Step 3 opens the ListBox "with `selectedKeys`".
- **Source:** `react-aria/dist/private/selection/useSelectableCollection.mjs:186-191, 254`. The default `escapeKeyBehavior` is `'clearSelection'`. When `selectedKeys.size !== 0` and `disallowEmptySelection` is off, Escape clears the selection and returns `undefined`, which stops propagation.
- **Effect:** the selection is never empty here (the current option, or `''` for leeg), so Escape never reaches `keys.ts:91`. Task 2's new test "Escape in the select listbox writes nothing" and Review Focus 3 fail.
- **Fix:** give the ListBox `escapeKeyBehavior="none"` (a ListBox prop, `useListBox.d.ts:20`), or `selectionMode="none"` (see B3). Name the ListBox as a third part in the Task 1 Escape rule.

**B2. `onKeyDownCapture` placed on a RAC component is dropped at runtime.**
- **Plan:**
  - Task 2 Step 3: "An `onKeyDownCapture` on the ListBox turns Enter and Tab … into `onCommit`".
  - Task 1 Interfaces: "the to-one `ComboBox` (an `onKeyDownCapture` that calls `onCancel`)".
- **Source:**
  - RAC `ListBox.mjs:229-233` spreads only `filterDOMProps(props, {global: true})`. RAC `ComboBox.mjs:180` and `Popover.mjs:183` do the same.
  - `react-aria/dist/private/utils/filterDOMProps.mjs` keeps a `…Capture` prop only when its base name is in `globalEvents`. That list has click, pointer, touch, mouse, scroll, wheel, animation and transition events, but no key events.
  - So `onKeyDownCapture` on `ListBox`, `ComboBox` or `Pop` never reaches the DOM.
  - The N2 premise ("usePress consumes Enter before any bubbling handler") still holds, so a capture handler is the right tool. It just has to sit on a real element.
- **Fix:**
  - Task 2: put the capture on a plain `<div>` that wraps the ListBox inside `Pop`.
  - Task 3: put it on the RAC `Input`, which spreads its props (`Input.mjs:52-53`), or on a wrapping `<div>`.

**B3. On a filled cell, a click on an option never reaches `onAction`.**
- **Plan:** Task 2 Step 3: "a click arrives through `onAction` as `onCommit(key, 'stay')`", together with `selectionMode="single"` and `selectedKeys`.
- **Source:** `useSelectableItem.mjs:114-118`. A ListBox defaults to `selectionBehavior: 'toggle'`. Then `hasPrimaryAction = allowsActions && (!allowsSelection || manager.isEmpty)`, and `hasSecondaryAction` needs `'replace'`.
- **Effect:** with a selection present, `hasAction` is false and a click only toggles the selection (`:178`). `onAction` never fires, and with a controlled `selectedKeys` and no `onSelectionChange` the click does nothing. Task 2's "an option click commits once and stays" fails.
- **Smallest change, pick one:**
  - **(a)** `selectionMode="none"` plus `onAction`. A click fires the action and Escape passes, which also fixes B1. The current option is then marked by a class or `data-current` instead of `aria-selected`, and the test "the current option is marked" is adjusted to match.
  - **(b)** Keep single selection, commit the click from `onSelectionChange`, and add `escapeKeyBehavior="none"`.

## Should fix

**S1. Task 3 Step 3: the Escape capture must stop propagation.**
- **Source:**
  - When the search is empty, or a record is selected, `useComboBox.mjs:165-171` lets Escape continue to the table.
  - A capture that calls `onCancel` without stopping the event means a second Escape reaches `Grid.tsx` `onKeyDown`. By then `editing` is already null, because `set` updates `keysRef` synchronously (`Grid.tsx:182-193`).
  - On a draft row, that branch calls `store.discard()` and throws away the whole new row.
  - Today `RelationPicker.tsx:93-103` stops the event.
- **Fix:** "calls `onCancel` and stops propagation". Add the test "Escape in the to-one picker of a draft row keeps the draft row".

**S2. Task 3 says nothing about Tab, or about Enter right after typing.**
- **Tab:** `useComboBox.mjs:141-161` commits and then continues Tab to the table.
  - `keys.ts` then runs `commit(cell, editing.draft, 'right')`.
  - In enter mode the draft is the opening letter (`Relation.tsx:32`), so Tab would write the letter as the relation value.
  - Today Tab calls `onClose` and is stopped (`RelationPicker.tsx:95-96`).
- **Enter:** RAC hands the ListBox `autoFocus: state.focusStrategy || true` (`useComboBox.mjs:397`). With `true`, no item is focused until ↓ (`useSelectableCollection.mjs:377-392`).
  - Today `rows[0]` is active, so Enter after typing picks the first match.
  - Under RAC, Enter right after a search picks nothing. That is a behaviour change under R7, and "Enter picks the active record and writes once" depends on it.
- **Fix:** Step 3 should say the Input keeps today's Tab handling (`onClose`, stopped). It should also say how the first record becomes active after a search, or record a `Ruling:`. Add a Grid-seam test "Tab in the to-one picker writes nothing".

**S3. Task 1 Step 3 still has the old Enter rule.**
- Step 3 (line 111) says "While a segment is empty, Enter is stopped".
- Interfaces (line 78) says "only while some segments, not all, are empty".
- The e2e flows at `step-0e.spec.ts:279-290, 371-393` clear every segment and expect `{ start_at: null }`, so Step 3 as written breaks them. The previous S1 is only half fixed.
- **Fix:** Step 3 says "while some segments, not all, are empty".

**S4. "The calendar starts on Monday: first column header is `ma`" fails as built.**
- `useCalendarGrid.mjs:93` formats weekdays with `props.weekdayStyle || 'narrow'`, and RAC passes `weekdayStyle` through (`Calendar.mjs:201`).
- In nl, narrow is `M` and short is `ma` (checked with Intl).
- **Fix:** Step 3 sets `weekdayStyle="short"` on the `CalendarGrid`.

## Note

- **N1. Task 2 opens on `startAt`.** `autoFocus` focuses the first selected key (`useSelectableCollection.mjs:383-388`), and RAC 1.22 ListBox has no focused-key prop. When the letter's option differs from the current one, Step 3 has to name how focus gets there, for example focusing that option's element in an effect. Otherwise "the listbox opens on the option the opening letter picks" fails.
- **N2. Leaving a select writes the stored value, not the highlighted option.** Today `SelectEditor` drafts on every highlight move (`Select.tsx:42-44`), so leaving commits the highlighted option. The ListBox in Step 3 drafts nothing on focus moves, so leaving writes the stored value. This is a small R7 change; draft on focus change, or record a ruling.
- **N3. A standalone `Pop` needs a `triggerRef` and `isOpen`.** Tasks 2, 4 (Question) and 6 (long text) use one. `EditorProps` carries no cell ref (`props.ts`), so each editor needs its own anchor element. Task 2 says "triggerRef the cell"; Tasks 4 and 6 do not say.
- **N4. Task 1 Files says "the five specs' own `typeInto`".** Five specs do define `typeInto` (0b, 0c, 0d, 0e, 1), but 0c and 0d type no dates (`step-0c:73,81`, `step-0d:250`). Only the three listed need `fillDate`. The wording should say three.

## Premises checked

**Escape and the overlays**
- `Pop` `isKeyboardDismissDisabled` lets Escape propagate → `overlays/useOverlay.mjs:60-68` + `interactions/createKeyboardShortcutHandler.mjs` (false → continuePropagation) → holds
- `isKeyboardDismissDisabled` is a RAC Popover prop → `usePopover.d.ts:39`, RAC `Popover.d.ts:7` → holds
- A Popover inside a DatePicker honours it → `DatePicker.mjs:141-146` (context sets no dismiss prop), `Popover.mjs:43` useContextProps, `usePopover.mjs:28-35` → holds
- Escape from a calendar day reaches the sheet → `useCalendarGrid.mjs:39-43` returns false → holds
- Escape from a select ListBox reaches the sheet → `useSelectableCollection.mjs:186-191, 254` → does not hold (B1)
- ComboBox swallows Escape while the search holds text → `useComboBox.mjs:165-171` → holds (the plan handles it; S1 on stopping)

**Capture handlers and clicks**
- `onKeyDownCapture` on a RAC ListBox or ComboBox reaches the DOM → `ListBox.mjs:229-233`, `ComboBox.mjs:180`, `filterDOMProps.mjs` globalEvents → does not hold (B2)
- usePress consumes Enter on an option (the reason for the capture) → holds per the second review; a capture on a plain wrapper element sees it first
- A click on an option fires `onAction` with single selection → `useSelectableItem.mjs:114-118, 178` → does not hold when a key is selected (B3)
- Popover passes `onClick`, `onDoubleClick` and `data-editor` to the DOM → `filterDOMProps` globalEvents and `data-*` → holds

**Date and calendar behaviour**
- Enter in a date segment propagates → `useDateSegment.mjs:125-136` → holds
- The calendar shows `ma` as its first header → `useCalendarGrid.mjs:93` (narrow default gives `M`) → does not hold without `weekdayStyle="short"` (S4)

**ComboBox Enter and Tab**
- ComboBox Enter stops propagation (no double write) → `useComboBox.mjs:114-138` → holds
- ComboBox Tab stays in the picker → `useComboBox.mjs:141-161` continues propagation → does not hold (S2)
- Enter picks the first record after a search → `useComboBox.mjs:397` (`autoFocus: true`) → does not hold (S2)

**Grid and editor wiring**
- A second Escape after cancel is harmless → `Grid.tsx:182-193, 266-270` (draft row discarded) → does not hold unless the capture stops it (S1)
- `cancel` dispatches Escape → `Grid.tsx:248` → holds
- `onLeave` commits the draft → `Grid.tsx:234-244` → holds
- `Links.tsx:62-70` (Question owns keys) and `:106-108` (click stop) → holds
- `EditorProps` unchanged, with `onCommit`, `onLeave`, `onCancel` and `onClose` → `cells/props.ts` → holds
- `App.tsx:152` `notify`, `:466` the Grid → holds (S5 resolved)

**Tests, setup and fixtures**
- `Grid.test.tsx:303, 353, 377` named in Task 1 → holds (S3 resolved)
- `Grid.test.tsx:286` select by letter and Enter; `:649-725` Zeker? → holds
- e2e step-0e 270-290 and 371-393 rewritten → holds (S1's 385-389 covered)
- `locale()` at `i18n.ts:259-266` falls back to `'en'` under jsdom; `Providers` + `renderNl` give the seam → holds (S6 resolved)
- `main.tsx` exports nothing, so `Providers` is extracted → holds
- `test-setup.ts` exists as the vitest setupFile → `vite.config` `setupFiles` → holds

**Packages, exports and docs**
- RAC 1.22.0 pins `react-aria` 3.53.0; the plan now pins it exactly → holds (N1 resolved)
- `UNSAFE_PortalProvider` exported from `react-aria` → `dist/exports/PortalProvider` → holds
- Switch `excludeFromTabOrder` → `AriaToggleProps` extends `FocusableDOMProps` → holds
- `docs/SPEC.md` names React Aria → `SPEC.md:37` → holds (no task needed)
- The field-contract date row and component budget are already updated → `field-contract.md:38, 46-50` → holds

## The cut
One plan for one spec, one feature. The first review's judgement stands.

## Files
- /home/ntdst/Sites/worktable/specs/react-aria/plan.md
- /home/ntdst/Sites/worktable/specs/react-aria/plan-review.md
- /home/ntdst/Sites/worktable/apps/grid/src/grid/Grid.tsx
- /home/ntdst/Sites/worktable/apps/grid/src/grid/keys.ts
- /home/ntdst/Sites/worktable/apps/grid/src/grid/cells/Select.tsx
- /home/ntdst/Sites/worktable/apps/grid/src/grid/cells/RelationPicker.tsx
- /home/ntdst/Sites/worktable/apps/grid/src/grid/cells/Relation.tsx

React Aria sources are under /tmp/claude-1000/-home-ntdst-Sites-worktable/06225491-7288-42da-ac3a-20327873f390/scratchpad/pkgs/:
- react-aria-3.53.0/package/dist/private/selection/useSelectableCollection.mjs
- react-aria-3.53.0/package/dist/private/selection/useSelectableItem.mjs
- react-aria-3.53.0/package/dist/private/utils/filterDOMProps.mjs
- react-aria-3.53.0/package/dist/private/combobox/useComboBox.mjs
- react-aria-3.53.0/package/dist/private/calendar/useCalendarGrid.mjs
- react-aria-components-1.22.0/package/dist/private/ListBox.mjs
- react-aria-components-1.22.0/package/dist/private/DatePicker.mjs

Earlier reviews are in git: the first at `git show 8231620:specs/react-aria/plan-review.md`, the second at `git show f1bb05f:specs/react-aria/plan-review.md`.
