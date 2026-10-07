# dagplanning review (2c3f733..afb5b61)

Whole-branch review (most capable model) and security-sentinel, then one fix pass (6614ed4).

## Fix pass
- I1, the removal question took no keyboard: it now focuses Annuleren, and Escape keeps the person. RED→GREEN in Links.test.
- I2, docs/SPEC.md was missing `of` and the tree: the lines are added to the uncommitted diff (Query row, Skin needs sections, Sidebar paragraph).
- Draft row, regraded from minor: Mensen on a draft row offered people and failed with "Activiteit bestaat niet.". It is now not editable there. RED→GREEN.
- Security L2, threat 2 was untested as an owner: a fixture link (platen over koppel.plat_id) proves an owner gets only the target's title. RED→GREEN.
- The planners-only message says tourstops. No test: it is unreachable through the API.
- Gate after the pass: `bun run gate` exit 0 (packages 1081, grid 739, e2e 94/94).
- Deferred minors:
  - a range's label has no year;
  - the SPEC links line omits `key` and the /rows omission;
  - `display: contents` on the chosen list;
  - security L1 (Number() coercion) and L3 (single-flag public tests).

---

# Final whole-branch review: feature/dagplanning (2c3f733..afb5b61)

Reviewer: fresh context, read-only. Read in passes: engine + theatre source, the grid's links / period / tree code, the tests behind each Review Focus line, the people-tags e2e, the `docs/SPEC.md` working-tree diff, and the ledger.
Commands run: `bun run check` (exit 0, 2 known biome warnings), `bun test packages scripts` (1080 pass, 0 fail), `cd apps/grid && bunx vitest run` (737 pass). I did not run the e2e (I was told not to). The ledger records 94/94 at afb5b61.

## Strengths
- **Engine `links` is generic and narrow.** `pointingAt` (packages/engine/src/rows.ts:121) is pulled out of `cellsOf`, so the matrix's cells and the new links share one chunked, scoped, soft-delete-aware read. `linkOf` (rows.ts:166) only lets `id, target, title, state` leave. `linksOf` skips a link dataset the caller cannot read. `servedLinks` (app.ts:122) follows the same rule. The engine holds no domain word (`bun run check` is green; the fixture uses koppel/merk/stand).
- **`checkLinks` (validate.ts:123) covers every declaration error the plan lists.** That is the dataset, the key relation (on a dataset and on a query through `creates`), target, state, a name clash and a column named `links`. Each one has its own test in links.test.ts.
- **The threat tests assert by id.** Threat 1 (links.test.ts:209) shows another project's koppel is absent by id. Threat 5 (:173) shows an owner's `/schema` has no `merken`. The 600-parent chunk test (:234) covers the chunk boundary.
- **The grid reuses what exists.** People are added and removed through the existing `POST`/`DELETE /rows/toewijzing`, so `checkAssignee` and the delete order stay authoritative. The e2e shows the stale-pick refusal. History `push` and `forget` (App.tsx:309,318) match how a row delete behaves.
- **Period.** `fromHash` keeps the old `#from=` landings and honours a `to`. `step` covers week, month and span. The matrix clamp (App.tsx:209) is one memo. The Van–tot draft with Toepassen avoids a read on every keystroke.
- **The `--seed-missing` cleanup is safe.** `removeUndeclared` (seed-missing.ts:153) only touches `SYSTEM_OWNER` views. Only seeds are system-owned (`migrate.ts:122`), so a user's or an imported view is never removed, and a public one is left alone and named.

## Issues

### Critical (Must Fix)
None.

### Important (Should Fix)

