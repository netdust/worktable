# Review: period-today (F4)

Reviews of 2026-10-11: superpowers whole-branch review (opus). Fix pass on feature/period-today.

## F4 — feature/period-today (verdict: with fixes)
1. (Important) Choosing "is vandaag" renders an empty value picker: `apps/grid/src/ui/FilterBuilder.tsx:106` `valued` lists only empty, filled, week, next_week, month. Fix: derive it from the one list in `conditions.ts` (`NO_VALUE` or equivalent) so the two cannot drift. Test: a FilterBuilder row with `today` has no value control.
2. (Important) `docs/SPEC.md:55` (SavedView row, filter language) still lists `$period` as week, next_week, month only. Add today (the one day, server-local).
3. (Minor, do it) `apps/grid/src/ui/Window.tsx:77-86` prints "31 dec – 31 dec" for a one-day window: print one day once. Test it.
Ruling kept: a new date condition still starts at "deze week" (reviewer agreed).

## Fixed
1. bdfd183 — `valued` exported from `apps/grid/src/grid/conditions.ts` (from `NO_VALUE`), the builder uses it; test: FilterBuilder.test.tsx 'asks no value of a period, today included'.
2. e4348e8 — docs/SPEC.md SavedView row lists `today` (the one day, server-local).
3. dc45e3a — `formatWindow` prints a one-day window once; test: Window.test.tsx 'prints a one-day window as that day once'.
