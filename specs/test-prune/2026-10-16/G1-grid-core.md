## G1 audit: grid core (24 files under /home/ntdst/Sites/worktable-prune/apps/grid/src)

I ran no tests and no builds. Everything below comes from reading the source and grepping. Paths in the tables are relative to `/home/ntdst/Sites/worktable-prune/apps/grid/src/`, and line numbers are the line of each `it(`.

### Totals
- **Tests examined:** 535 declarations (529 `it`, 6 `it.each`), about 559 cases at runtime.
- **DELETE: 30 tests** (34 runtime cases), about **325 lines**.
- **DELETE-CONFLICT: 18 tests**, about 184 lines if you approve them. 11 duplicate a test that a plan also names (about 89 lines). The other 7 are the "time" group (about 95 lines), which tests code no engine source can reach.
- **REWRITE: 4 tests**, which removes 2 more runtime cases.
- **KEEP: 15 rows** that looked suspect but pass the bar (about 20 tests).
- CHECKS.md registers only Playwright tests, so no test in this slice conflicts through CHECKS. Every conflict below comes from a plan line.

### Scanned
- I read all 24 files in full.
- Two blocks I checked only by assertion and duplicate, without tracing every branch: `engine.test.ts` L146-238 and L658-748, and `store.test.ts` L646-898.
- **Upstream copies:** nothing in this slice comes from Folio (rank.ts is outside it). Tests copied verbatim from ntdst-baseline (commit 7ede61a) cover code worktable has edited since, so they count as owned here and "covered upstream" does not apply.

### Table

