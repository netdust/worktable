# Step 0: carry-over from 0a

Decided by Stefan on 2026-10-05, after he accepted the step 0a report.

## Decision
- Relation chip options come from the relation target's rows, not from the loaded page. 0a builds them from the loaded rows (`apps/grid/src/grid/filter.ts:20-46`, called at `ui/App.tsx:141-143`), so a server-side filter narrows the menu. See ledger row N1 in `specs/step-0a/wp-assumptions.md`.

## 0b, first task
- Validate declarations at startup: `title`, `date`, the index columns and relation targets must exist, and startup is refused, naming the declaration, when they don't.
- Validate the window as a real date: `from` and `to` must be calendar dates (`2026-13-45` is refused), not just the `YYYY-MM-DD` shape.

## Step 0 parity checklist (additions)
- [ ] Datetime display: `start_at` and `eind_at` show as a planner reads them, not as raw ISO (`2026-10-14T00:30`).
- [ ] Non-`$eq` saved-view filters: a SavedView whose `filters` hold `$in`, `$gt` or `custom.<key>` opens showing only the rows those filters allow. 0a's `chipsOf` keeps only `$eq` scalars and drops the rest without any sign.
- [ ] Relation chip options come from the relation target's rows (see Decision).

## Step 0 parity checklist (additions after the real import, Stefan 2026-10-06)
Found by comparing the grid on the imported Laika data with the old tool.
- [ ] The confirmed-assignment count: each activity shows how many of its assignments are `bevestigd`, as the old tool does ("confirmed assignments are the covers"). The matrix declares `count: bevestigd`, but the table views do not show it.
- [ ] Dutch chrome and dates: every grid label is Dutch (today: Previous, Next, Week, Group by, Sorted by, Columns, Filter, Search, Saved, New, Total, rows), and dates read as Dutch (`do 08/10 05:00`, `vrijdag 9 oktober`), not English (`Thu 08/10`, `Friday, October 9`).
- [ ] Per-production views: one view per production, as the old tool offers, showing that production's activities and assignments.
