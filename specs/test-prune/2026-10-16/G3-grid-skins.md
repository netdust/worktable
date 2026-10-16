## G3 audit: the grid skins (27 files, 4,741 lines)

Root for every short path below: `/home/ntdst/Sites/worktable-prune/` (snapshot 9320fba). I ran nothing and only read and grepped.

### Totals
- **Tests examined:** 323 declared, about 350 at runtime counting `it.each`. Every test in all 27 files was read.
- **DELETE 21 · DELETE-CONFLICT 5 · REWRITE 11 · KEEP (rows) 12.** The other ~274 tests meet the bar and get no row.
- **Lines that would go:**
  - DELETE: about 170.
  - DELETE-CONFLICT: about 42, if Stefan approves.
  - REWRITE: about 45 net test lines, plus about 15 lines of fixture JSON.
  - All applied: about 270 of 4,741 lines (about 6%).
- **Effect on gate time: close to none.** This whole slice is vitest, so these cuts save seconds. The time lever is the e2e side of the cross-tier overlaps listed at the end.
- **CHECKS.md:** no test in this slice is registered there, so no CHECKS conflicts. Both conflicts come from plan lines.

### Scanned
- All 27 files.
- Traced against their source: board (Board, drop, rank, target, useBoardDrag), Timeline and overlap, calendar layout, dashboard (Dashboard, StatTile, ListTile, tiles), export (ics, xlsx), i18n, matrix (away, columns).
- Checked against Folio: `/home/ntdst/Projects/folio/packages/shared/src/board-rank.test.ts`.
- **Only skimmed:**
  - `matrix/store.test.ts:450-691` (the refresh-race tests): read, not traced into `store.ts`.
  - The focus and selection tests in `Panel.test.tsx`: read, not traced into `Panel.tsx`.

### Dispositions