| path::method | disposition | reason |
|---|---|---|
| grid/Grid.test.tsx::L96 "renders the Calais week grouped by day…" | DELETE | Labels and counts are in group.test.ts:22,31. Total and 47 are in L943 and group.test.ts:99. Header order is in columns.test.ts:23 plus L188. "Sticky" is only checked as a class. `queryByTestId('group-foot')` (L105) cannot fail: no source has that testid. |
| grid/Grid.test.tsx::L360 "a letter in the open list jumps … past the focused one" | DELETE (move one line) | L374 presses `r` from Repetitie and commits `travel`, which already proves the jump. |
| grid/Grid.test.tsx::L535 "undoes the last write on Ctrl+Z by its batch…" | DELETE | store.test.ts:132 covers batch undo, no inverse write and the repaint. The Ctrl+Z wiring is also in L1030, L1143 and L1463. step-1 plan:232 only asked for these tests to be changed, not kept. |
| grid/Grid.test.tsx::L893 "shows … for each fact of the group the read limit may have cut short" | DELETE | The values are in group.test.ts:165 (the test grid-ux plan:225 names). The format is in L882 and the cut wiring in L900. |
| grid/Grid.test.tsx::L920 "keeps … while the search hides that row" | DELETE | Same case as group.test.ts:180, added in the same fix (6565041). Grid only passes `cut` along (Grid.tsx:111). |
| grid/Grid.test.tsx::L1362 "shows a refused delete in the toolbar as the Dutch in-use sentence" | DELETE | The sentence is in i18n.test.ts:28-31 and store.test.ts:544. The kept row is in L1252. Errors reach the toolbar on one channel (App.tsx:575, already proven by L1380). The browser flow is e2e speelreeks-delete-in-use (CHECKS:13). |
| grid/Grid.test.tsx::L1411 "keeps a refusal whole in the DOM however narrow" | DELETE (move one line) | The text format is in ui/Toolbar.test.tsx:88. Its only unique check is the `title` attribute (Toolbar.tsx:83). "However narrow" cannot be tested in jsdom. |
| grid/Grid.test.tsx::L1513 "says nothing while a cell saves … and Undo with a word" | DELETE | Silence while saving or saved is in Toolbar.test.tsx:88, the refusal text in L1380, the toast undo in L1441. |
| grid/Grid.test.tsx::L1955 "Tab on an incomplete datetime…" | DELETE | DateTimeEditor and DateEditor are the same PickerEditor over SegmentShell (Date.tsx:115-121), so L1936 covers it. |
| grid/Grid.test.tsx::L1963 "leaving an incomplete datetime…" | DELETE | Same reason; L1944 covers it. |
| grid/Grid.test.tsx::L2161 "a click on it does not select the cell…" | DELETE | L2172 makes the same assertions after click, click and double-click. |
| grid/Grid.test.tsx::L2220 "Ctrl+Enter in the long-text editor still commits" | DELETE | Commit-once is in L807. Its "`rowOf` not called" check cannot fail: notes is not a relation (relatedOf, cells/Relation.tsx:40-44). |
| grid/Drawer.test.tsx::L126 "renders an editor under the fields" | DELETE | The editor slot is proven by Grid L1177/L1186 (DeleteRow, Grid.tsx:356) and by the matrix Panel (Matrix.tsx:645). This test only adds a wrapper class. |
| grid/Drawer.test.tsx::L174 "closes on Escape" | DELETE | The second Escape in L80 asserts the same onClose. |
| grid/Drawer.test.tsx::L624 it.each "says a refused upload with %s in Dutch" (×5) | DELETE | Reads back the FILE_REFUSALS table (Drawer.tsx:241-250) with copy nobody approved. The mechanism is proven by L654's bad_file_type row. |
| grid/cells/Text.test.tsx::L33 "floats over the sheet anchored to the cell…" | DELETE | The anchor class is implementation, and the portal is React Aria's. "Keeps the cell's own look" is field-contract.md:58, which is marked "invented — to approve". |
| grid/cells/Text.test.tsx::L42 "carries data-editor on the popover…" | DELETE | Keys reaching the sheet are proven by Grid L822 (Escape), L832 (↓) and L840 (Tab). |
| grid/cells/Text.test.tsx::L49 "drafts what is typed, newlines kept" | DELETE | Grid L807 writes `'Twee veggie\nEén glutenvrij'`. |
| grid/cells/Select.test.tsx::L61 "keeps an undeclared option neutral" | DELETE | Same `toneOf` null path as L31 (cells/tones.ts:24-26). |
| grid/cells/Select.test.tsx::L107 "the editor root carries data-editor" | DELETE | Not named in react-aria plan:127. Key routing is proven by Grid L393 and L414. |
| grid/cells/Date.test.tsx::L91 "the same for a moment: 9 then 10…" | DELETE | L84 goes through the same PickerEditor and SegmentShell. The fix (e5cd27a) was in that shared code. |
| grid/cells/Bool.test.tsx::L22 "a click flips it once" | DELETE | Only counts onToggle calls. Grid L860 proves one `{paid:true}` write through the real cell. |
| grid/cells/Links.test.tsx::L198 "asks before removing a person who left the default state…" | DELETE (move one line) | The ask-then-remove flow is L168 and the question text is L149. |
| grid/cells/RelationPicker.test.tsx::L36 "without candidates, it is the plain search" | DELETE | Covered by Relation.test.tsx:88 (plain list) and :68 (no Iedereen tonen). |
| api.test.ts::L242 setDisplay "rejects with the engine's refusal" | DELETE | Same `request()`/`refusal()` path (api.ts:33-37, 65-77) as L144. |
| api.test.ts::L249 describe('prefs') "starts from no prefs…" | DELETE | Pins a stub (api.ts:386-393). step-0a/wp-assumptions.md:26 says "prefs stay out of scope". It could only fail if prefs were built. |
| api.test.ts::L333 "rejects with the engine's unknown_view and not_owner" | DELETE | Same as L144. |
| api.test.ts::L476 "a 409 in_use reaches the store with the engine's by" | DELETE | L485 asserts the same pass-through plus the filtering. |
| api.test.ts::L592 "reject with the not-found the engine answers" | DELETE | Same as L152 (a non-JSON answer becomes unknown plus the status, api.ts:36). |
| api.test.ts::L725 "a via-title record is titled by the engine…" | DELETE | records() filters on row.title for every source (api.ts:264-269). Covered by L183 and engine.test.ts:309. |
| grid/Grid.test.tsx::L355 "the listbox opens on the option the opening letter picks" | DELETE-CONFLICT | Same behaviour as L344 (`v` opens on Voorstelling; cells/Select.tsx:37-43). |
| grid/cells/Date.test.tsx::L114 "the editor root carries data-editor" | DELETE-CONFLICT | Checks an attribute. The behaviour it serves is proven by Grid L1896, L1983, L2007 and L2028. |
| grid/cells/Links.test.tsx::L118 "chips flow inline and the box caps at two lines…" | DELETE-CONFLICT | Checks structure and a class only. The cap is CSS, and the chip list repeats L90. e2e chips-fit (CHECKS:113) measures the box. |
| grid/cells/Links.test.tsx::L127 "a chip's remove button names the person" | DELETE-CONFLICT | L134, L158, L168 and L198 all find the button by "Jan/Lotte verwijderen", so the name is already asserted. |
| grid/cells/Relation.test.tsx::L79 "the input has the column's accessible name" | DELETE-CONFLICT | Every `picker()` lookup asserts the name (Relation.test.tsx:37). Focus is implied by Grid L729/L741. The placeholder is unapproved copy. |
| grid/cells/Relation.test.tsx::L105 "Escape cancels" | DELETE-CONFLICT | Grid L760 is the stronger case (Escape after typing). |
| grid/store.test.ts::L596 "a refused update reverts the cell and keeps the writer's message" | DELETE-CONFLICT | Same setup and same apply path (store.ts:274-277) as L63. |
| grid/store.test.ts::L697 "writes a new rank as a change of position" | DELETE-CONFLICT | The store has no `position` case (grep finds none), so this repeats L35 and L132. |
| engine.test.ts::L99 "skin calendar maps to type calendar" | DELETE-CONFLICT | One mapping line (engine.ts:407) already covered by L608 (matrix) and L345 (table). |
| api.test.ts::L467 "a 422 reaches the store as {code:'refused', message}" | DELETE-CONFLICT | Same path as L144, and it never touches a store. |
| grid/columns.test.ts::L202 "gives the Tijd column room … 184px … 24px … 8px" | DELETE-CONFLICT | Restates `RANGE_WIDTH` (columns.ts:56). jsdom cannot measure, and e2e planning-details proves the fit. |
| time group: grid/Grid.test.tsx::L424, L463, L471, L481, L489; grid/columns.test.ts::L70 and the `start.fromText('7.30')` line at L172; grid/cells/dates.test.ts::L16 | DELETE-CONFLICT | No production path reaches the time kind. columns.ts:109 needs `Field.description` to contain "HH:MM", and nothing outside the fixtures sets it (the adapter at engine.ts:138,158 never does). step-0a/wp-assumptions.md:54 already says it "never matches". Delete these together with the code, or keep both. |
| grid/Drawer.test.tsx::L640 it.each "says a refused delete with %s in Dutch" (×2) | REWRITE | See below. |
| grid/Drawer.test.tsx::L654 it.each "says a refused upload in Dutch: %o" (×3) | REWRITE | See below. |
| grid/columns.test.ts::L19 "gives the column ids the shared fixture names, the ones Arrangement::ids() mirrors" | REWRITE | See below. |
| grid/newRow.test.ts::L348 "names the required fields the grid cannot fill…" | REWRITE | See below. |
| grid/cells/Badge.test.tsx::L18 | KEEP | Asserts a class string. |
| grid/cells/Inherited.test.tsx::L127 | KEEP | Asserts classes. |
| grid/cells/Select.test.tsx::L15, L23, L31, L38, L50, L55 | KEEP | Assert tone classes. |
| grid/cells/Links.test.tsx::L71 | KEEP | Asserts state tone classes. |
| grid/cells/Text.test.tsx::L57 "Cmd+Enter commits the draft and moves down" | KEEP | Looks like a duplicate of Grid L807 but is not. |
| grid/cells/Bool.test.tsx::L15 "out of the Tab order" | KEEP | |
| grid/cells/Relation.test.tsx::L169 "keeps the list open while its scrollbar is dragged" | KEEP | Asserts a mechanism. |
| grid/Drawer.test.tsx::L42 `svg.lucide-users` | KEEP | Asserts a library class. |
| grid/Drawer.test.tsx::L80 `nv-drawer--wide` | KEEP | Asserts a class. |
| grid/Grid.test.tsx::L112 row numbers | KEEP | |
| grid/Grid.test.tsx::L135 scope chip, no sort chip, Kolommen icon | KEEP | Tests ChipBar from inside Grid.test. |
| grid/Grid.test.tsx::L150 regroup, `nv-th--sorted` | KEEP | Asserts a class; half of it is a duplicate. |
| grid/Grid.test.tsx::L1427 exact list of bar buttons | KEEP | |
| grid/Grid.test.tsx::L1831 Tijd range, `.nv-time__end`, `.nv-blank` | KEEP | |
| grid/store.test.ts::L819, L840, L856 listener counts | KEEP | Look like call-count tests. |