**I1. The remove confirm can't be answered from the keyboard. Backspace or × on a confirmed person leaves focus nowhere.**
- File: apps/grid/src/grid/cells/Links.tsx:79-90 (the `asking ?` branch replaces `RelationPicker`)
- **Input:** in Dagplanning, open Mensen with Enter. In the empty search press Backspace while the last person is `bevestigd`. The same happens with a click on a bevestigd person's ×.
- **What happens:** `setAsking` unmounts the picker, which held focus, so `document.activeElement` becomes `<body>`. The alertdialog's buttons never get focus. The grid's keys sit on `<table onKeyDown>` (Grid.tsx:308), so Escape and Enter do nothing, and Tab starts at the top of the page. A keyboard user who just used the owner-designed Backspace path gets a question they can only answer with the mouse.
- **Tests:** none cover this. Links.test.tsx tests the confirm by click only, and the people-tags e2e clicks Annuleren.
- **Fix:**
  - Focus Annuleren when the confirm opens (the safe default for a final delete).
  - Handle Escape on the dialog as Annuleren and Enter on Verwijderen.
  - After either one, the picker remounts and refocuses its search, as it does now.
  - Add one vitest: Backspace on a bevestigd last person, then Escape, removes nothing and the search has focus again.

**I2. The `docs/SPEC.md` working-tree diff leaves out R5's engine shape and its new refusal.**
- File: docs/SPEC.md, working tree (the Query row, the Skin needs row with `sections`, and the new Sidebar paragraph)
- **What the code does:** it adds `of?: string` to `QueryDecl` (declare.ts:116). `validateDomain` refuses an unknown `of` dataset (validate.ts:80). It refuses a section that lists a query (validate.ts:269), which a domain that passed validation before this branch would now fail. `/schema` serves `of` only to a reader of that dataset (app.ts:103).
- **What the SPEC diff says:** none of this. Its Sidebar paragraph still reads "a tree of the sources … each with its saved views under it", which is no longer how a query with `of` is placed. AGENTS.md makes the spec the contract ("if this file and the spec disagree, the spec wins").
- **Effect:** the next agent reading the spec would not know `of` exists, and could add a query to a section and hit an undocumented refusal.
- **Fix (spec text only):**
  - Query row: "A query may declare `of: <dataset>`, the dataset it reads; `/schema` serves it only to a reader of that dataset, and the grid lists the query's views under that dataset."
  - Skin needs / `sections`: "… lists datasets only; a section that lists a query is refused."
  - Sidebar paragraph: "a query's views sit under the dataset it reads (`of`), after that dataset's own; a query without `of` is a node of its own."

### Minor (Nice to Have)

**M1. A range's label has no year, so stepping a span can show the same text.**
- File: apps/grid/src/ui/Window.tsx:92
- `formatWindow` prints "d mmm – d mmm" for a range.
- **Input:** Van–tot 2026-01-01 to 2026-12-31 (not one calendar month), then ›.
- **What happens:** the chip still reads "1 jan – 31 dec" while the rows are 2027's. A range across New Year, such as "21 dec – 20 feb", also gives no year.
- **Fix:** add the year to either end when the two ends are in different years, or when the range is not in the current year.

**M2. A links cell on the draft row is editable, and adding a person to it is refused with a confusing message.**
- File: apps/grid/src/ui/App.tsx:304-311 and Grid.tsx:139
- **Input:** "+ Nieuw" in Dagplanning (if the draft row shows the Mensen column), then pick a person.
- **What happens:** `POST /rows/toewijzing { activiteit_id: -1 }` gets the toast "Activiteit bestaat niet.", and `repaint` reads `rowOf(…, -1)`, which finds nothing.
- **Fix:** make a links column not editable on `row.id === DRAFT`, or have `links.add` return early for the draft.

**M3. R6 misses one writer message, which is probably unreachable.**
- File: packages/theatre/src/writers.ts:213
- `forPlanners(…, 'speelreeksen')` still builds "Alleen de planning wijzigt speelreeksen." R6 says the writers' messages say Tourstop.
- An owner probably gets a 404 on speelreeks before the writer runs (speelreeks declares no owners), so in practice nobody sees it.
- **Fix:** change the word to `'tourstops'`.

**M4. The SPEC links line under-describes what is served.**
- File: docs/SPEC.md, working tree (Dataset row)
- `/schema` also serves the link's `key` (the Task 3 ruling; the grid needs it to create), plus `label`, `item`, `dataset` and `target`.
- `/rows` leaves out a link the caller cannot read entirely, rather than serving an empty list.
- The Dataset row names only `target_dataset` and the state.
- **Fix:** one clause covering both.