| path::method | disposition | reason (one line) |
|---|---|---|
| /home/ntdst/Sites/worktable-prune/apps/grid/src/board/Board.test.tsx:51 'shows every option as a column…' | DELETE | Column order is already asserted at skins.test.tsx:25-28 and "Geen" left out at skins.test.tsx:60. Move its empty-text line (:54) first. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/board/Board.test.tsx:64 'opens a card's row with Enter, and with a click' | REWRITE | The click half (:68-71) repeats skins.test.tsx:31-32. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/board/Board.test.tsx:150 'announces the lift in Dutch…' | KEEP | Copy pin, but the plan names it (3f plan.md:189). |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/board/Board.test.tsx:196 'offers "Iemand anders kiezen"…' | REWRITE | The pick flow repeats Grid.test.tsx:1143-1150 and Drawer.test.tsx:384. Only the Board's `places` wiring is its own. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/board/drop.test.ts:76, :86 writeDrop | KEEP | Store-call shape, but the store calls are writeDrop's only output. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/board/rank.test.ts:7, :12, :17, :55, :67, :79 | KEEP | Copied from Folio, but Folio's suite runs Folio's file, not ours. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/board/rank.test.ts:22 'between two keys…' | DELETE-CONFLICT | Same as the first iteration of :55 (same lo/hi, same assertion). |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/board/rank.test.ts:28 'repeated midpoint insertions just above lo' | DELETE-CONFLICT | Its 30 steps are the first 30 of :55, which runs the same loop 500 times. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/board/rank.test.ts:37 '…just below hi' | DELETE-CONFLICT | Its 30 steps are the first 30 of :67. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/board/rank.test.ts:46 'adjacent keys…' | DELETE-CONFLICT | Same walk as :67: a one-digit hi approached from below, same branches (rank.ts:40-53); 50 steps against 500. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/calendar/Calendar.test.tsx:40 'a timed event sits on the hour axis' | KEEP | Pixel geometry, but approved (3d plan.md:156) and the only render-level placement check. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/calendar/Calendar.test.tsx:48 'a block too short…' | REWRITE | The class line (:51) is a CSS hook; the one-line layout is proven by e2e point-event-shows-its-name (step-3.spec.ts:550-580). |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/calendar/Calendar.test.tsx:55 'an untimed event sits in the all-day band' | DELETE | Already proven by :120 (same row, same "Hele dag do 15" group) and :126; the logic is at layout.test.ts:84. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/calendar/Calendar.test.tsx:132 'the row drawer opens beside the calendar…' | DELETE | Asserts the drawer sits inline in `.nv-body`, which the app no longer does; see below. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/calendar/Calendar.test.tsx:156 'a month shows each event on its day…' | DELETE | :141 already asserts the same chip (:145); this test never checks the day. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/calendar/Calendar.test.tsx:169, :176 spanning bars | KEEP | `gridColumn` strings, but the only render check that a span is one bar per week. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/calendar/layout.test.ts:18 'an untimed row is all-day' | DELETE | Implied by :84, which puts row 2 in `allDay['2026-10-15']` (weekGrid sorts by `allDay`, layout.ts:199-200). |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/dashboard/Dashboard.test.tsx:46 'bijgewerkt hh:mm' | KEEP | Copy, but approved (3e plan.md:261). |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/dashboard/Dashboard.test.tsx:167 'an empty dashboard says so' | REWRITE | Can't fail for what its name says: it only checks that some region exists. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/dashboard/tiles.test.ts:18 'counts from the total with a one-row read' | KEEP | `limit 1` is call shape, but the 7-from-total assertion is the outcome. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/export/xlsx.test.ts:100 'formula-leading section, foot…' | REWRITE | The `setStrings` half guards labels no source can set (see "the site's own words"). |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/i18n.test.ts:7 'reads English until…' | DELETE | Reads back a default string (i18n.ts:31); its name says "English" but the defaults are Dutch. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/i18n.test.ts:11 "reads the site's words once they are set" | DELETE | Can't fail: it sets values equal to the defaults (i18n.ts:17, :31, :40). The path is also unreachable. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/i18n.test.ts:19 'ignores an unknown key…' | DELETE | Guards input nothing ever supplies (unreachable path). Turns into KEEP if `setStrings` stays. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/i18n.test.ts:53 "keeps the site's own words first…" | DELETE | The first half is unreachable. The second half (server's message for an unknown code) is already covered by Dashboard.test.tsx:136-143. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/matrix/Matrix.test.tsx:116 'says the declared mark for a status' | DELETE | Reads back `view.join.marks` (columns.ts:101-103); the shown marks are asserted at :193, :432, :450. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/matrix/Matrix.test.tsx:121 'finds the away record covering a day…' | DELETE | :124-125 repeat away.test.ts:13-17. Move :126 first. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/matrix/Matrix.test.tsx:140 'lays the week out by day under a frozen header row…' | DELETE | Headers repeat :295/:554; day labels repeat :351 (group falls back to the date, Matrix.tsx:99-101). "Frozen" is only `.nv-first` class presence, and no e2e checks matrix stickiness. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/matrix/Matrix.test.tsx:152 name-column divider | KEEP | Class string, but SPEC:68's "extern" group; it asserts which cells carry it. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/matrix/Matrix.test.tsx:163 'groups by a select field…' | DELETE | Its rows, group and labels are exactly the second half of :351. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/matrix/Matrix.test.tsx:203 'shades a cell where the person is away…' | REWRITE | :210 `not.toContain('assigned')` can't fail on a Dutch UI. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/matrix/Matrix.test.tsx:231 'heads a person column with its first name…' | REWRITE | Asserts only the clash case; the first-name case is checked only by e2e step-3d.spec.ts:565. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/matrix/Matrix.test.tsx:264 'opens no floating layer' | KEEP | A negative check copied from baseline, but the inline picker is decided (App.tsx:220). |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/matrix/Matrix.test.tsx:316 'hides a name column…' | DELETE | Same key-based path as :295; hiding a name key is at columns.test.ts:13. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/matrix/Matrix.test.tsx:328 'hands the layout on with the column hidden' | DELETE | Implied by :295: its `Held` wrapper (:286-289) only hides the column if `onLayout` carries `hidden`. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/matrix/Matrix.test.tsx:386 'focuses a clicked cell and shows it in the side panel' | DELETE | Repeats Panel.test.tsx:156-166 and :403. Its one extra line (:393) asserts the stale `.nv-body` placement. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/matrix/Matrix.test.tsx:512 'shows a refused write on its cell, in the site's words' | REWRITE | Relies on the unreachable `setStrings` override. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/matrix/Matrix.test.tsx:565 'shows a pencilled cell with its mark' | DELETE | Same mark-rendering path as :193. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/matrix/Panel.test.tsx:361 'keeps a 10,000-character note inside its scrolling field' | DELETE | Can't fail for its name: the scrolling is CSS, and a jsdom textarea always holds its value. Long-text editing is at :268. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/matrix/Panel.test.tsx:438 'draws no dialog, list or popover…' | KEEP | Negative check from baseline, but "choices open in place" is decided (3e). |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/matrix/Panel.test.tsx:475 'still shows the empty state…' | DELETE | Repeats Matrix.test.tsx:247. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/matrix/columns.test.ts:23 'the name keys…Arrangement::clean()' | REWRITE | A mirror test whose other side, PHP `Arrangement`, is not in this repo. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/matrix/store.test.ts:163 'reverts a refused cell…in the site's words' | REWRITE | Relies on the unreachable `setStrings` override. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/matrix/store.test.ts:326 'undoes a create by removing the record it made' | DELETE | Covered by :275 (remove of the re-created record at :284, empty cell at :285) and :382-384. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/matrix/store.test.ts:337 'undoes a Delete by creating the record again…' | DELETE-CONFLICT | Same create-with-status-and-note as :295 (:302); the cell repaint after undo is at Matrix.test.tsx:448-450. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/matrix/store.test.ts:453 'asks once for the window's rows after a refusal…' | REWRITE | Its message assertion relies on the unreachable `setStrings` override. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/skins.test.tsx:199 'draws a bar per row over its days' | KEEP | Percent geometry, but the only render-level bar placement. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/timeline/Timeline.test.tsx:56 (and Calendar.test.tsx:87) 'wait for their records' tones' | KEEP | A class-count check, but a decided fix (2f71775). |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/timeline/Timeline.test.tsx:135 'marks two bars of one day whose times overlap' | DELETE | Passes with or without the times wiring (same day overlaps anyway, overlap.ts:23). Marking is covered by :89, the logic by overlap.test.ts:43-45. Only :128 proves the times wiring. |
| /home/ntdst/Sites/worktable-prune/apps/grid/src/flags.test.tsx:67 board flag | KEEP | Asserts the read's call shape `[window, null]`, but the outcome assertions carry it. |