### KEEP evidence, one line per point of the bar
- **Badge L18**
  - Decided: SPEC.md:54 (badge "when above 0 and nothing at 0"); step-3 plan:461 fixes `nv-badge nv-badge--${tone}`.
  - Can disagree: the counts and the tone come from the declaration.
  - Outcome: text, aria-label "3 Conflicten", empty at 0 and null.
  - Seam: `Display` with a real `columnsFor` column (cells/index.tsx:168).
  - Can fail: drop the `>0` guard.
  - Audit rule: lowest seam; e2e badge-clears does not test 0/null.
- **Inherited L127**
  - Decided: SPEC.md:297 ("inherited value greyed … own value solid"); named in virtual-columns plan:136.
  - Can disagree: "via tourstop" comes from the declared `via`.
  - Outcome: what renders.
  - Seam: `Display`.
  - Can fail: remove index.tsx:141-150.
  - Audit rule: Grid L516 tests only the optimistic flip.
- **Select L15-L55**
  - Decided: field-contract.md rule 3, "Source: owner"; SPEC.md:54 `tones`.
  - Can disagree: tones come from the declared or default table.
  - Outcome: the class is the only tone visible in jsdom.
  - Seam: `SelectCell`.
  - Can fail: L55 fails if `toneOf` precedence flips.
  - Audit rule: these are the only tests of `toneOf` precedence.