**M5. The chosen names may lose their list role for assistive technology.**
- File: apps/grid/src/ui/app.css (`.nv-chosen { display: contents }` on the `<ul>`)
- On some engines (Safari, historically) `display: contents` on a list drops its list role.
- **Fix:** if this matters, make the `ul` the flex-wrap container itself instead of using `display: contents`.

## Review Focus, line by line
1. **Threat 1 (owner sees only its own link rows): verified.** `linksOf` reads with `scopeOf(actor, linked)` (rows.ts:189). links.test.ts:209 shows another project's koppel on the same taak is absent by id. In theatre, toewijzing is owned by `persoon_id`. Dagplanning declares no owners, so an owner gets a 404 there anyway.
2. **Threat 5 (`/schema` omits an unreadable link): verified.** `servedLinks` checks `readable(actor, linked)` (app.ts:124). links.test.ts:173 tests it, and `/rows` also leaves the link out (the Task 3 ruling).
3. **Soft-deleted link vanishes; remove final; non-default asks; add undone by one undo: verified, with I1.**
   - Soft-deleted: `pointingAt` filters `deleted_at`, tested at links.test.ts:181.
   - Remove is final: `history.forget` (App.tsx:318).
   - Asks when not the default: Links.tsx:71, compared against the served `state.default` (`uitgenodigd`). Vitest and e2e cover it.
   - Undo of an add: e2e people-tags. The store reloads for a step on another model.
   - The confirm can't be reached from the keyboard: see I1.
4. **Clearing Locatie writes null to the activity and shows the speelreeks venue grey; never writes the speelreeks: verified.** writer.test.ts "clearing dagplanning locatie" asserts `locatie_bron` goes back to `speelreeks` and the speelreeks row is byte-identical. The mapping is `writesActiviteit('locatie_id')` with `inherited` kept. The ledger notes this test would pass without the change (deferred).
5. **Matrix never offers Alles; reload keeps the period; New Year ISO week: verified.**
   - `unbounded = view?.type !== 'matrix'` (App.tsx:208).
   - Period.test "offers Alles only where the skin is unbounded".
   - e2e period-chip checks the matrix menu has no Alles and that a reload keeps the month.
   - Period.test "next week crosses New Year into ISO week 1".
   - A matrix under Alles or a range over 92 days reads the current week (ruled).
6. **Fiche renders no Periode chip and nothing new: verified.** grid-ux.spec.ts:650 asserts `group 'Periode'` has count 0. Fiche declares no date, links, `of` or sections, so the new section refusal does not touch it.
7. **A saved arrangement with Mensen saves; no sort, group or filter: verified.**
   - `hasField` accepts a link name in `visible_fields` only (views.ts:42,153).
   - Sort and group stay on `hasColumn` and return 400, tested at links.test.ts:270,280; `GET /rows` filter is tested too.
   - Grid side: `column.sortable = false`, `GROUPABLE` excludes `links`, and `filterFields` leaves it out (Links.test.tsx).
   - `fieldsOf` includes link names, and engine.test round-trips them.
   - The e2e copy keeps Mensen after Locatie.

## Owner-requested work outside the plan
- **855e701 (numeric/boolean filter test):** test only, sound.
- **63f3b6f (Tourstop):** labels, `new_label`, column label, inherited option label "Tourstop" (so "via tourstop"), seeded view renamed, two writer messages, Planning order. M3 is the one leftover.
- **8699aad (`--seed-missing` removes undeclared system views):** correct and bounded (see Strengths). The SPEC working-tree diff says it. The seed batch can't be undone, which matches the rest of `--seed-missing`.