#### The drawer placement behind Calendar.test.tsx:132 and Matrix.test.tsx:393
- In the app the drawer portals into `.nv-drawer-slot` (SidePanel.tsx:24-61, App.tsx:646). Without a slot, as in these unit tests, it renders inline in `.nv-body`. Both tests assert that inline fallback.
- plan-review 3d:28 and :84 already called this stale.
- The real placement is proven by e2e drawer-in-slot (step-3d.spec.ts:188).

### KEEP and REWRITE against the bar
Six points per entry: decided behaviour, an expected value that can disagree, outcome rather than call shape, the caller's seam, can fail, lowest seam without a duplicate.

**KEEP**
- **Board.test:150**
  - Decided: 3f plan.md:189 "the live region announces the lift in Dutch with the card's title".
  - The expected string is a literal.
  - Outcome: it reads the live region (`role=status`).
  - Seam: Board props. It fails if the announcements are unwired. No other test reads it.
- **drop.test:76, :86**
  - Decided: SPEC:139 "A drop that changes a card's column and its place writes both in one write".
  - The expected arrays are literals.
  - Outcome: writeDrop's only output is the store calls.
  - Seam: writeDrop, which App calls. It fails on reordering or a lost `with`. Lowest seam.
- **rank.test:7, :12, :17, :55, :67, :79**
  - Decided: SPEC:139 and 3f plan.md:132.
  - Lexical order checks are independent of the algorithm.
  - Outcome: the returned keys. Seam: `rankBetween`. They fail if ordering breaks.
  - Not covered upstream: Folio's suite runs Folio's file, and ours is a modified copy (diff shows `rankOf`/`byRank` added).
- **Calendar.test:40**
  - Decided: 3d plan.md:156 "Calendar.test.tsx reads the constant".
  - Expected: (14-8)×HOUR_PX and 3×HOUR_PX take the axis start and the length independently.
  - Outcome: rendered style. Seam: Calendar props. It fails on misplacement.
  - The only px check; weekGrid has no px.