- **Links L71**
  - Decided: field-contract.md to-many row ("names … in their state's tone … all names on hover"); step-3f `filled`.
  - Can disagree: tones and 3/3 come from the link declaration.
  - Outcome: text, title and classes.
  - Seam: the Grid harness.
  - Can fail: yes.
  - Audit rule: lower seam than e2e people-colours-and-overflow (CHECKS:63).
- **Text L57**
  - Decided: field-contract.md:36 ("Ctrl/Cmd+Enter commits") and "Enter commits and moves down".
  - Can disagree: the move comes from the contract.
  - Outcome: `onCommit` is the editor's only output to the sheet (cells/props.ts:45).
  - Seam: the editor as the sheet mounts it.
  - Can fail: drop `metaKey` at Text.tsx:128.
  - Audit rule: the only metaKey test of LongTextEditor. Grid L807 uses ctrlKey, and Drawer L226 tests a different editor (drawer/Note.tsx).
- **Bool L15**
  - Decided: field-contract.md boolean row ("flipped in place"); the sheet owns Tab (keys.test.ts:40-48).
  - Can disagree: yes.
  - Outcome: `tabIndex` and `checked`.
  - Seam: `BoolCell`.
  - Can fail: remove `excludeFromTabOrder`.
  - Audit rule: nothing else checks it.
- **Relation L169**
  - Decided: copied guard from baseline (7ede61a).
  - Can disagree: yes.
  - Outcome: a mechanism, but the real outcome (a scrollbar drag) cannot happen in jsdom.
  - Seam: the picker inside Grid.
  - Can fail: remove `keepFocus` (RelationPicker.tsx:159).
  - Audit rule: no e2e covers it.
- **Drawer L42**
  - Decided: SPEC.md:54 `icon`; step-3e plan:50.
  - Can disagree: the icon comes from the declared `icon: 'users'`.
  - Outcome: the lucide class is the svg's only identity in the DOM.
  - Seam: Drawer with SchemaContext.
  - Can fail: yes.
  - Audit rule: unique.
- **Drawer L80**
  - Decided: e2e drawer-anatomy "breed" (CHECKS:227), and Escape narrows before it closes.
  - Outcome: the class is the only width signal in jsdom.
  - Can fail: yes.
  - Audit rule: it also covers L174.
- **Grid L112**
  - Decided: grid-ux/spec.md:81 (Stefan, 2026-10-07, a row-number column); grid-ux/review.md:42.
  - Outcome: numbers before and after folding, `aria-hidden`.
  - Can fail: yes.
  - Audit rule: unique.
- **Grid L135**
  - Decided: grid-toolbar plan:122-123 ("The bar has no sort chip." / "Kolommen is an icon button named "Kolommen" after the row count."); dagplanning spec R4 (the scope chip cannot be removed).
  - Outcome: what renders, with the count coming from the Grid's `onShown`.
  - Can fail: yes.
  - Audit rule: ChipBar.test.tsx:199 checks slot order only. It could move there.
- **Grid L150**
  - Decided: grid-toolbar plan:124 ("A sorted header carries the class `nv-th--sorted`").
  - Can fail: yes.
  - Audit rule: its regroup half repeats ChipBar.test.tsx:139. Harmless.
