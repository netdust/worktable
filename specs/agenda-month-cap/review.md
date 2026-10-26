# Feature review: agenda-month-cap

Reviewed: 79fed68..483aa56 (worktable, no plan: a bounded change from Stefan's words of 2026-10-26: "a agenda can only
show x items per day ... in month view every day is a cell with same size as all the others" and "the counters are
floating, show them on the right and hide on hover").
Reviewer (2026-10-26, opus): code reviewer (superpowers requesting-code-review). No threat model, no invariants doc.

## Blocking
None.

## Should fix (fixed)
1. The legend was left out of the measurement, so a laned month still overflowed. Fixed: the room is measured below the
   table's own top (the body is the table's offset parent), and the rows are re-measured when the lanes change. The
   forced `height: 100%` on the table is gone. RED: the laned e2e put the table's bottom 33px below the body's.
2. Cells could grow past their row height. Fixed: each day's content sits in a block clipped to the row's height, and
   DATE_PX is 32 (padding, border and the today pill included). The e2e asserts "+N meer" lies wholly inside its day.
3. "+N meer" could wrap at a narrow width. Fixed: nowrap with an ellipsis.

## Note
4. The span (bars) month is untouched. The agenda has no spans; capping bars is a separate design, listed for Stefan.
5. The dialog label is thin. Fixed: the day dialog is named and headed by the full date ("maandag 26 oktober").
6. The measurement lifecycle checks out.
7. The rail CSS is correct; without `:has` it falls back to the old look.
8. Test strength: the e2e is the proof, now also with a lane.
9. Simplicity: the `line` render prop stays; it keeps Day free of Event's props.

Findings: 0 Blocking · 3 Should fix · 6 Note