## Ledger rulings weighed
None has a worse effect on a person than the ledger states:
- **Task 0 drop-outside-block:** the person only loses a clamp.
- **Task 1 PATCH route:** the test seam only.
- **Task 2 matrix clamp:** the chip shows the week actually read, so nothing is hidden.
- **Task 2 Van–tot draft:** one extra click.
- **Task 3 `key` served, and `/rows` omission:** no new data for a reader of the dataset.
- **Task 3 link name in GET /views to an owner:** a declared name only, no rows.
- **Task 4 chosen names in the popup, no × in the display cell:** the owner's design.
- **Test regime option 1:** a full gate ran at the end.

## Declined to judge
- **Cross-tab undo/redo races.** For example, tab A undoes an add, tab B re-adds the same person, then A redoes, which could restore a duplicate past `checkAssignee`. Engine-wide undo semantics predate this branch, and the in-tab path clears redo on a new push.
- **Undoing an add after the toewijzing moved to bevestigd in another tab** (that deletes it without the confirm). This is the same pre-existing per-tab history model.
- **A query whose views are all gone becomes unreachable from the rail.** `starting` is always `[]`, and seeded system views are read-only (403), so in practice this cannot happen. R5 accepts "a new view on a query starts as a copy".
- **Pixel layout of the tags, the confirm and the period chip.** That belongs to the shakeout, not a diff read.
- **Performance of `linksOf` at the read limit.** It is chunked like `cellsOf`, and the plan sets no budget.
- **Whether `PICKER_CAP` filtering after `hide` should fetch more people.** The list shrinks when many people on the page are already chosen; "Meer resultaten" still shows. The spec doesn't address it.

## Assessment
**Ready to merge: with fixes.**

The engine shape is generic, scoped and well tested, and the plan is met. I1 is a small but real keyboard dead end in the owner's own Backspace design. I2 is spec text only. Both are cheap to fix. The rest is polish.

Counts: Critical 0 · Important 2 · Minor 5.

---

# Security audit: feature/dagplanning, 2c3f733..afb5b61 (read-only)

## Summary

**Counts: Critical 0 · High 0 · Medium 0 · Low 3 · Info 4.**

- All five threat-model mitigations exist in the code where the plan says they do.
- Each denial is tested against the refused actor: threat 1 by link-row id, threats 3 and 4 by id or declaration.
- Threat 2 has no test where an owner is the caller. This is the only gap, and it is Low.
- None of the five surfaces gave a way to read outside the caller's scope or write past a writer.
- `bun test packages scripts`: 1080 pass, 0 fail.

## Mitigation table

| # | Mitigation | Where it is | Test against the refused actor | Verdict |
|---|---|---|---|---|
| 1 | Links are read through `scopeOf(actor, linkDataset)`. A link dataset the owner cannot read is skipped. | `packages/engine/src/rows.ts:177-195` (`linksOf`, which runs `readable()` and then `pointingAt` with `scopeOf(actor, linked)`). `pointingAt` at `rows.ts:121-140` applies `scopeWhere` and `deleted_at IS NULL`. The parent ids come only from the scoped `readRows` (`app.ts:216-218`). | `packages/engine/test/links.test.ts:209-221`. The owner gets `[mine]`. `theirs` and `free` are asserted absent by id, and `merken` is absent. The editor control sees all three ids. | Holds, tested by id |
| 2 | The title is the target's title only, never its row. | `rows.ts:166-175` (`linkOf`, which returns exactly id, target, title, state). The title comes from `withLookups`/`titlesOf`. | `links.test.ts:198-207` asserts the four keys, but as the editor. No test has an owner reading a link whose target is in a dataset the owner cannot read. | Holds. Test gap (L2) |
| 3 | No new route. Writes go through `POST`/`DELETE /rows/toewijzing`, the writer and the delete order. | Grid: `apps/grid/src/ui/App.tsx` `links.add` calls `createRow(link.dataset, …)` and `links.remove` calls `removeRow(link.dataset, item.id)`. These map to `apps/grid/src/api.ts:129-133` and `:174-176`. Engine: `writes.ts` `runWrite` runs in one immediate transaction, checks scope in `currentOf`, then runs the writer, then `inUse` (`writes.ts:341-354`). `toewijzingWriter`/`forPlanners` in `packages/theatre/src/writers.ts:61-160` refuses owners and duplicates. | `packages/theatre/test/access.test.ts:91-100`: owner POST is 403, and PATCH and DELETE of `/toewijzing/1` are 403. The duplicate rule is in `parity.test.ts:71-74` and `matrix.test.ts:61-64`. | Holds, tested by id |
| 4 | `validateDomain` refuses a link with a missing dataset, a key that is not a relation back to the source, a query without `creates`, a target that is not a relation, a state that is not an options column, a link name that collides with a column, or a column named `links`. | `packages/engine/src/validate.ts` `checkLinks` (around lines 122-140), run from `validateDomain` (around line 306). `assertNames` refuses a bad link identifier (`declare.ts:182`). | `links.test.ts:69-146`. Each case asserts `[declaration, bad]`. | Holds |
| 5 | `/schema` serves a link only to a reader of its dataset. | `packages/engine/src/app.ts:122-129` (`servedLinks` with `readable(actor, linked)`), called at `app.ts:194`. | `links.test.ts:173-177`. The owner gets `koppels` but not `merken`, and no `merk` source. | Holds |