- **Grid L1427**
  - Decided: Stefan, 2026-10-03 (in its own name), and "grid toolbar unchanged everywhere".
  - Outcome: the bar's button names.
  - Can fail: yes.
  - Audit rule: App.test.tsx:752 pins the matrix bar, a different skin.
- **Grid L1831**
  - Decided: field-contract.md datetime row ("a range shows start and end"); step-3d plan:65 names it as the regression guard.
  - Outcome: the muted end and the blank fact are only visible as these classes.
  - Audit rule: columns.test.ts:194 and :214 test the model side; this is the render side.
- **store L819, L840, L856**
  - Decided: step-3f plan:306 (66 renders on a 30-card drop before coalescing).
  - Can disagree: 2 notifications per step is the coalescing contract.
  - Outcome: the count is what a `useSyncExternalStore` subscriber sees.
  - Can fail: remove the `quiet` sets (store.ts:274, 277).
  - Audit rule: unique.

### REWRITE evidence and replacements
- **Drawer L640 (it.each ×2)**
  - Decided: attachments plan:259 ("A refused upload shows the Dutch message"), and the delete path shares `fileRefusal`.
  - Fails the bar because: both strings are read-backs of FILE_REFUSALS with unapproved copy, and `forbidden` repeats L624.
  - The rest holds: outcome, seam and can-fail.
  - **Replacement:** one case only. A refused delete with `unknown_attachment` shows an alert that is not the engine's message "unknown attachment".
- **Drawer L654 (it.each ×3)**
  - Decided: attachments plan:250-251 approves the 415 and 413 Dutch copy, and `body_too_large` interpolates `max_mb` (Drawer.tsx:253).
  - Fails the bar because: the `storage_full` row reads back unapproved copy.
  - **Replacement:** drop the `storage_full` row. Keep bad_file_type, body_too_large and the `onBatch`-not-called assertion.
- **columns.test L19**
  - Decided in part: a view column the model no longer has must drop out. No other test covers this (grep for "ghost").
  - Fails the bar because:
    - The expected ids are a snapshot from a PHP mirror (views-columns.fixture.json `_about`: "Saved/Arrangement.php ids()"). That PHP side is not in this repo.
    - The port is done (step-0a/wp-assumptions.md:63).
  - **Replacement:** `expect(columnsFor(activity, { ...planning, columns: ['title', 'ghost', 'date'] }).map((c) => c.id)).not.toContain('ghost')`.
- **newRow L348**
  - Decided: newRow.ts:7 `missing` ("+ New says why it is off").
  - Fails "a caller's seam": type `'image'` never comes out of the adapter (engine.ts:138, 158).
  - **Replacement:** the same assertion with `poster: { type: 'json', label: 'Affiche', required: true, fact: false }`. A non-nullable json column is required (engine.test.ts:147-156) and cannot be filled (newRow.ts:9, 16).

### DELETE-CONFLICT: the governing lines, quoted
- **Grid L355:** specs/react-aria/plan.md:127 — "…"Tab commits and moves right", "the listbox opens on the option the opening letter picks"."
- **Date L114:** specs/react-aria/plan.md:95 — "- "the editor root carries data-editor"."
- **Links L118 and L127:** specs/react-aria/plan.md:151 — ""chips flow inline and the box caps at two lines" (the box has class `nv-chosen` …; here: chips render in one `TagGroup` `role="grid"`) … "a chip's remove button names the person"."
- **Relation L79 and L105:** specs/react-aria/plan.md:139 — "…"Delete in an empty search clears, unless required"; "Escape cancels"; "the input has the column's accessible name"."
- **store L596 and api L467:** specs/step-0b/plan.md:154 — "`a 422 reaches the store as {code:'refused', message}`. `store.test.ts`: `a refused update reverts the cell and keeps the writer's message on it`"
- **store L697:** specs/step-3f/plan.md:138 — "`apply({ field: 'position' })` with a new rank writes"
- **engine L99:** specs/step-3/plan.md:420 — "`skin calendar maps to type calendar and back`."
- **columns L202:** specs/step-3f/plan.md:78 — "| Tijd width | `columns.ts` WIDTH / `inDays` | unit · `grid/columns.test.ts` | planning-details, date-editors-fit (updated) |". Also :223 — "`columns.test.ts`: that column's default width is at least the measured width plus the cell's padding".
- **Time group:**
  - specs/react-aria/plan.md:40 — "| Date, datetime, time editors + `dates.ts` … | unit · `grid/Grid.test.tsx` (sheet seam: commit, cancel, click) …"
  - :69 — ""reads a typed time the way a hand types it" types `930` into the segments and expects `09:30`"
  - :87 — "`toTime('09:05')` round-trips to `'09:05'`"
  - specs/CHECKS.md:143 — "| Time cell editor (no source serves a time column yet) | auth | — | | react-aria | |"
  - Against them: specs/step-0a/wp-assumptions.md:54 — "a time column is detected by the ntdst-core REST field description containing `HH:MM` | … deferred: none in 0a — never matches".
