# Shake-out: period-today (F4, `$period: 'today'`)

Driven 2026-10-11 on `feature/period-today` at f215e9d (the reviewed and fixed code), in the worktree `worktable-f4`,
through the repo's own Playwright harness (`playwright.config.ts`). The harness starts a fresh invented theatre
engine at 127.0.0.1:4311 with its grid at 127.0.0.1:5174 (and the fiche pair at 4312/5175), and signs in its
invented editor `planner@e2e.test` through the magic-link form. Every flow ran in a real Chromium at 1600×900.
Each flow makes its own rows on the API (activities of Nachtwacht dated yesterday, today and tomorrow in the
local date, which is the server's: the harness runs the engine on the same machine) and its own personal view
("Alleen ik"), and deletes them again whatever happens. Screenshots are the viewport, written by `e2e/shots.ts`.

Sweep:
- Full Playwright run with the new specs: 187/188. The one failure was `react-aria.spec.ts` › `edit-datetime-cell`,
  which hit the 30 s timeout waiting for the Start column under load. Re-run right after the period-today flows it
  passed (9.3 s), and the whole `react-aria.spec.ts` passed alone (16/16). It does not touch this feature's files.
- Every registered test passed in at least one run, so every CHECKS row's `verified` is bumped to f215e9d.

No plan exists for F4 (the findings section and its review are the spec). The flows are the three the caller named,
one per user-facing requirement of F4 and its review:
1. the builder offers "is vandaag", asks no value, the chip reads "… vandaag", only today's rows remain
2. a view saved with it keeps it after a reload; the empty state of a one-day period prints the day once
3. a new date condition still starts at "deze week"

The flows are in `e2e/period-today.spec.ts` (`@e2e`); the read-only checks in `e2e/smoke/period-today.spec.ts`
(`@smoke`).

| # | Flow | Layer | Verdict | Evidence |
|---|---|---|---|---|
| 1 | filter-is-vandaag: the test makes "gisteren e2e periode", "vandaag e2e periode" and "morgen e2e periode" (datum yesterday, today, tomorrow; no time, so plandag = datum). Rail › Activiteiten › Weergave toevoegen › Grid, "Eigen e2e vandaag", Alleen ik → POST /api/views 201. Filter › Voorwaarde toevoegen › Veld Plandag › Vergelijking "is vandaag": the button reads "Vergelijking: is vandaag", the value cell `.nv-fb__value` is empty, and the row holds no searchbox, textbox or spinbutton. Escape: the chip reads "Plandag vandaag", the grid shows only "vandaag e2e periode" (1 rij, plandag 11-10-2026). Boundary: yesterday's and tomorrow's rows are absent. On the wire, `filter={"plandag":{"$period":"today"}}` returns only rows whose plandag is today, as many as the grid shows; `$period: 'yesterday'` → 400. | browser | pass | Browser: http://127.0.0.1:5174/#view=15 · shakeout/only-today.png (only today's row, chip "Plandag vandaag"); the builder with no value box: shakeout/builder-is-vandaag.png. Test: `e2e/period-today.spec.ts` › `filter-is-vandaag @e2e` |
| 2 | vandaag-kept-after-reload: the test makes "vandaag e2e bewaard" (today) and a personal view "Eigen e2e vandaag bewaard", and chooses Plandag "is vandaag" in the builder. The server's view holds `filters: {"plandag":{"$period":"today"}}`: the period, not the day. Re-entry: after a reload and reopening the view, the chip still reads "Plandag vandaag", the row is there, and the builder still reads "Vergelijking: is vandaag". Empty: a second condition, Omschrijving bevat "e2e niemand schreef dit", leaves no row. The empty state reads "Geen rijen voor deze zoekterm of filters" and its window "11 okt": the day once, not "11 okt – 11 okt". | browser | pass | Browser: http://127.0.0.1:5174/#view=15 · shakeout/one-day-empty.png (the empty state with "11 okt"). Test: `e2e/period-today.spec.ts` › `vandaag-kept-after-reload @e2e` |
| 3 | new-date-condition-starts-at-deze-week: on a new personal view "Eigen e2e nieuwe datum", Filter › Voorwaarde toevoegen › Veld Datum: the condition starts at "Vergelijking: is deze week". The list offers is vandaag, is deze week (ticked), is volgende week, is deze maand, ligt tussen, in that order. The chip reads "Datum deze week". | browser | pass | Browser: http://127.0.0.1:5174/#view=17 · shakeout/new-date-deze-week.png (the operator list, "is deze week" ticked). Test: `e2e/period-today.spec.ts` › `new-date-condition-starts-at-deze-week @e2e` |

Edges not driven, with the reason:
- Denied actor: `$period` adds no access path. An owner reads no activiteit at all (404 `unknown_source`, covered by
  `owner-has-no-dagplanning` in the same sweep), and a sessionless read of a today filter is 401 (smoke).
- Concurrent, mid-flow failure: a period is a read condition with no write of its own. Saving the view is the
  view route's, unchanged here.
- The day changing at midnight while a view is open: not driven; the engine resolves `today` on each read
  (engine `filter.test.ts`).

Bite check: which test goes red when a dangerous path breaks.
- The engine's `today` resolution (`filter.ts` `periodDays`): row 1 (the wire read and the grid both drop
  yesterday's and tomorrow's rows).
- `today` missing from the engine's `PERIODS`: row 2 (POST/PATCH of the view with the period is refused, so the
  saved filter poll fails) and row 1 (the read is 400).
- The builder asking a value of `today` (`valued` in `conditions.ts`, review finding 1): row 1 (empty value cell).
- `formatWindow` printing a one-day window twice (review finding 3): row 2 ("11 okt", exact text).
- A new date condition starting at today instead of this week (`START` in `FilterBuilder.tsx`): row 3.

Observations while driving, outside the three flows (not defects of this diff):
- The window the grid prints comes from the browser's date (`App.tsx` `windowOf(dateCondition, new Date())`). The
  rows come from the server's local date. On a server in another time zone than the planner, the hint and the rows
  disagree for the hours between the two midnights. This is the same for `week` and `month` today. The harness cannot
  show it, because the engine and the browser share one machine.
- A date condition on a field that is not the dataset's date (Datum on Activiteiten, whose date is Plandag) gives an
  empty state with no window ("Geen rijen voor deze zoekterm of filters" and no day). That predates F4 and is
  visible in shakeout/new-date-deze-week.png.