## The five surfaces

1. **Engine links.** No leak beyond id/target/title/state. Scope is applied on the link dataset, `/schema` is gated by `readable()`, and soft-deleted link rows are excluded. Public views never carry links: `views.ts:354` drops link keys from `keys`, and the public path calls `readRows` only, never `linksOf`. This is tested at `links.test.ts:293-303`. Filter, sort and group on a link are refused, because a link is not in `source.columns` (`links.test.ts:270-291`). `hasField` only widens `visible_fields`. Theatre's `dagplanning` declares no owner column, so an owner cannot read it at all (`theatre/test/grid-ux.test.ts:151`).
2. **Filter coercion** (`filter.ts:30-35`). The coerced value is still a Drizzle bound parameter, with no `sql.raw`. Scope is a separate AND term in `whereOf` (`rows.ts:29-41`), so no filter value can widen the owner scope. Coercion only applies when the left side is a declared `integer`/`real` column or `id`. Custom keys stay `numeric: false`. See L1 for loose parsing.
3. **seed-missing `removeUndeclared`** (`seed-missing.ts:152-178`).
   - The SELECT is limited to `owner_id = SYSTEM_OWNER (-1)` and `deleted_at IS NULL`. A public view, or one with a share token, is left alone (`isPublic` = `public === 1 OR share_token !== null`).
   - Each removal gets a `deleted_at` revision under the seed batch, and the whole run is one immediate transaction.
   - The only ways a view becomes owner -1 are a seed, or `migrate.ts:122` (`isSeed` matching an orphan's name and source). Views from the API get `owner_id: actor.id` (`views.ts:208`), and system views are read-only (`views.ts:168`).
   - A seed batch has kind `seed`, which is not in `UNDOABLE` (`writes.ts:453`), so the undo route cannot replay it.
   - Tests: `seed-missing.test.ts:215-247`, which covers removal with its revision and batch, public left alone, and a person's private and shared views kept.
4. **`of` on queries.** `ofOf` (`app.ts:103-106`) serves `of` only when the caller can read the dataset. Validation is `checkOf`. Tested at `declarations.test.ts:333-340`: an owner who cannot read `plat` gets no `of` and still reads the query.
5. **Grid link actions.** Writes go only through the existing REST create and delete. The confirm for a non-default state, and `hide()` for people already chosen, are UX only. The server enforces scope, the planner-only rule and duplicates. Names are rendered as React text; `apps/grid/src` has no `innerHTML` or `dangerouslySetInnerHTML`. Link metadata (`dataset`/`key`/`target`) comes from `/schema`, and changing it client-side only reaches routes the server gates anyway.

## Findings

**Critical, High, Medium:** none.

**L1. `bound` coercion uses `Number()`, which accepts more than decimal numerals.** `packages/engine/src/filter.ts:33`.
- Attack path: values like `'0x10'`, `'0b1'`, `'1e3'` and `' 12 '` are bound as 16, 1, 1000 and 12. Above 2^53 they lose precision. This is not a scope or injection bypass: the value is still bound and still ANDed with scope. It is a surprise in matching, for example `{"id":"0x10"}` matches row 16.
- Fix: coerce only `/^-?\d+(\.\d+)?$/`, and add a test that `'0x10'` does not match id 16.

**L2. Threat 2 is not tested against the refused actor.** `packages/engine/test/links.test.ts:198-207` runs as the editor.
- Gap: no test has an owner reading a link row it may see whose target is in a dataset the owner cannot read, and asserts that only `title` leaves, with no target columns. The fixture's `koppel.project_id` is both the owner column and the target, so the owner case is never exercised. The code is correct, because `linkOf` has a fixed shape.
- Fix: add a fixture link whose target points at an unreadable dataset, for example a `koppel.plat_id` target. As the owner, assert the key set is exactly `['id','state','target','title']` and that the title is the plat's title only.

**L3. The seed-removal test sets both public flags together.** `packages/engine/test/seed-missing.test.ts:229-237`.
- Gap: the test sets `public = 1` and `share_token` at once. Nothing covers `public = 1` with no token, or a token with `public = 0`, each staying. The code ORs the two, but a regression to AND would pass the test.
- Fix: two more cases, one per flag alone.

**Info (no action needed, or already ruled):**
- I1. `servedLink` sends `target_dataset` (`app.ts:116`) even when the caller cannot read the target dataset. This matches how `servedColumns` already sends every `relation` name unfiltered (`app.ts:93-94`), so it adds nothing new. Together with the ledger ruling that `/schema` serves a link's key, this is accepted.
- I2. Ledger ruling: `GET /views` may show an owner a link's declared name in a shared view's `visible_fields`. Confirmed: it is the name only, no rows. `listViews` (`views.ts:231-238`) gates on the view's source, not on the link dataset. Accepted.
- I3. Any planner can delete a confirmed (`bevestigd`) Toewijzing through the API without the grid's confirm. A delete batch cannot be undone (`writes.ts:474`). The delete is soft and recorded as a revision. This is by design: the confirm is UX, not access control.
- I4. Threat 4's residual risk: a query that declares `creates` but whose `id` is not that dataset's id would attach wrong rows. Those rows are still limited by the caller's scope on the link dataset. Theatre asserts `id = activiteit_id` (`packages/theatre/test/writer.test.ts:274`). Accepted in the plan.

## Fix order

1. L2: add the owner test for threat 2. This closes the plan's requirement that each threat be tested against the refused actor.
2. L1: use a strict numeric regex in `bound`, with a RED test for hex.
3. L3: add the two single-flag public cases to the seed-missing tests.

All three are test or one-line changes. None blocks promotion.

Files referenced: /home/ntdst/Sites/worktable/packages/engine/src/rows.ts, /home/ntdst/Sites/worktable/packages/engine/src/app.ts, /home/ntdst/Sites/worktable/packages/engine/src/validate.ts, /home/ntdst/Sites/worktable/packages/engine/src/views.ts, /home/ntdst/Sites/worktable/packages/engine/src/filter.ts, /home/ntdst/Sites/worktable/packages/engine/src/seed-missing.ts, /home/ntdst/Sites/worktable/packages/engine/src/writes.ts, /home/ntdst/Sites/worktable/packages/engine/test/links.test.ts, /home/ntdst/Sites/worktable/packages/engine/test/seed-missing.test.ts, /home/ntdst/Sites/worktable/packages/engine/test/declarations.test.ts, /home/ntdst/Sites/worktable/packages/theatre/src/writers.ts, /home/ntdst/Sites/worktable/packages/theatre/test/access.test.ts, /home/ntdst/Sites/worktable/apps/grid/src/ui/App.tsx, /home/ntdst/Sites/worktable/apps/grid/src/grid/cells/Links.tsx, /home/ntdst/Sites/worktable/apps/grid/src/api.ts