- **Calendar.test:169, :176**
  - Decided: 6562271 "a spanning row is one bar across its days".
  - Expected: column/span values derived from the dates.
  - Outcome: one element per week row. Seam: Calendar.
  - spanBars (layout.test.ts:161-175) covers the indices, not the one-element render.
- **Dashboard.test:46**
  - Decided: 3e plan.md:261 "bijgewerkt hh:mm".
  - A regex on the text. Outcome: rendered. Seam: Dashboard. It fails if the time is dropped.
  - Lower seam than e2e dashboard-title-pill.
- **tiles.test:18**
  - Decided: SPEC:73 stat from a count.
  - 7 comes from `total`, not from `rows.length` (1).
  - The outcome assertion carries it; the limit-1 check is an incidental efficiency guard.
  - Seam: statOf. It can fail. Lowest seam.
- **Matrix.test:152**
  - Decided: SPEC:68 "under an 'extern' group".
  - Asserts which cells carry the divider (header, all 3 body cells, foot) and none on a record column.
  - It fails if the divider is misplaced. The only guard of the extern boundary.
- **Matrix.test:264, Panel.test:438**
  - Decided: the picker lives in the matrix (App.tsx:220) and the status choices "open in place" (3e; helper at Panel.test.tsx:66).
  - They fail if a react-aria popover appears.
  - Note: Panel.test:447's computed-style scan is weak in jsdom, because no CSS is loaded.
- **skins.test:199**
  - Decided: 3c T6 timeline skin.
  - 1/7 and 3/7 of the week are independent of the code; the ±px insets are incidental.
  - Outcome: rendered style. Seam: Timeline. It fails if the bar is misplaced.
  - timeline/layout.test.ts:23 covers indices only.
- **Timeline.test:56, Calendar.test:87**
  - Decided: the fix 2f71775, which the e2e production-tone row in CHECKS.md:244 was verified at.
  - Expected: nothing drawn before the tone read answers, then tones.
  - Outcome: render. Seam: the skin. It fails on a palette flash. The e2e can't observe the flash.
- **flags.test:67**
  - Decided: SPEC:141 flags.
  - Expected: the mark word, the title, the count, the band.
  - The window/scope call check reflects SPEC's "in the caller's own scope".
  - Seam: Board. It can fail. Lower seam than conflict-marks-and-insight.

**REWRITE**
- **Board.test:64**
  - Decided: 3f plan.md:189 "Enter on a card opens its row". It fails if Enter lifts the card (plan-review 3f:234).
  - Duplicate: the click half repeats skins.test.tsx:31-32.
  - Replacement: delete :68-71.
- **Board.test:196**
  - Decided: SPEC:141 and review 3f Should fix 1 (review.md:82).
  - Duplicate:
    - :215-222 repeat Grid.test.tsx:1143-1150: the same `update` exactly-once with `('assignment', 11, { person_id: [7] })`, band gone, Mensen shows Noor.
    - The board surface also runs in e2e conflict-choose-other (step-3f.spec.ts:1155-1164).
  - Replacement:
    - Render Board in `SchemaContext` with `places={() => vi.fn()}` and the clash from `remote.rows`.
    - Open the card and assert the band's buttons are `['Iemand anders kiezen','Negeren']` (:208-213).
    - Drop the store, history and `rowOf`/`update` mocks and :215-222.
- **Calendar.test:48**
  - Decided: e66b107, shake-out row 12. The title 'Lotte Verhaegen · voorstelling zonder einde' is an independent literal.
  - The class `nv-cal__event--short` (:51) is a CSS hook; e2e point-event-shows-its-name proves the layout.
  - Replacement: delete :51 and keep the title assertion.
- **Dashboard.test:167**
  - Decided: the empty note (Dashboard.tsx:96; e2e step-3c.spec.ts:467).
  - Can't fail for its name: `show([])` still builds the section 'Nu' (Dashboard.test.tsx:28-29), so the note never renders, and the test only finds a region.
  - Replacement: in Composer.test.tsx:157, which already renders `dashboard({}, [])`, add `expect(screen.getByText('Dit dashboard is nog leeg.')).toBeTruthy()` before clicking Bewerken. Then delete Dashboard.test:167-170.