- No `ARCHITECTURE-INVARIANTS.md` exists, so none of these can become an invariant grep.

### Assertions to move before the DELETEs
- **Grid L360 → Grid L374:** after `openKind('Enter', 'Repetitie')`, add `expect(focused().textContent).toBe('Repetitie')`. This keeps "Enter opens on the current option".
- **Grid L1411 → ui/Toolbar.test.tsx:88:** add `expect(screen.getByRole('status').getAttribute('title')).toBe(error.message)`.
- **Links L198 → Links L168:** add one press of the dialog's Annuleren button, then `expect(actions.remove).not.toHaveBeenCalled()`. L168 currently proves only Escape.
- No other DELETE carries an assertion of its own. The covering tests are named in each row.

### Support code that goes dead
- **Grid.test.tsx:66:** the `labels` helper, used only by L96.
- **Grid.test.tsx:1922-1923:** `timed` and `timedRows`, plus the `moment` branch of `halfTyped` (1925-1930). Used only by L1955 and L1963.
- **api.test.ts:2:** the `prefs` and `savePrefs` imports.
- **If columns L19 is rewritten:**
  - `fixtureModel` in fixture.test-support.ts:16-18.
  - The fixture's `model`, `fields`, `ids` and `table.lookups`/`rollups` keys. matrix/columns.test.ts:24-28 still reads `table` and `matrix.names`/`keys`.
  - views-columns.fixture.json `matrix.refused` is already read by no test.
- **If the time group goes:** the HH:MM `description`s in grid/calais.test.data.ts:11-12, and the Grid.test.tsx time helpers (L442-461).

### Findings outside the brief
1. **Production code no caller reaches (the time kind):**
   - The code: columns.ts:109 and :199, cells/Time.tsx, toTime/fromTime in cells/dates.ts:34-40, and the time branches in cells/index.tsx:31-32 and :56-57.
   - Only the fixture makes it reachable.
   - AGENTS.md says "not stubbed, not 'prepared for'".
2. **Other field types the adapter never produces:** `email`, `url`, `html` and `image` still sit in columns.ts `kindOf` and newRow.ts:9 `TYPED`.
3. **Prefs stub:**
   - `prefs`/`savePrefs` (api.ts:386-393) are stubs.
   - App.tsx:232 loads the constant, and useSavedViews.ts:57 runs a debounced no-op save.
4. **Assertions that cannot fail:**
   - Grid.test.tsx:105: the `group-foot` testid exists in no source.
   - Grid.test.tsx:2234: `rowOf` is checked on a cell that is not a relation.
   - Grid.test.tsx:1317 tests the test's own `said` helper.
5. **Stale governing lines:**
   - CHECKS.md:144, "Long text cell editor (no source serves a textarea column yet)", has been stale since step 3f: `long: true` now gives a textarea (engine.ts:158), and notities is a long column (CHECKS:242).
   - fixture.test-support.ts:5 and the fixture's `_about` name a PHP `Arrangement.php`/`ArrangementTest` that is not in this repo.
   - step-3d plan:20/65 cite `Grid.test.tsx:1701`; that test is now at :1831.
6. **Overlap across tiers:**
   - e2e/grid-ux.spec.ts:755-762 (`read-limit-cut-bar-and-foot`, registered at CHECKS:48) repeats Grid.test.tsx:913 and its sibling's bar count at :746.
   - It also asserts the same line twice (:759-760).
   - It is a DELETE-CONFLICT for whoever audits the e2e slice.
7. **Removed query still used in fixtures:**
   - api.test.ts:33, engine.test.ts:249 and store.test.ts:609 use `dagplanning` as their generic mapped-query example.
   - SPEC.md:320 says that query was removed.
   - Harmless, but misleading.
8. **English accessible name:**
   - The ⋯ button's accessible name is English, "More actions" (i18n.ts:217), next to the Dutch title "Meer acties".
   - Grid.test.tsx:1323 pins it. This may be deliberate.
