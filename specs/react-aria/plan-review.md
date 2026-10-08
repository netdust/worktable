# Plan review: react-aria (fourth review)
Reviewed-plan: 4e9ef7b8ac2fa778ff28959b28d3bea4b565a5f7 specs/react-aria/plan.md
Verdict: ready with fixes

## Summary

I checked the revision against react-aria 3.53.0, react-aria-components 1.22.0 and react-stately 3.51.0. I unpacked react-stately into the scratchpad to check the focus-ordering question.

The fixes for B1 to B3 hold:
- **Escape (B1):** a ListBox with `selectionMode="none"` lets Escape through to the sheet.
- **Click (B3):** a click on an option fires `onAction`.
- **Typeahead and arrows** still work with no selection mode.
- **Programmatic focus moves RAC's focused key.** An effect that focuses an option element sets the focused key, and the ListBox's own focus handler does not override it.
- **The wrapper sees option focus.** `onFocusCapture` on a plain wrapper div fires when an option takes focus.
- **Capture handlers (B2):** they now sit on plain elements, as the general rule says.

The fixes for S1 to S4 and N1 to N4 are in the plan.

The revision broke one thing: Task 2's tests still expect `aria-selected`, which `selectionMode="none"` no longer renders (S1). Separately, the ListBox lets ↑ and ↓ through at the edge of the list, which writes the cell (S2).

## Blocking

None.

## Should fix

**S1. Task 2's tests still assert `aria-selected`, and `selectionMode="none"` removes it.**
- **Plan:**
  - Task 2 Step 1: "the current option is marked" (`aria-selected`).
  - Task 2 Step 1: the existing "picks a select from its listbox by letter and Enter" "passes against the new markup".
  - Task 2 Step 3 says the current option carries `data-current` and that the test asserts it.
- **Source:**
  - `react-aria/dist/private/listbox/useOption.mjs:39`: `'aria-selected': state.selectionManager.selectionMode !== 'none' ? isSelected : undefined`. With no selection mode, no option has `aria-selected`.
  - `apps/grid/src/grid/Grid.test.tsx:294`: `within(listbox).getByRole('option', { selected: true })`. This throws when no option is selected.
  - `Grid.test.tsx:296` fires Enter on the `listbox` element itself, not on the focused option.
- **Effect:** Step 1 contradicts Step 3. The existing test cannot pass unchanged.
- **Fix:**
  - In Step 1, change "(`aria-selected`)" to "(`data-current`)".
  - Name the rewrite of `Grid.test.tsx:294-296`: the opening letter's option is `document.activeElement` (text `Voorstelling`), and Enter is fired on that element.

**S2. ↑ at the first option, or ↓ at the last, now writes the cell and moves.**
- **Plan:** Task 2 Step 3 lets the ListBox handle arrows. The wrapper's capture takes only Enter and Tab.
- **Source:**
  - `react-aria/dist/private/selection/useSelectableCollection.mjs:85-106`: when there is no next key and `shouldFocusWrap` is off, `arrowDown` and `arrowUp` return `false`, so the key propagates.
  - `apps/grid/src/grid/keys.ts:97-100`: when the editor was opened by a letter (`mode === 'enter'`), an arrow writes `editing.draft` and moves the cell.
  - Today `Select.tsx:47-48, 57-58` clamps ↑ and ↓ and stops them.
- **Effect:** a select opened by a letter, with ↑ pressed on "leeg" or ↓ on the last option, writes the cell and moves away. That is an R7 change, and no test covers it.
- **Fix:** the wrapper also stops ↑ and ↓ that bubble back out of the ListBox (a bubble-phase `onKeyDown` on the same div is enough). Add the Grid-seam test "↑ on the first option keeps the select open and writes nothing".

## Note

**N1. A calendar day click may drop focus to the body.**
- `Pop` holds the `Calendar` with no `Dialog`. RAC `Popover.mjs` has no FocusScope or restoreFocus, and a non-modal popover is not a dialog (`Popover.mjs:123-137`).
- When a day click closes the date popover, the focused calendar cell unmounts and focus falls to the body. Then either `onLeave` commits or later keys miss the table.
- Task 1's own test "a calendar day click commits the date once … the edit stays open" will show this. Likely fixes: put a RAC `Dialog` inside `Pop` (its FocusScope returns focus to the calendar button), or refocus a segment from the calendar's change handler.

**N2. Task 2's focus effect may run before the options exist.**
- The opening effect needs the option elements to be in the DOM. RAC builds its collection in a separate render pass, so on the first effect the element may not exist yet.
- "the listbox opens on the option the opening letter picks" will catch it. A retry once the element appears (for example a ref callback on the `startAt` item) is the likely shape.

**N3. Task 3's wrapper handles only three keys.**
- **Delete and Backspace:** the wrapper's capture lists Escape, Tab and Enter, but Step 1 tests "Delete in an empty search clears", and Task 4 tests "Backspace … removes the last chip". Today `RelationPicker.tsx:98-99` does this with `onClear` and stops the key. Under RAC, nothing stops it, and in the table it is just ignored (`keys.ts` editingKey), so `onClear` never runs. The same wrapper should take it.
- **Enter with no focused option:**
  - It should keep today's guard against picking from a stale list while the search is loading (`RelationPicker.tsx:92-93`).
  - It should act only when the target is the `Input`. In Task 4 the chips sit inside the wrapper, so Enter on a chip's remove button would otherwise pick the first record.
  - With virtual focus, "no focused option" means the input has no `aria-activedescendant`.