- **Matrix.test:203**
  - Decided: the away shade and its warning (i18n.ts:187-188).
  - :210 `.not.toContain('assigned')` can never fail: the warning reads 'Afwezig en toegewezen'. The line is baseline's English UI, copied verbatim at 7ede61a.
  - Replacement: `.not.toContain('Afwezig en toegewezen')`.
- **Matrix.test:231**
  - Decided: first names in heads, the whole name on a clash (e2e step-3d.spec.ts:564-567).
  - Both columns are "Sien …", so the first-name half is never asserted.
  - Replacement: give person 7 ('Marit Vos') a join and assert its head label 'Marit' with title 'Marit Vos'. Or rename the test to the clash case only.
- **Matrix.test:512, store.test:163, store.test:453**
  - Decided: a refused write reverts, marks the cell and shows the refusal.
  - The "site's words" come from `setStrings({'error.duplicate_assignment': …})`, which can't reach a user:
    - toSchema never sets `strings` (engine.ts:291-300).
    - No engine or domain source serves `strings` (grep in `packages/*/src` finds only filter-compile.ts:141, which is unrelated).
    - No writer emits `duplicate_assignment` (grep in `packages/*/src` finds nothing).
  - Replacement: drop the `setStrings` line and expect the server's message ('Already on it.' / 'This person is already on this activity.'), which is what errorText (i18n.ts:430-433) shows in production.
- **matrix/columns.test:23**
  - Decided: name keys trimmed, lower-cased and capped at 80 (columns.ts:6-8). The cap is the grid's own (wp-assumptions.md:62, row 50).
  - The test's name and the fixture's `_about` (views-columns.fixture.json:2) cite `Arrangement::clean()`/ArrangementTest, which are not in this repo. Trim and case already sit at Matrix.test.tsx:88; only the cap is unique.
  - Replacement: one inline case, a 90-character name giving the key `'name:' + 'x'.repeat(80)`, here or in Matrix.test.tsx:88. Drop the fixture read.
- **xlsx.test:100**
  - Decided: threat 8 (xlsx.ts:12-15).
  - The data-sourced values (:102, :106, :109, :110, :112) are real. The quoted foot and counts (:101, :107, :108, :111) only exist because the test sets site strings no source can set.
  - Replacement: delete :101, :107, :108, :111.

### DELETE-CONFLICT: the governing lines
- **rank.test.ts:22, :28, :37, :46**
  - specs/step-3f/plan.md:113: "`board/rank.test.ts` (Folio's `board-rank.test.ts` copied, plus ours)"
  - specs/step-3f/plan.md:132: "`rank.test.ts`: Folio's cases (ordering, 500 inserts at one spot stay unique and ordered, throws on lo ≥ hi); `byRank` keeps the given order among unranked rows."
  - The 500-insert cases (:55, :67) and the throw case (:95) stay, so the parenthetical is still met. Only the wholesale "Folio's cases" copy is at stake.
- **store.test.ts:337**
  - specs/step-2/plan.md:290: "matrix, on a non-lifecycle join: today's re-create undo is unchanged (the assertions of `store.test.ts:234, 254, 274, 316` kept; …)"
  - At 6f5c767 those lines are the it-lines of what are now :255, :275, :295 and this test (checked with `git show 6f5c767:apps/grid/src/matrix/store.test.ts`). I keep the other three.

### Assertions to move before a DELETE
- Board.test.tsx:54 (the empty column text) goes into skins.test.tsx:25: `expect(within(screen.getByRole('region', { name: 'Voorlopig' })).getByText('Geen toewijzingen')).toBeTruthy()`.
- Matrix.test.tsx:126 (a name column is never away) goes into away.test.ts: `absentOn([studiedag], view, { key: 'name:lotte', kind: 'name', title: 'Lotte' }, '2026-10-12')` is `undefined`.
- Optional: Panel.test.tsx:479 (no grid when empty) into Matrix.test.tsx:247.
- Nothing is lost from:
  - **Matrix.test:140:** its one extra assertion is `.nv-first` class presence. If the frozen header should be guarded, that needs an e2e.
  - **Calendar.test:132 and Matrix.test:386:** the only extra is the stale placement.
  - **The other DELETEs:** nothing of their own.

