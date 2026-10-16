## Audit of slice E1: worktable e2e step 0a–2b gates, early feature specs, helpers and all smoke specs

Root: /home/ntdst/Sites/worktable-prune (snapshot 9320fba). All `file:line` evidence below is relative to that root. I ran no tests and no builds; everything here comes from reading files and grep.

## Totals
- **Tests examined: 161.** That is 114 in the 15 non-smoke specs and 47 in the 15 smoke specs, plus the 9 helper files.
- **Dispositions:**
  - DELETE: 8
  - DELETE-CONFLICT: 84 (45 flows, 39 smoke)
  - REWRITE: 20 tests in 9 groups, plus one helper rewrite (R10)
  - KEEP rows: 10
  - Read and found fine, no row: 39
- **Lines that would go: about 1,800 of the slice's 6,397.**
  - DELETE: about 140.
  - DELETE-CONFLICT: about 1,660, including helpers that go dead.
  - The REWRITEs remove roughly 150 more.
- **Estimated gate time saved: about 6 minutes.**
  - DELETE: about 1 min. DELETE-CONFLICT: about 4 min. REWRITE: about 1 min.
  - Calibration from the specs folder: 151 e2e tests took 17.6 min (`specs/step-2/ledger.md:191`); 212 took 28.8 min (`specs/step-3/shakeout.md:16`). That is 7–9 s per browser test. A smoke test costs 0.2–1 s.
  - Not measured, but probably larger: R10, the `openWeek` helper, could save 2–4 min across the whole suite. Removing `VITE_RECORDS_PAGE_SIZE=2` probably saves tens of seconds.
- **Smoke specs run inside the gate.** `playwright.config.ts:4` sets `testDir: 'e2e'`, with no `testIgnore` or `grep`. `package.json:14` runs `playwright test` and `package.json:16` (`gate`) calls it. There is no second Playwright config in `e2e/`. So all 47 smoke tests run on the same fresh instance as the @e2e flows. `specs/CHECKS.md:3-5` says this repo has no other instance to smoke.

## Scanned
- Read fully: all 15 non-smoke specs, all 15 smoke specs and all 9 helpers.
- Read for comparison: the tests in react-aria, toolbar, grid-ux, ui-fit, step-3, step-3c and step-3e that my claims rest on.
- Read from the grid code: `apps/grid/src/ui/App.tsx:80-135` and `api.ts:200-266`.
- Grep only: the unit and integration suites (`packages/*/test`, `apps/grid/src/**/*.test.*`). I opened just the tests I cite.

## Dispositions