**N4. Tab needs `preventDefault`, not only stopping.**
- Task 2 Step 3 says the wrapper turns Tab into a commit "and stops" it. Today's handler also calls `preventDefault` (`Select.tsx:57`). Without it the browser moves focus too, which can land outside the grid and trigger a leave.

## Premises checked

**Select ListBox with `selectionMode="none"`**
- A click fires `onAction` → `useSelectableItem.mjs:114-118` (no selection, so a primary action), `:185-186`; `useOption.mjs:57, 68` → holds
- Enter fires `onAction` → `useSelectableItem.mjs:185, 307-309` → holds (the plan stops Enter in the capture first anyway)
- Escape propagates → `useSelectableCollection.mjs:186-192` (selected keys empty, so `false`, so the key continues) → holds
- Typeahead still works → `useTypeSelect.mjs:49-62`, merged at `useSelectableCollection.mjs:450-455`, not tied to the selection mode → holds
- Arrows move focus → `useSelectableCollection.mjs:85-106` and the item's focus effect at `useSelectableItem.mjs:68-75` → holds, but the key propagates at the list's edges (S2)
- Focusing an option element in code moves the focused key → `useSelectableItem.mjs:92-93` item `onFocus`; react-stately `useMultipleSelectionState.mjs:27-31, 70-77` updates the key synchronously, so the collection's `onFocus` (`useSelectableCollection.mjs:293`) does not override it → holds
- `onFocusCapture` on a plain wrapper sees option focus → the wrapper is the option's parent in both the DOM and the React tree → holds
- `aria-selected` still marks an option → `useOption.mjs:39` → does not hold (S1)
- `data-current` reaches the option element → `useOption.mjs:77` filterDOMProps keeps `data-*` → holds
- Space does not commit → `isActionKey` is Enter only (`useSelectableItem.mjs:307`) → holds
- A non-modal `Pop` does not steal focus on mount → `Popover.mjs:123-137` (not a dialog, so no autofocus) → holds

**Capture handlers on plain elements**
- Key events are dropped from RAC components → `filterDOMProps.mjs:38-77` (globalEvents has no key events) → holds; the plan's rule is correct
- `DatePicker` and `TimeField` take `onKeyDown` for the Enter stop → `useDatePicker.mjs:103-105` (on the group) and `useDateField.mjs:148` → holds either way
- Task 3 wrapper around the field sees the input's keys before `useComboBox` → the input sits inside the plain div → holds
- The removal question is outside the picker's wrapper → `Links.tsx:110-139` (Question replaces the picker) → holds

**Revised Task 1 points**
- Step 3's Enter rule now matches Interfaces ("some segments, not all") → plan line 113 → holds
- `weekdayStyle="short"` gives `ma` → `useCalendarGrid.mjs:93` → holds
- Three e2e specs call `fillDate` → plan line 64 → holds
- A day click keeps the edit open → RAC Popover has no focus restore without a `Dialog` → unverified at runtime (N1)

**Sheet wiring**
- `keys.ts:91-100`: Escape cancels; an arrow in enter mode writes → holds (S2)
- `Grid.tsx:66-68` `fromCell` via `[data-editor]` on `Pop` → holds
- `Grid.tsx:263-270`: a second Escape on a draft row discards it; Task 3 now stops the first → holds
- `EditorProps` has `onCommit`, `onDraft`, `onLeave`, `onCancel` and `onClose` → `cells/props.ts:11-24` → holds

## The cut

One plan for one spec, one feature. The judgement of earlier reviews stands.

## Files

The plan and the files the findings cite:
- /home/ntdst/Sites/worktable/specs/react-aria/plan.md
- /home/ntdst/Sites/worktable/apps/grid/src/grid/Grid.test.tsx (:286-300)
- /home/ntdst/Sites/worktable/apps/grid/src/grid/keys.ts (:91-100)
- /home/ntdst/Sites/worktable/apps/grid/src/grid/cells/Select.tsx
- /home/ntdst/Sites/worktable/apps/grid/src/grid/cells/RelationPicker.tsx

React Aria and react-stately sources, under `/tmp/claude-1000/-home-ntdst-Sites-worktable/06225491-7288-42da-ac3a-20327873f390/scratchpad/pkgs/`:
- react-aria-3.53.0/package/dist/private/selection/useSelectableItem.mjs
- react-aria-3.53.0/package/dist/private/selection/useSelectableCollection.mjs
- react-aria-3.53.0/package/dist/private/selection/useTypeSelect.mjs
- react-aria-3.53.0/package/dist/private/listbox/useOption.mjs
- react-aria-components-1.22.0/package/dist/private/Popover.mjs
- stately/x/package/dist/private/selection/useMultipleSelectionState.mjs (react-stately 3.51.0)

Earlier reviews are in git: the first at `git show 8231620:specs/react-aria/plan-review.md`, the second at `git show f1bb05f:…`, the third at `git show 04266ab:…`.
