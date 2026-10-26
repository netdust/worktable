# Feature review: drawer-tabs

Reviewed: f01e987..4bf0f0f on feature/drawer-tabs (worktable, base main f01e987). Plan specs/drawer-tabs/plan.md, plus
Stefan's rulings of 2026-10-26: one head row, no "N van M", 2 icons at 392px.
Reviewer (2026-10-26, opus): code reviewer (superpowers requesting-code-review). There is no threat model and no
ARCHITECTURE-INVARIANTS.md, so neither the sentinel nor the auditor ran. Rulings by the reviewer session (ntdst-d7)
are marked **Ruling**.

## Blocking
None.

## Should fix

S1. **Returning to a record restores its old tab instead of Gegevens.** `apps/grid/src/grid/Drawer.tsx:183-185`
- Cause: `chosen` is never reset on a record change; `pane` falls back to Gegevens only while
  `chosen.opened !== opened`.
- Scenario: record 1, open Geschiedenis → j → record 2 opens on Gegevens → k → record 1 opens on Geschiedenis.
  This breaks "Opening another record returns to Gegevens".
- The same bug hits the dashboard drawer and the matrix cell drawer. In the matrix, focus then falls through to
  Sluiten because the status radios live only in Gegevens.
- Fix: reset during render when the record changes (`if (chosen.opened !== opened) setChosen({opened, key:'fields'})`),
  then `pane = panes.some(p => p.key === chosen.key) ? chosen.key : 'fields'`.
- RED: an A→B→A test in Drawer.test.tsx.

S2. **The icon-count loop can oscillate, and the first drop on a 3-pane drawer buys nothing.**
`apps/grid/src/grid/drawer/Tabs.tsx:51-76`
- The hysteresis band is 30px (ICON). Dropping the last icon removes the whole group, about 32px, which is wider
  than the band. With the title at 94–95px the room flips 1↔0 on every ResizeObserver callback.
- From 3 to 2 icons, the hidden icon's 29px is eaten by the `…` button that appears (26px).
- **Ruling:** compute the icon count in one pass from the measured slack (the head width minus the fixed buttons
  minus TITLE_ROOM), counting the `…` button's 26px whenever any pane is left over. Do not step one icon per
  callback. The result must be stable: the same input width gives the same count.
- RED: a unit test on the pure count function, covering the boundary widths, the 3-pane case, the last-icon case
  and stability.
- This also removes Note 6, the mount flicker.

## Note
1. Escape needs two presses when a tab icon is focused, and a hovered icon swallows Escape everywhere. This comes
   from react-aria's tooltip capture listener (`useTooltipTrigger.mjs:36-47`). Accepted for now and listed for
   Stefan.
2. A pending choose-other request is never cleared (`Drawer.tsx:191-204`). It is unreachable today.
   **Ruling:** cheap guard: store `opened` with it and drop it on mismatch. Fix it in this pass.
3. Dead or stale text: the i18n `position` string (`i18n.ts:343`), the `Drawer.tsx:65` `nav` doc, and the
   `SidePanel.tsx:15` `head` doc. **Ruling:** remove or update them in this pass.
4. Domain words in grid comments: `i18n.ts:495` "Taken (3) en Klanten (1)" and `types.ts:106` "Nieuwe taak".
   **Ruling:** replace them with invented words in this pass.
5. The keyboard test checks `tabIndex`, not that Tab lands in the bar. Optional; stays.
6. Icons flicker on mount. Covered by S2.
7. The vocabulary flags open no hole.
8. The test changes follow the plan and Stefan's rulings.
9. The `Matrix.tsx:359` focus change is correct and needed.

Findings: 0 Blocking · 2 Should fix · 9 Note