| path::method | disposition | reason (one line) |
|---|---|---|
| /home/ntdst/Sites/worktable-prune/e2e/step-0a.spec.ts::planning-grouped-sorted | DELETE-CONFLICT | Covered by `group.test.ts:22` and `columns.test.ts:208` (same 'wo 14/10 00:30'). The 00:30 day-line rule is `writer.test.ts:87`, and is shown live in `action-inputs.spec.ts:181-183`. ~5 s |
| …/step-0a.spec.ts::planning-status-filter | DELETE-CONFLICT | Chip removal and narrowing: `toolbar.spec.ts:68-111`. Optie only: `step-0d.spec.ts:286-290`. The filter reaches /rows: `toolbar.spec.ts:399`. ~5 s |
| …/step-0a.spec.ts::query-view-loads | DELETE-CONFLICT | `step-0c.spec.ts:175-177` opens the same view and counts its rows. The 'Aanvang' header is only a read-back of the declaration. ~3 s |
| …/step-0b.spec.ts::status-persists | DELETE-CONFLICT | react-aria edit-select-cell (`react-aria.spec.ts:330-409`) covers it: one PATCH, the cell text, the stored value. ~6 s |
| …/step-0b.spec.ts::query-edit-lands | DELETE-CONFLICT | Planning is now a dataset view (`packages/theatre/src/seed.ts:253-262`), so this is status-persists again. Query write-back is covered by `store.test.ts:614`, `api.test.ts:39`, and the e2e werklijst-set (`step-3c.spec.ts:181`, via `queries.ts:230`). ~5 s |
| …/step-0b.spec.ts::revisions-recorded | DELETE-CONFLICT | `writes.test.ts:342` (one revision per changed field). `react-aria.spec.ts:368-369` shows only the edited column is sent. ~5 s |
| …/step-0b.spec.ts::relation-pick | DELETE-CONFLICT | `react-aria.spec.ts:411-490`: search, pick by Enter and by click, stored id. ~5 s |
| …/step-0b.spec.ts::clear-end | DELETE-CONFLICT | `react-aria.spec.ts:318-321` clears an optional datetime to null through the same cell editor. One assertion moves (below). ~5 s |
| …/step-0b.spec.ts::limit-refused | DELETE-CONFLICT | API only; same as `rows.test.ts:194-195`. Under 1 s |
| …/step-0b.spec.ts::json-charset-accepted | DELETE | Same as `write-guard.test.ts:71`; not named in the plan's test map. ~1 s |
| …/step-0b.spec.ts::refused-edit | KEEP | The one refusal through the segmented date/time editor (see below) |
| …/step-0b.spec.ts::day-line-move | KEEP | The only test where an edited row moves to a new day band live (see below) |
| …/step-0b.spec.ts::cross-site-refused | KEEP | Only a real browser sets `Sec-Fetch-Site` (see below) |
| …/step-0b.spec.ts::rebound-host-refused | KEEP | Pins Vite's `allowedHosts` (see below) |
| …/step-0c.spec.ts::referenced-delete-refused: productie | DELETE-CONFLICT | Same loop, flow and assertions as the organisatie case (`step-0c.spec.ts:96-99`). Delete line 98. ~5 s |
| …/step-0c.spec.ts::referenced-delete-refused: organisatie | KEEP | Becomes the single in-use refusal flow |
| …/step-0c.spec.ts::duplicate-assignment-refused | DELETE-CONFLICT | The rule is in `toewijzing.test.ts` and `parity.test.ts`. A refusal on the cell is shown at `step-0b:111`, `step-0c:83`, `step-1:417`, `step-2:691`. Same message through Mensen at `dagplanning.spec.ts:300`. ~4 s |
| …/step-0c.spec.ts::select-clear-null | DELETE-CONFLICT | `Grid.test.tsx:501` (Delete empties an optional field). On the wire: `react-aria.spec.ts:465-468`, `step-2b.spec.ts:283-289`. ~5 s |
| …/step-0c.spec.ts::select-clear-refused | DELETE-CONFLICT | `react-aria.spec.ts:1029-1048` and `:340-343,379-383`. Also has a fixed 400 ms wait. ~4 s |
| …/step-0d.spec.ts::matrix-away-mark | DELETE-CONFLICT | `Matrix.test.tsx:206-222` (the 'Afwezig: …' label). `step-3.spec.ts:268-293` covers the mark, its absence and its clearing. ~4 s |
| …/step-0d.spec.ts::view-delete-undo | DELETE-CONFLICT | `grid-ux.spec.ts:280-330`: same delete, same notice undo, same id, plus a reload. ~4 s |
| …/step-0d.spec.ts::datetime-shown | DELETE-CONFLICT | `columns.test.ts:208`, same value. Its second assertion (line 270) is implied by line 269. ~4 s |
| …/step-0d.spec.ts::new-without-title | DELETE-CONFLICT | `dagplanning.spec.ts:579-583` makes the same click with both assertions; also `newRow.test.ts:84`. ~4 s |
| …/step-0d.spec.ts::relation-beyond-page | DELETE-CONFLICT | `api.test.ts:210-225` (page size 2, offsets 0/2/4). It is the only reason `playwright.config.ts:29` sets the page size suite-wide. ~6 s |
| …/step-0d.spec.ts::foreign-view-hidden › never listed, never in the rail | DELETE-CONFLICT | `views.test.ts:298`; the rail shows only what /views lists. ~3 s |
| …/step-0d.spec.ts::matrix-cell-persists, matrix-two-activities-undo | REWRITE (R9) | Merge into one flow |
| …/step-0e.spec.ts::owner-sees-own | DELETE-CONFLICT | Theatre `access.test.ts:59-69` (`:64` for another person's row), `App.test.tsx:1036` (fallback landing), `grid-ux.test.ts:99` (owner sections). Two openWeek calls. ~10 s |
| …/step-0e.spec.ts::seeded-view-read-only | DELETE-CONFLICT | `views.test.ts:169`; `toolbar.spec.ts:17-51`; `step-0d.spec.ts:202-213`. One assertion moves (below). ~8 s |
| …/step-0e.spec.ts::public-view-by-token | DELETE-CONFLICT | API only; `public.test.ts`. Under 1 s, so deleting buys a lower count, not time |
| …/step-0e.spec.ts::untimed-activity | DELETE-CONFLICT | `writer.test.ts:121,164,193,209`; `newRow.test.ts:84`; `react-aria.spec.ts:278-288,318-321`. Its own comment says about fifty key presses, under a 60 s timeout. ~25 s |
| …/step-0e.spec.ts::undo-day-line-move | DELETE | `apply.test.ts:314-330` undoes the same 23:30 → 01:30 move. Marked `test.slow`; its comment says "past 30 s under a full run's load" (`:349`). ~30 s |
| …/step-0e.spec.ts::undo-person-to-name | DELETE | Server side: `apply.test.ts:332-338`. The edit: `step-0d.spec.ts:244`. The grid's re-read after ⌘Z: undo-time-on-untimed. ~6 s |
| …/step-0e.spec.ts::clear-start-segment-by-segment | DELETE | `react-aria.spec.ts:200-207,278-288` (partly cleared + Enter keeps the editor) and `:318-321` (fully cleared sends null). ~12 s |
| …/step-0e.spec.ts::undo-time-on-untimed-in-planning | DELETE | Written for a bug in the old Dagplanning query (`specs/step-0e-datum/review.md:40`). Planning is now a dataset view and undo is server-side, so it repeats undo-time-on-untimed. ~8 s |
| …/step-0e.spec.ts::undo-time-on-untimed | KEEP | ⌘Z restores a column the writer changed (see below) |
| …/step-1.spec.ts::apply-twice | DELETE-CONFLICT | `apply.test.ts:200`. An action's refusal under its drawer action: `action-inputs.spec.ts:308-311`. ~4 s |
| …/step-1.spec.ts::speelreeks-delete-in-use | DELETE-CONFLICT | Same flow as step-0c organisatie; also `step1.test.ts:211`, `i18n.test.ts:29`. ~5 s |
| …/step-1.spec.ts::speelreeks-end-before-start | DELETE-CONFLICT | Same message and row alert as step-0b refused-edit; also `step1.test.ts:94`. ~5 s |
| …/step-1.spec.ts::undo-changed-since | DELETE-CONFLICT | `step-1.spec.ts:527-545` shows the same 409 and the same message with its label; also `batches.test.ts:82`. Two browsers, 14.7 s alone (`specs/virtual-columns/shakeout.md:16`). ~15 s |
| …/step-1.spec.ts::sjablonen-read-only | DELETE-CONFLICT | `writes.test.ts:108`, `step1.test.ts:351`, `columns.test.ts:109`, `App.test.tsx:193`, `Toolbar.test.tsx:44`. ~3 s |
| …/step-1.spec.ts::planning-locatie-via-tourstop | DELETE-CONFLICT | `grid-ux.spec.ts:404-428`, `step-2b.spec.ts:185-188`, `lookups.test.ts:52`, `step1.test.ts:378-392`. ~5 s |
| …/step-1.spec.ts::speelreeks-boundaries | DELETE-CONFLICT | API only; `step1.test.ts:100-112,200`. One case moves (below). Under 1 s |
| …/step-1.spec.ts::owner-denied-speelreeks | DELETE-CONFLICT | `step1.test.ts:233-242`, `apply.test.ts:270`, `grid-ux.test.ts:99`. ~2 s |
| …/step-1.spec.ts::rollen-admin-rate | KEEP | The only number-cell commit (see below) |
| …/step-2.spec.ts::reused-or-expired-refused | DELETE-CONFLICT | `action-token.test.ts:248` (one identical 401 for garbage, used, expired, reassigned), `:339`, `Act.test.tsx:61`. ~8 s |
| …/step-2.spec.ts::cancelled-invite-offers-no-answer | DELETE-CONFLICT | `Act.test.tsx:100`, `action-token.test.ts:212,288`. ~5 s |
| …/step-2.spec.ts::rotated-link-refused | DELETE-CONFLICT | `record-link.test.ts:109,140,431`, `Drawer.test.tsx:540`, `LinkPage.test.tsx:70`. ~8 s |
| …/step-2.spec.ts::declined-or-invited-no-project | DELETE-CONFLICT | `person-pages.test.ts:72`, `LinkPage.test.tsx:58`. ~8 s |
| …/step-2.spec.ts::owner-view-key-script | DELETE-CONFLICT | `owner-views.test.ts:301`, `record-link.test.ts:269`, `person-pages.test.ts:191-204`. ~2 s |
| …/step-2.spec.ts::link-request-identical | DELETE-CONFLICT | `record-link.test.ts:397`. ~1.5 s |
| …/step-2.spec.ts::agent-token-write-undo-revoke | DELETE-CONFLICT | `service.test.ts:90,194,212,235`, `lifecycle.test.ts:269`. Spawns the CLI three times. ~5 s |
| …/step-2.spec.ts::swap-pencils-back-in | REWRITE (R4) | Trim to the grid swap |
| …/step-2.spec.ts::planner-and-person-race-409 | REWRITE (R8) | Move the race to the theatre tests |
| …/step-2.spec.ts::token-a-not-b | KEEP | Body keys naming another slot are ignored (see below) |
| …/dagplanning.spec.ts::edit-dagplanning | DELETE-CONFLICT | Written for the removed Dagplanning query. Select edit: react-aria edit-select-cell. Text edit: `step-0d.spec.ts:257-261`, `step-0c.spec.ts:74-80`. ~6 s |
| …/dagplanning.spec.ts::locatie-own-and-back | DELETE-CONFLICT | A strict subset of `step-2b.spec.ts:216-310` (same pick, same own/inherited checks, same Delete, same stored null). ~6 s |
| …/dagplanning.spec.ts::owner-has-no-dagplanning | DELETE-CONFLICT | Lines 700-701 hold for every caller now that the query is gone (`seed-missing.test.ts:282`; `rail-tree.spec.ts:47`). The owner's 403 is `toewijzing.test.ts:212`; the owner's tree is `grid-ux.test.ts:99`. ~3 s |
| …/dagplanning.spec.ts::removal-question-by-keyboard, -enter-on-annuleren, -tab-to-verwijderen, -buttons-styled | REWRITE (R1) | Four copies of one setup; merge |
| …/dagplanning.spec.ts::tourstop-first-in-planning | REWRITE (R7) | Mostly read-backs of the declaration; move to the theatre test |
| …/dagplanning.spec.ts::period-is-the-period | KEEP | Its second half is unique (see below) |
| …/attachments.spec.ts::photo-location-gone | DELETE-CONFLICT | `strip.test.ts:65` asserts the whole stripped output byte for byte; also `attachments.test.ts:421,173`. ~6 s |
| …/attachments.spec.ts::refusals-in-dutch | KEEP | The theatre's real 10 MB limit through the browser (see below) |
| …/action-inputs.spec.ts::shift-tourstop | REWRITE (R5) | Trim the second run and the wire checks |
| …/period-today.spec.ts::new-date-condition-starts-at-deze-week | DELETE-CONFLICT | `FilterBuilder.test.tsx:74` (same five comparisons), `:91-95`, `:53`. ~4 s |
| …/period-today.spec.ts::filter-is-vandaag, vandaag-kept-after-reload | REWRITE (R3) | Merge into one |
| …/rail-tree.spec.ts::dagplanning-is-gone | DELETE-CONFLICT | `seed-missing.test.ts:282,293-296`, `grid-ux.test.ts:52`; Week lit and no chip: `step-3e.spec.ts:46-80`. An absence ratchet. ~3 s |
| …/model-menu.spec.ts::name-and-icon-are-for-administrators | DELETE-CONFLICT | `Rail.test.tsx:263-270`, `display.test.ts:22`. ~2 s |
| …/model-menu.spec.ts::the-open-models-menu-exports | REWRITE (R6) | Drop two unit-pinned assertions |
| …/title-line.spec.ts::title-line-reads-in-full, title-line-fits-at-1280 | REWRITE (R2) | Same view, same viewport; merge |
| …/smoke/step-3f.spec.ts (all 3) | DELETE | Not registered in CHECKS. Goes through the same path-agnostic session check (`packages/engine/src/auth.ts:299`) already tested at `auth.test.ts:276-322` |
| …/smoke/{action-inputs, attachments, dagplanning, grid-toolbar, period-today, step-1, step-3, step-3c, step-3e, virtual-columns}.spec.ts (all tests); smoke/grid-ux.spec.ts loop (4); smoke/step-2.spec.ts record-link + loop (3); smoke/step-3d.spec.ts timeline link (1) | DELETE-CONFLICT (39) | See the smoke paragraph below. About 17 s together |
| …/smoke/{grid-ux shell, react-aria ×2, step-2 meta, step-3d tokens} | REWRITE (R11) | Five checks of one sign-in page; merge into one |
| /home/ntdst/Sites/worktable-prune/e2e/tree.ts::openWeek (helper) | REWRITE (R10) | Support code, not a test |

**Why the 39 smoke tests can go.**
- All 25 "asks for a session" API probes, plus the record-link probe, hit one middleware: `app.use('/*', authenticate…)` at `auth.ts:299`. It runs before the route or the query string is read.
  - `auth.test.ts:276-322` already proves this for `/api/schema`, `/api/rows`, `/api/views` and an unknown route (`/api/nope`).
  - Also covered: `history.test.ts:232` (history), `record-link.test.ts:431` (the no-store headers on a 401), `public.test.ts` (the unknown public token's 404).
- The 12 "link lands on the sign-in page" tests never exercise the link.
  - Without a session the App only matches `#/auth`, `#/act` and `#/link` (`App.tsx:85-96`), then shows the sign-in form.
  - The `view` and `f` parts of the hash are read only inside `Workspace`, which needs a session (`App.tsx:189,275`).
  - So all 12 run the same code. `step-3d:19` and `action-inputs:7` even load the identical URL, `/#view=speelreeks`.

## KEEP: the bar, point by point
- **refused-edit** (`step-0b.spec.ts:104-117`)
  - Decided: SPEC:223 (end before start is refused).
  - Expected value: the Dutch message, and no revision written.
  - Outcome: the row alert and the stored row.
  - Seam: a hand typing into the date/time segments.
  - Can fail: yes.
  - Lowest seam: once speelreeks-end-before-start goes, this is the one test of a refusal through the segmented editor; `writes.test.ts:124` covers only the server.
- **day-line-move** (`step-0b.spec.ts:156-183`)
  - Decided: SPEC:295.
  - Expected value: the 12 and 13 October headers, hardcoded.
  - Outcome: which group the row sits under, and the revisions.
  - Seam: a cell edit.
  - Can fail: yes.
  - Lowest seam: `writer.test.ts:87-99` covers plandag, but the live move to a new band after one's own edit is shown only here. action-inputs re-reads after an action, which is another path.
- **cross-site-refused** (`step-0b.spec.ts:236-272`)
  - Decided: SPEC:100.
  - Expected value: 403 `forbidden_site`, row unchanged.
  - Outcome: the response a page on another origin sees.
  - Seam: a real Chromium fetch.
  - Can fail: yes.
  - Lowest seam: `write-guard.test.ts:46` sets the header by hand; only a browser proves Chromium sends it. The test's second, direct-request half duplicates `write-guard.test.ts:46` and could be dropped.
- **rebound-host-refused** (`step-0b.spec.ts:274-285`)
  - Decided: SPEC:100 ("pinned in configuration"); added by review M1 (`specs/step-0b/review.md:34`).
  - Expected value: 403 naming the bad host.
  - Outcome: the response and the unchanged row.
  - Seam: a request through the Vite proxy.
  - Can fail: yes.
  - Lowest seam: nothing else tests `vite.config.ts:11` (`allowedHosts: []`).
- **referenced-delete-refused: organisatie** (`step-0c.spec.ts:100-127`)
  - Decided: SPEC:53 (in-use refusal).
  - Expected value: the counts are computed from other API reads (an independent check).
  - Outcome: the 409, the notice, the row still there.
  - Seam: the drawer's delete.
  - Can fail: yes.
  - Lowest seam: the engine and i18n tests cover the logic; this becomes the single e2e flow, once the productie case and step-1's copy go.
- **undo-time-on-untimed** (`step-0e.spec.ts:327-346`)
  - Decided: SPEC:62 (undo restores what the batch wrote).
  - Expected value: the earlier Datum.
  - Outcome: the cells, before and after a reload.
  - Seam: ⌘Z.
  - Can fail: yes.
  - Lowest seam: the only e2e where ⌘Z brings back a column the writer changed rather than the one edited; `apply.test.ts:304-337` covers only the server.
- **rollen-admin-rate** (`step-1.spec.ts:435-446`)
  - Decided: SPEC:232 (rates are administrator-only).
  - Expected value: 225 stored as a number.
  - Outcome: the reload and the API.
  - Seam: a number cell.
  - Can fail: yes.
  - Lowest seam: I found no unit test of a number cell's commit, and it is the only e2e that commits one.
- **token-a-not-b** (`step-2.spec.ts:516-561`)
  - Decided: SPEC:351.
  - Expected value: A changes, B unchanged.
  - Outcome: both stored rows.
  - Seam: POST /act with extra keys `id` and `record_id` naming B.
  - Can fail: yes.
  - Lowest seam: `action-token.test.ts` never sends keys naming another record.
- **refusals-in-dutch** (`attachments.spec.ts:332-407`)
  - Decided: SPEC:64 (file types, max_mb).
  - Expected value: the theatre's real limit, 10 MB + 1 refused and exactly 10 MB taken.
  - Outcome: the alert and the list.
  - Seam: setInputFiles in the drawer.
  - Can fail: yes.
  - Lowest seam: `Drawer.test.tsx:655-656` uses a 20 MB fixture, and the dropped-connection case is shown only here. Optional trim: the html-as-pdf and MZ cases duplicate `attachments.test.ts:190-191`.
- **period-is-the-period** (`dagplanning.spec.ts:139-185`)
  - Decided: SPEC:79.
  - Expected value: "Week N · 21–27 dec".
  - Outcome: the title line, no chip, the rows.
  - Seam: the filter builder.
  - Can fail: yes.
  - Lowest seam: its second half (a builder "ligt tussen" on plandag becomes the period) is in no other test. Lines 147-158 duplicate `step-3e.spec.ts:46-80` and could be trimmed. Its CHECKS row is stale (findings).

## REWRITE: the replacements
- **R1: dagplanning removal-question ×4** (CHECKS:68-71)
  - Replacement: one test with one `withQuestion` setup.
  - In order: Annuleren is focused; Escape keeps the person; Enter on Annuleren sends no PATCH and leaves no error cell (`:470-477`); Backspace, then Tab focuses Verwijderen (`:486`); the button styles (`:494-504`); Verwijderen removes and Ctrl+Z does not bring the person back (`:446-460`).
  - Bar: the behaviours come from the shake-out bugs (`:463`, `:482`, `:491`); the seam is the keyboard on the real dialog; it can fail.
  - Saves three setups, each an API create, an openWeek and opening the box: ~15 s.
- **R2: title-line ×2** (CHECKS:43-44)
  - Replacement: one test at 1280 px.
  - Keep three checks: the H1 does not overflow (`:17-18`), the toolbar does not overflow, and "Nieuwe activiteit" is in the viewport (`:26-27`).
  - Drop the summary regex: `dagplanning.spec.ts:152` and `step-3e.spec.ts:69` already check it.
  - Saves ~4 s.
- **R3: period-today, two tests into one** (CHECKS:151-152)
  - One test: new view, "is vandaag", only today's row shows, the stored filter is `{plandag:{$period:'today'}}`, a reload keeps it, and the empty hint names the day.
  - Drop the "no value input" check (`FilterBuilder.test.tsx:78`) and the `$period:'yesterday'` 400 probe (`rows.test.ts:86`).
  - Saves ~5 s.
- **R4: swap-pencils-back-in** (CHECKS:130)
  - Keep the grid part. Swap Joppe for Mona: the PATCH body has no `state` and the cell reads Voorlopig. Then one Ctrl+Z and the swap again. Then Jules for Hanne stays Geannuleerd.
  - Drop the server-only parts:
    - the person-page loads (`invite.test.ts:149`, `person-pages.test.ts:57-72`)
    - the mail and token counts (`invite.test.ts:110`)
    - the API block on the other states (`invite.test.ts:110-177`)
  - That also drops the for-owners publish and four record-link page loads. Saves ~10–15 s.
- **R5: shift-tourstop** (CHECKS:156)
  - Keep the +3 run with its bands and the ⌘Z.
  - Drop the second run, −2 with the notice's undo (`App.test.tsx:1260` covers the notice undo).
  - Drop the wire-boundary loop (`actions.test.ts:217,369`; `Drawer.test.tsx:460-472`), then lower the 90 s timeout.
  - Saves ~8 s.
- **R6: the-open-models-menu-exports** (CHECKS:40)
  - Drop the menu-item list (`Rail.test.tsx:260`).
  - Drop `toHaveCount(14)`: it pins the size of the icon set, and `Rail.test.tsx:309` already checks it against `ICONS.length`.
  - Keep the real .xlsx download.
- **R7: tourstop-first-in-planning** (CHECKS:57)
  - Move to `packages/theatre/test/grid-ux.test.ts` with `schemaAs('editor')`. The section order is already pinned at `:54`. Add these assertions:
    - `sources.speelreeks.label === 'Tourstops'`
    - `sources.speelreeks.new_label === 'Nieuwe tourstop'`
    - `sources.activiteit.columns.speelreeks_id.label === 'Tourstop'`
    - no served label matches /speelreeks/i
  - Then delete the e2e. Saves ~3 s.
- **R8: planner-and-person-race-409** (SPEC:351, CHECKS:132)
  - Move to `packages/theatre/test/toewijzing.test.ts`: `Promise.all([PATCH {state:'geannuleerd', expect:{state:'uitgenodigd'}}, POST /act {to:'bevestigd'}])` against `testEngine`.
  - Assert statuses [200, 409], the loser's `transition_lost`, and a final state that matches the winner.
  - Nothing below e2e runs these requests concurrently today (`toewijzing.test.ts:169` is sequential). In-process `app.request` interleaves at the same await points the HTTP race relies on. Saves ~3 s.
- **R9: step-0d matrix flows into one**
  - Type b on cell A (✓, stored bevestigd), type u on cell B (?), Ctrl+Z (B soft-deleted, A ✓), reload, then Delete on A (soft-deleted).
  - Saves one openWeek and a reload: ~5 s.
- **R10: `e2e/tree.ts::openWeek`** (helper, 115 call sites across all specs)
  - Each call loads `/` (the dashboard and its tiles), opens the view, opens the menu, copies the link, reads the clipboard, waits for the toast, navigates, then reloads.
  - Copying a link is already tested by `toolbar.spec.ts:114` (filter-link, CHECKS:83).
  - Replacement: read the view id from GET /api/views and go straight to `/#view=<id>&f=<conditions>`, then reload.
  - Catch: the conditions it keeps must be in the grid's link format. Either convert the seeded views' simple filters, or add a direct variant for views whose only condition is the date and keep the current helper for the rest.
  - Estimate 1–2 s per call, 2–4 min in all. Not measured: time one spec before and after.
- **R11: the five kept smoke checks into one** (CHECKS:51, 117, 118, 139, 214)
  - One test on `/`, which follows the sessionless path (`me()` answers 401, then the sign-in form).
  - It checks: lang nl, IBM Plex, the referrer and robots meta, the two CSS tokens, no Sakani markup, the page's own colours, and the sign-in button going from disabled to enabled.
  - Saves ~3 s.

## DELETE-CONFLICT: the governing lines
- **step-0a:** `specs/step-0a/plan.md:55` "| Gate | `bun run gate` | e2e · `e2e/step-0a.spec.ts` · `bun run e2e` | all three |"
- **step-0b:** `specs/step-0b/plan.md:63` "| Gate | … | all six + cross-site-refused |"
- **step-0c:** `specs/step-0c/plan.md:67` "| Gate | … | all |"; also `:65`, `:66` (rows naming select-clear-null and duplicate-assignment-refused).
- **step-0d:** `specs/step-0d/plan.md:74` "| Gate | … | all, incl. matrix-two-activities-undo and foreign-view-hidden |"; also `:73` (datetime-shown, new-without-title, relation-beyond-page) and `:67`.
- **step-0e:** `specs/step-0e-auth/plan.md:129,131,132` name owner-sees-own, seeded-view-read-only and public-view-by-token; `:134` "| Browser gate | Playwright | e2e · `e2e/step-0e.spec.ts` · `bun run e2e` | all five above, plus session-less-401 |". `specs/step-0e-datum/plan.md:59-60` name untimed-activity.
- **SPEC:**
  - `docs/SPEC.md:349` "the website's performance calendar reads voorstellingen" (public-view-by-token).
  - `docs/SPEC.md:351` "a reused or expired link is refused, … a script reading every view for owners with an ordinary person's link finds no key outside the owner-visible columns, a rotated or revoked link is refused, the link request answers byte-identically for known and unknown addresses, and a declined or merely invited person cannot open the production; an agent token's write is logged as its service account, undone by batch, and refused after revoke" (step-2 rows).
  - `docs/SPEC.md:352` "the dagplanning query no longer exists" (dagplanning-is-gone). This is an absence ratchet; since there is no ARCHITECTURE-INVARIANTS.md, it could become a grep there if one is created.
- **CHECKS.md:**
  - step-1 rows: 12, 13, 14, 15, 18, 19, 23, 24
  - step-2 rows: 124, 126, 134, 135, 136, 137, 138
  - dagplanning: 58, 59, 72; attachments: 161; period-today: 153; rail-tree: 56; model-menu: 42
  - smoke: 25–29, 52–55, 73–76, 91–94, 140–142, 148–150, 154–155, 158–159, 164–165, 178–179, 196–199, 215, 249–251
- **How to read SPEC:345 and AGENTS.md "A step is done when its acceptance gate passes in a real browser":** both read as a completion criterion, not a rule that the gate tests stay forever. If you read them as standing, the rows quoting SPEC:349/351/352 become KEEP.

## Assertions to move before deleting
1. `step-0e.spec.ts:120` (no save word in the toolbar after a change on a seeded view) → `toolbar.spec.ts` autosave-own-view, after line 45. Check first that this is still decided: SPEC:139 gives a standard view a "changed" mark when its sort switches.
2. `step-1.spec.ts:583` ("Locatie bestaat niet." for a locatie_id that never existed) → `packages/theatre/test/step1.test.ts`, next to `:103`, which only tests a soft-deleted one.
3. `step-0b` clear-end: clearing only eind_at on a timed row is accepted → `packages/theatre/test/writer.test.ts`, next to `:164`/`:170`, which pin clearing both and refusing start-only.
4. `period-today:203-204`: a new condition switched to the other date field (Datum) still starts at "is deze week" → `FilterBuilder.test.tsx`, next to `:91`.
5. The R7 and R8 assertions, as described above.

## Support code that goes dead if every DELETE is applied
- `e2e/step-0a.spec.ts`: the whole file (123 lines).
- `step-0b.spec.ts`: `pickOption` (70-77), `dropStatusFilter` (31-33).
- `step-0c.spec.ts`: the `openEditor` import.
- `step-0d.spec.ts`: the `modelNode`, `openModel` and `pickIn` imports; the foreign-view-hidden `beforeAll` and its `bun -e` insert.
- `step-0e.spec.ts`: `signedAs` (19-20), `rows` (22-26), `views` (28-32), `land` (39-43), `patchOf` (245-248); the `request`, `state`, `addCondition` and `openWeek` imports.
- `step-1.spec.ts`: `UNDO_WEEK` and `LOCATIE_WEEK`, and their entries in `mondayAhead`'s list.
- `step-2.spec.ts`: `cli` (110-123), `recordLink`, `linkToken`, `forOwnersOn`; the `SERVICE`, `writeDb` and `spawnSync` imports.
- The service account: `e2e/auth.ts:63-70` (`SERVICE`, `createService`) and `e2e/global-setup.ts:29`. Nothing would read `e2e/.tmp/service-token` any more, and setup would still spawn the CLI once.
- `dagplanning.spec.ts`: `pickRelation` (63-68) and the `state` import. `modelNode` also goes if R7 is applied.
- `attachments.spec.ts`: `exifWithGps`, `segments`, `ifd0Of` and `GPS_WEEK` (about 213-286).
- `playwright.config.ts:29` `VITE_RECORDS_PAGE_SIZE: '2'`. Only relation-beyond-page needs it; see finding 2.
- Ten smoke files go whole; step-2, step-3d and grid-ux lose tests.
- `specs/CHECKS.md`: the row of every registered test removed.

No helper file in `e2e/` is unused today. Every export in auth, board, db, editor, segments, shots and tree has an importer, and `fixture-views.ts` is run by `auth.ts:54`.

## Findings outside the brief
1. **A stale CHECKS row.** `specs/CHECKS.md:60` greps `"period-is-a-filter @e2e"`, which matches no test: the test was renamed `period-is-the-period` (`dagplanning.spec.ts:139`). The same old name is in `specs/grid-toolbar/plan.md:62,245` and `specs/react-aria/plan.md:49`.
2. **`VITE_RECORDS_PAGE_SIZE=2` applies to the whole theatre suite** (`playwright.config.ts:29`). That makes every `records()` and `optionsFrom()` call page in twos (`apps/grid/src/api.ts:200-209,234`). It covers the space switcher on every load, tones, filter names and every picker search, for one test that `api.test.ts:210` already covers. Effect not measured, probably tens of seconds.
3. **Tests that cannot fail for the reason in their name.**
   - The smoke tests' hash variants (App.tsx never reads the hash without a session).
   - The smoke tests' query-string variants ("sorted on position", "for today", "by Locatie", "before it serves flags"): the session check runs before any parsing.
   - `dagplanning.spec.ts:700-701`: the dagplanning source is absent for every role.
   - `step-0d.spec.ts:270`: implied by the line before it.
4. **owner-view-key-script reads its expected keys from the system under test** (`step-2.spec.ts:1079-1084`, the administrator's /schema). A column wrongly declared owner-visible would pass.
5. **Plans no longer match the tests.**
   - `specs/step-0a/plan.md:57,210` says query-view-loads opens "Per productie per dag"; the test opens Voorstellingen.
   - `specs/step-0b/plan.md:65` says query-edit-lands opens the Dagplanning query, which no longer exists.
   - `apps/grid/src/api.test.ts:398` still requests `/api/rows/dagplanning`.
6. **The step-3f smoke spec is not registered in CHECKS.md.** It was added in the head commit 9320fba.
7. **The harness serves the grid with the Vite dev server** (`playwright.config.ts:27`). Each test's new browser context loads about 134 source modules plus dependencies with an empty cache. A built bundle served by `vite preview` might cut every page load. Not measured.
8. **Duplicates in other slices.**
   - react-aria not-nullable-select-offers-no-leeg (`:1029`) repeats edit-select-cell (`:340-343,379-383`).
   - `LinkPage.test.tsx:86-90` scans `index.html` as text for the same meta tags the step-2 smoke checks on the served page; keep one.
9. **Noise.** `scrollbars.spec.ts:23,44` `console.log` in a gate test.
10. **An untracked spec in the live tree.** The git status at session start shows `e2e/zz-observe.spec.ts` untracked in /home/ntdst/Sites/worktable; `bun run e2e` there would pick it up. I did not read it.
11. **A mistake on my part.** One `ls` command reached /home/ntdst/Sites/worktable/test-results and printed a single folder name. I read nothing else outside /home/ntdst/Sites/worktable-prune.