### Support code that goes dead
- Matrix.test.tsx:14 `absentOn` import, and `markFor` in :15.
- i18n.test.ts:2 imports `rowCount`, `setStrings` and `t`, plus the afterEach at :4 and the `describe('t()')` wrapper (:6, :25).
- Board.test.tsx after its rewrite: `placeWriter` (:5), `createStore`/`Store` (:7), `createHistory` (:9), `useSyncExternalStore` (:2), `Sheet` (:186-194), the `update`/`rowOf` mocks (:13) and their reset (:182).
- The `setStrings` import and afterEach reset in store.test.ts (:2, :90) and Matrix.test.tsx (:4, :78).
- xlsx.test.ts:19 `setStrings(…)` in beforeEach is already a no-op: every value equals a default (i18n.ts:36-37, :40-41, :53). After the :100 rewrite, :6 and :23 go too.
- In views-columns.fixture.json, the `matrix` block (names, keys, refused) and `ColumnsFixture.matrix` (fixture.test-support.ts:11). No test reads `matrix.refused` even today. The fixture itself stays for grid/columns.test.ts:19-20, which is another slice.
- **Production code, Stefan's call:** `setStrings` with its overrides/refusals (i18n.ts:404-424), the `refusals` branch of errorText (i18n.ts:430-433), `Schema.strings` (types.ts:306-307) and the call at App.tsx:228. All unreachable, because no source serves `strings`.

### Findings outside the brief
1. **Tests that can't fail:** Matrix.test.tsx:210; i18n.test.ts:11; Dashboard.test.tsx:167 (for its named behaviour).
2. **The site's own words are a dead WordPress-era path.** Tests in other slices depend on it too: ui/NewViewDialog.test.tsx:106 and ui/ViewPanel.test.tsx:36 (`'error.views_bad_name'`).
3. **Stale mirror rationale:** grid/columns.test.ts:19 ("the ones Arrangement::ids() mirrors") and the fixture's `_about`. See wp-assumptions.md:63, row 51.
4. **Known stale placement never fixed:** plan-review 3d:28 and :84 already flagged Calendar.test:132 and Matrix.test:393.
5. **Baseline-era tests run in English:** the matrix tests copied verbatim (7ede61a) render with no `lang`, so they assert 'Monday May 18' (Matrix.test.tsx:147, :358). They test the 'en' fallback, not the Dutch UI.
6. **A missing guard:** Dashboard.test.tsx:83 uses an unscoped list view, so a ListTile that never scopes would still pass. CHECKS.md:188 space-narrows-every-tile is a `test.fail` waiting on that bug, and it has no unit guard.
7. **Cross-tier overlaps.** In each pair below the unit test is the lower seam, so any cut belongs on the e2e side, where the gate time is:
   - **Board drags:** Board.test.tsx:78-146 against the board flows in CHECKS.md:234-241.
   - **Iemand anders kiezen:** Board.test.tsx:196 against conflict-choose-other (step-3f.spec.ts:1155) and Grid.test.tsx:1143.
   - **Timeline:** Timeline.test.tsx:46-75 against production-tone (step-3f.spec.ts:815); Timeline.test.tsx:89-102 against timeline-overlap (step-3f.spec.ts:1224).
   - **Calendar:** Calendar.test.tsx:48 against point-event-shows-its-name.
   - **Unlaned timeline:** skins.test.tsx:207 against unlaned-timeline-one-lane (step-3d.spec.ts:476).
   - **Dashboard tiles:** Dashboard.test.tsx:46, :56, :154 against dashboard-title-pill, stat-red-then-neutral and tile-no-access.
   - **Dashboard week strip and quick creates:** more-tiles.test.tsx:55, :80, :92 against week-opens-activity, quick-create and quick-create-activiteit.
   - **Dashboard composer:** Composer.test.tsx against composer-team-dashboard.
   - **Matrix:** Matrix.test.tsx:554-665 against open-counts, fill-splits-slot-and-undo and candidates-picker/candidates-none; Matrix.test.tsx:231 against matrix-heads-and-legend.
   - **Flags:** flags.test.tsx:63-101 against conflict-marks-and-insight and conflict-band-negeren.
