## Audit of slice EN2: engine shapes, declarations, migrations, rows, views, writes and fixtures

I only read and grepped, in `/home/ntdst/Sites/worktable-prune` at 9320fba. I ran no tests and no builds.

### Totals
- **Scanned:** all 36 slice files (8,068 lines), about 560 test blocks. That is about 800 cases once `test.each` and the loops expand (an estimate). I read every file in full together with the source it exercises. I only skimmed the byte-level fixtures in `strip.test.ts`.
- **Tests with a row:** 63.
  - DELETE: 37 blocks, about 210 lines including support code that goes dead.
  - DELETE-CONFLICT: 1 describe block (19 cases, 23 lines).
  - REWRITE: 8 (net about −25 lines and about −13 cases).
  - KEEP: 17.
- **Lines that would go:** about 255 of 8,068 (about 3%), about 70 cases.
- **Overall:** most of the slice meets the bar. The excess is in three places:
  - ten "the fixture passes" positive controls that repeat `migrate`'s own `validateDomain` call (`migrate.ts:96`);
  - the same `/schema` facts asserted in three or four files;
  - a write-guard block repeated per route.

### Dispositions

| path::test | disposition | reason (one line) |
|---|---|---|
| calendar.test.ts:68 "a valid calendar passes" | DELETE | Positive control: the beforeEach at :110 migrates the same domain, which validates it (migrate.ts:96). |
| calendar.test.ts:131-134 "refuses skin calendar on a source without calendar" | DELETE | Same branch, `skinOf` (views.ts:113), as views.test.ts:230 "a skin of calendar". |
| skins.test.ts:173-175 "a valid board, gallery and spanning calendar pass" | DELETE | Positive control: the beforeEach at :217 migrates `domainOf(itemOf())`. |
| declarations.test.ts:52 "the fixture passes" | DELETE | `schemaOf(spaced)` at :141 and :154 migrates, so it validates. |
| declarations.test.ts:342 "creates on a query: the fixture passes" | DELETE | `schemaOf(withStates())` at :353 and :455 validates the same domain. |
| declarations.test.ts:372-374 "a section listing a query is refused" | DELETE | Same rule and fixture as :92-97. Its name is also stale (see the last section). |
| declarations.test.ts:201-203 "every palette tone validates" | DELETE | Cannot fail: it loops over `TONES`, and validate.ts:69 checks tones against `TONES` itself. |
| display.test.ts:40-43 "a caller without a session gets 401" | DELETE | route-matrix.test.ts:199-210 has `none: 401` for both display rows. Auth answers before the route, so "nothing stored" holds trivially. |
| history.test.ts:232-236 "an unreadable source is 404, and unauthenticated is 401" | DELETE | route-matrix.test.ts:79-87 covers owner→plat 404 and none→401. 'nope'→404 goes through the shared `visibleSource` (history.ts:228), already covered by rows.test.ts:152-154. |
| import.test.ts:213-225 "a refused row rolls back the whole import on a file database" | DELETE | In-process rollback is :161-173. File-database rollback is :352-368, which reopens the file after the CLI exits. |
| import.test.ts:280-284 "legacy_post_id is written only where the dataset declares it" | DELETE | A PRAGMA read-back that import cannot change. A write of legacy_post_id into note would already fail :229-242. |
| lifecycle.test.ts:191-193 "the test domain is valid" | DELETE | The beforeEach at :171 migrates the same domain. |
| lifecycle.test.ts:373-375 "checkTransition: a create is no transition" | DELETE | Internal call. The caller-seam proof is :235-241 (creating into 'a', a state no transition reaches). |
| links.test.ts:97-100 "the fixture and a query that creates its key dataset pass" | DELETE | The beforeEach at :61 migrates `withQuery`, which contains the fixture. |
| lookups.test.ts:115-121 "a raw without lookup keys gets none" | DELETE | Pins internal `withLookups`/`lookupsIn` (rows.ts:106-110). No caller seam and no spec line; residual risk below. |
| lookups.test.ts:155-157 "the fixture passes" | DELETE | The beforeEach at :34 migrates it. |
| lookups.test.ts:315-320 "an unknown key stays 400" | DELETE | Same branch, `resolveKey` (filter.ts:36-38) and `parseSort` (params.ts:114), as rows.test.ts:123 and :135-136. |
| matrix.test.ts:102 "a valid matrix passes" | DELETE | The beforeEach at :204-208 migrates `full()`. |
| matrix.test.ts:262-265 "the /rows limit bounds the down rows" | DELETE | The limit is parsed once and read by `readRows` on both paths (app.ts:332-335). rows.test.ts:372-375 covers it. |
| migrate.test.ts:139-154 "creates saved_view" | DELETE | PRAGMA read-back. Every listed column is exercised through routes: views.test.ts:338-362 and :142-143, and format at seed-missing.test.ts:273. |
| migrate.test.ts:273-279 "ids continue after a rebuild" | DELETE | rebuild.test.ts:78 asserts `sqlite_sequence` is unchanged, which is the plan's named home (step-0e-migrator/plan.md:53). |
| openapi.test.ts:130-134 "plain /schema carries no OpenAPI keys" | DELETE | Same fixture and role as declarations.test.ts:162-169, which asserts `Object.keys(body)` is `['sources']`. |
| options-from.test.ts:48 "accepts the fixture" | DELETE | The beforeEach at :99 migrates it. |
| rows.test.ts:114-119 "POST /views stores a $period on the dated source" | DELETE | Covered by :105-112, which stores `$period` beside `$or` and reads it back. |
| rows.test.ts:138-139 "2001 sort keys is 400 bad_sort, not a 500" | DELETE | Same `keysProblem` branch (params.ts:99) as :140-147. The cap at 16 stops it long before SQL. |
| rows.test.ts:478-480 "a column title is carried as title on every row" | DELETE | :207-217 already asserts `title: 'een'` from a column title (same branch, rows.ts:101). |
| rows.test.ts:490-492 "offset defaults to 0" | DELETE | :204-208 (`rows[0].id` is 1 with no offset) and :483-487 prove it. |
| seed-missing.test.ts:183-189 "another user's shared view … counts as present" | DELETE | Same setup and report assertion as :154-167; the ids `[theirs]` there imply owner 7. |
| validate.test.ts:84-85 "a via title through a relation validates" | DELETE | rows.test.ts:441-447 and matrix.test.ts:59/207 migrate via-titled datasets. |
| validate.test.ts:116-132 "a relation to a dataset with a via title is refused" | DELETE | Dataset c also has the plain relation b_id, so the one loop at validate.ts:244-251 refuses both. Same as :93-109. |
| validate.test.ts:133 "the fixture domain validates" | DELETE | A test of the test helper: every `freshDb()` validates the fixture (fixture.ts:287-292). |
| validate.test.ts:162-164 "the error keeps its own name" | DELETE | Pins `this.name` (validate.ts:24). Nothing reads `.name` (grep). |
| validate.test.ts:213-216 "a valid writes target validates" | DELETE | The fixture's `note_lijst` (fixture.ts:135-146, writer :206) is the same shape and is validated by every `freshDb()`. |
| views.test.ts:251-257 "a sort of 17 keys is refused for their number" | DELETE | The status is covered by the hostile entry at :208 (POST and PATCH). The message comes from the shared `keysProblem` and is covered by rows.test.ts:140-147. |
| views.test.ts:520-536 "view writes credit the actor of the request" | DELETE | Mounts `viewRoutes` on a bare Hono (internal seam). The real route already asserts the actor at :386-389, :415-418 and :434-438. |
| dashboard.test.ts:289-302 "a timeline grouped on a non-lane is 400" | DELETE (after moving one assertion) | Timeline on a lane → 201 and timeline with no calendar → 400 duplicate skins.test.ts:227-230. Only the timeline-on-a-non-lane assertion is unique. |
| views.test.ts:268-290 "views denials: cross-site writes (attack 7)" | DELETE-CONFLICT | The write guard is app-wide (app.ts:261) and already tested, including on views (write-guard.test.ts:45-67, :59-60). But the step-0d plan names attack 7 for this file. |
| rows.test.ts:100-103 "$period on a date column reads through /rows" | REWRITE | Only asserts 200. |
| rows.test.ts:338-358 "schema lists every declared source …" | REWRITE | Its exact source list and `Object.keys(body)` line duplicate other files and are coupled to fixture growth. |
| lookups.test.ts:322-325 "history filters on a lookup" | REWRITE | Only asserts 200. |
| history.test.ts:157-166 "entries caps the entries: default 50, at most 100" | REWRITE | The default of 50 is never exercised. |
| openapi.test.ts:118-128 "a link actor gets 403, and an unknown format is 400" | REWRITE | The link half duplicates the route matrix. |
| views.test.ts:185-222 hostile POST/PATCH table | REWRITE | Five filter-compiler entries are covered three times over. |
| seed-missing.test.ts:402-418 combination loop | REWRITE | Three account-command cases hit one branch. |
| runtime.test.ts:6-9 | REWRITE | An environment check of package.json and the running Bun, not product behaviour. |
| writes.test.ts:154-160 PRAGMA foreign_keys | KEEP | |
| writes.test.ts:210-227, :438-455 exact deletable/writable maps | KEEP | |
| migrate.test.ts:70-84, :93-97, :99-121, :238-242 DDL read-backs | KEEP | |
| rows.test.ts:394-409 timing | KEEP | |
| lifecycle.test.ts:362-371 checkTransition undo mode | KEEP | |
| matrix.test.ts:179 "a valid open block passes" | KEEP | |
| display.test.ts:45-58 write guard | KEEP | |
| declarations.test.ts:256-274 icon | KEEP | |
| /schema pass-through tests: calendar.test.ts:136-140, skins.test.ts:243-252, lookups.test.ts:96-100, declarations.test.ts:187-191, :223-229, :241-247 | KEEP | |
| import.test.ts:183-188 | KEEP | |
| strip.test.ts:257-267 | KEEP | |
| find-by.test.ts (whole file) | KEEP | |
| seed-missing.test.ts:191-197 | KEEP | |
| dashboard.test.ts:363-370 | KEEP | |
| rebuild.test.ts | KEEP | |
| validate.test.ts:146-160 ENGINE_TABLES | KEEP | |

### KEEP evidence

**writes.test.ts:154-160** (PRAGMA foreign_keys)
- Decided: SPEC.md:168 "foreign keys between datasets"; step-0b/plan.md:124 names this exact test.
- Can disagree: the test turns FKs off after `migrate` (:157), so only createEngine's `PRAGMA foreign_keys = ON` (app.ts:235) makes it 1.
- Outcome: the connection state the engine serves on.
- Seam: `createEngine`, the caller's entry.
- Can fail: yes, if app.ts:235 goes.
- Lowest and unique: yes. rebuild.test.ts:80 and migrate.test.ts:252 only check after `migrate`.

**writes.test.ts:210-227 and :438-455** (exact deletable/writable maps)
- Decided: step-0b/plan.md:111 (writable) and step-0c/plan.md:115 (deletable).
- Can disagree: the maps are written by hand.
- Outcome: the `/schema` flags the grid reads.
- Seam: GET /api/schema.
- Can fail: yes.
- Unique: the only tests of these flags. The cost is fixture coupling (see the last section).

**migrate.test.ts:99-121** (`_migrations` list)
- Decided: SPEC.md:169 ("recorded with its hash in `_migrations`"); the expected list is SPEC.md:131's engine tables plus the domain's.
- Can disagree: written by hand.
- Outcome: `_migrations` rows. Seam: `migrate()`. Can fail: yes.
- Unique: validate.test.ts's list is about name reservation, not migration.

**migrate.test.ts:70-84, :93-97, :238-242** (DDL read-backs)
- Decided: SPEC.md:207 (standard columns), SPEC.md:139 (position), AGENTS.md "Queries are SQL views", SPEC.md:169 (index changes).
- Can disagree: written by hand.
- Outcome: the schema `migrate` produces; an index and a view's type can only be seen this way.
- Seam: `migrate()`. Can fail: yes.
- Partial overlap: position.test.ts:53 also pins position as the last column.

**rows.test.ts:394-409** (timing)
- Decided: step-0a/review.md:27 M2 (the server froze), fixed red to green with this test.
- Can disagree: the bound is fixed.
- Outcome: elapsed time and the result.
- Seam: the route. Can fail: yes.
- Unique: yes. Flake risk is in the last section.

**lifecycle.test.ts:362-371** (checkTransition undo mode)
- Decided: SPEC.md:81 "only the exact inverse … behind `changed_since`".
- Can disagree: the codes are written by hand.
- Outcome: the refusal code.
- Seam: internal (`checkTransition`, writes.ts:283-301). This is the lowest seam that can prove it: through undo, the `changed_since` check (writes.ts:777) fires before the refusal can be reached.
- Can fail: yes.
- Unique: the route test (:312-316) covers only the allowed inverse.

**matrix.test.ts:179** ("a valid open block passes")
- Decided: SPEC.md:54, the `open` shape.
- Can disagree: yes.
- Outcome: the declaration is accepted.
- Seam: `validateDomain`, the domain author's seam.
- Can fail: yes.
- Unique: no other test migrates `openDomain()`.

**display.test.ts:45-58** (write guard)
- Decided: SPEC.md:100; grid-ux/review.md:235 cites it as threat evidence.
- Can disagree: yes.
- Outcome: 415 and 403, with nothing stored.
- Seam: the PUT route.
- Can fail: yes, if PUT left the method list at app.ts:261.
- Unique: the only PUT case through the guard; write-guard.test.ts:23-28 covers only POST, PATCH and DELETE.

**declarations.test.ts:256-274** (icon)
- Decided: SPEC.md:66 ("null restoring the declaration").
- Can disagree: yes.
- Outcome: the `/schema` icon.
- Seam: PUT, then GET.
- Can fail: yes.
- Unique: here null restores the declared 'flag' (:272-273). display.test.ts:78-79 only restores to a null declaration.

**/schema pass-through tests** (calendar.test.ts:136-140, skins.test.ts:243-252, lookups.test.ts:96-100, declarations.test.ts:187-191, :223-229, :241-247)
- Decided: step-3/plan.md:76, step-3c/plan.md:64, step-3f/plan.md:73-75, SPEC.md:51 `hidden`.
- Can disagree: the values are written by hand.
- Outcome: the `/schema` keys the grid reads.
- Seam: GET /api/schema.
- Can fail: yes, if `servedColumn` (app.ts:106-113) became an allowlist; each test guards one key.
- Unique: one per key.

**import.test.ts:183-188**
- Decided: SPEC.md:200.
- Can disagree: yes.
- Outcome: the refused-row report.
- Seam: `importExport`.
- Can fail: yes.
- Unique: a different branch from :175-181. The target dataset's map is absent (import.ts:129-131), so a missing `?.` would be a 500.

**strip.test.ts:257-267**
- Decided: SPEC.md:64, "never stored unstripped" (fail closed).
- Can disagree: yes.
- Outcome: an unknown type throws, and not as a `StripError`.
- Seam: `strip()`.
- Can fail: yes, if `strip` passed the bytes through.
- Unique: yes.

**find-by.test.ts** (whole file)
- Decided: SPEC.md:53 (`findBy`/`findAll`).
- Can disagree: hand-written ids and messages.
- Outcome: the returned rows and the refusals.
- Seam: `contextOf` builds exactly the context a writer receives (writes.ts:269).
- Can fail: yes.
- Unique: writes.test.ts:194-203 covers only `exists`.

**seed-missing.test.ts:191-197**
- Decided: SPEC.md:51 (only system-owned seeded views are updated).
- Can disagree: yes.
- Outcome: the view row is unchanged.
- Seam: `seedMissing`.
- Can fail: yes.
- Unique: :154-167 checks ids, not content.

**dashboard.test.ts:363-370**
- Decided: SPEC.md:73 (list tile row actions).
- Can disagree: yes.
- Outcome: 201.
- Seam: POST /views.
- Can fail: yes.
- Unique: the only API positive for `set` on a writes column.

**rebuild.test.ts**
- Decided: step-0e-migrator/plan.md:48, :53.
- Can disagree: yes.
- Outcome: rows, revision and sequence.
- Seam: the routes, then `migrate`.
- Can fail: yes.
- Unique: the populated-through-routes case. A weak assertion is noted below.

**validate.test.ts:146-160** (ENGINE_TABLES)
- Decided: SPEC.md:51.
- Can disagree: yes.
- Outcome: refused and nothing created.
- Seam: `migrate`.
- Can fail: yes.
- Unique: yes, but the list is stale (see the last section).

### REWRITE evidence and replacements

**rows.test.ts:100-103**
- Problem: decided (SPEC.md:61, "resolved at read time in the server's local date"), but asserting only 200 cannot catch `readRows` passing a wrong `now`.
- Replacement:
  - Seam: GET /api/rows/taak?filter={"day":{"$period":"today"}}.
  - Action: insert a taak dated the local today and one dated a year ago.
  - Assert: the today row is in the result and the old one is not.

**rows.test.ts:338-358**
- Problem:
  - The source list at :341-352 is the same key set writes.test.ts:215-226 and :443-454 pin.
  - :357 repeats declarations.test.ts:164 and views.test.ts:451.
  - grid-toolbar/plan.md:266 shows the cost of these hand-kept lists.
- Replacement: keep :339-340 and :353-356 (kind, label, title, date, column shape, query kind). Drop :341-352 and :357.

**lookups.test.ts:322-325**
- Problem: decided (virtual-columns/plan.md:264 T3). `readIds` selects without `lookupSelect` (rows.ts:175-191), so the route matters, but asserting only 200 says nothing about which entries come back.
- Replacement:
  - Seam: GET /api/history/line?filter={"team":1}.
  - Action: PATCH line 1 (own team 2) and line 2 (inherits team 1) through the route.
  - Assert: the entries' record ids are `[2]`.

**history.test.ts:157-166**
- Problem: SPEC.md:62 says "`entries` takes 1 to 100, default 50". The default is untested anywhere (grep).
- Replacement: insert 51 batches on note 1 with `revised()`, call GET /history/note with no `entries`, and assert 50 entries.

**openapi.test.ts:118-128**
- Problem: link→403 on /api/schema is route-matrix.test.ts:63-67. Link confinement matches method and path (SPEC.md:93), so `?format=openapi` takes the same path.
- Replacement: keep :126-127 and also assert `code: 'bad_format'` (app.ts:273). Drop :119-125.

**views.test.ts:185-214** (hostile table)
- Problem: filtersOf (views.ts:119-128) is one call to the same `filterWhere` that /rows uses. Five entries duplicate denials /rows already makes:
  - 'a quoted filter key' (:187) and 'a bad custom key' (:193), against rows.test.ts:123-124;
  - 'an unknown operator' (:188), against :164;
  - 'an $in over 100 values' (:191), against :160-161;
  - '$contains on a column' (:192), against :165.
  rows.test.ts:80-98 already proves the mapping to bad_view on POST /views.
- Replacement: keep 'an unknown filter key' (:186) as the representative and drop the other five. That removes 10 cases.

**seed-missing.test.ts:402-418**
- Problem: --create-admin, --create-account and --disable-account all reach one `accountCommands.length > 0` branch (serve.ts:68 and :74).
- Replacement: keep the --import and --create-admin cases. That removes two CLI process spawns.

**runtime.test.ts:6-9**
- Problem: an environment precondition (the Bun 1.3.8 hang). It checks package.json and the running Bun, not product behaviour.
- Replacement: move `Bun.semver.satisfies(Bun.version, pkg.engines.bun)` and the floor pin into `bun run check` (scripts), and delete the test file.

### DELETE-CONFLICT
- **views.test.ts:268-290.** specs/step-0d/plan.md:69 reads: "`| Engine: saved views | /api/views routes | integration · packages/engine/test/views.test.ts — denials first (attacks 1–4, 7): status, code, saved_view + revision unchanged | view-saved-after-reload |`".
- The guard is mounted once for every write method on `/*` (app.ts:261), and write-guard.test.ts:59-60 already covers a cross-site POST /api/views.
- The repo has no ARCHITECTURE-INVARIANTS.md. A possible conversion is one write-guard test that walks `app.routes` and asserts that every registered write route refuses `Sec-Fetch-Site: cross-site` (the pattern of route-matrix.test.ts:352-361). That is for you to decide.

### Assertions to move before a DELETE
- **dashboard.test.ts:290-293** (timeline grouped on a non-lane → 400 bad_view). Move it into skins.test.ts:226-231 as `admin('POST','/api/views',{ body: view('timeline', { group_by: 'state' }) })` expecting `[400,'bad_view']`. Without it, nothing tests the `skin === 'timeline'` half of views.ts:149.
- No other DELETE carries a unique assertion. For history.test.ts:234, 'nope' goes through `visibleSource`, already covered by rows.test.ts:152-154, and route-matrix.test.ts:84-87 proves history calls it.

### Support code that goes dead if every DELETE is applied
- calendar.test.ts: the `plain` engine (:100, :111).
- history.test.ts: `anonymous` (:33, :79).
- views.test.ts: the imports `drizzle` (:3), `Hono` (:4), `Actor` (from :5), `AuthEnv` (:6), `silentMailer` (:7), `viewRoutes` (:8).
- declarations.test.ts: the `TONES` import (:12).
- lookups.test.ts: `withLookups` from the import at :17. `readRows` and `drizzle` stay used at :295.
- No fixture file goes dead. Every file under `test/fixtures/` has a consumer:
  - refusal-domain: migrate.test.ts:389;
  - seed-crash-domain and seed-refusal-domain: seed-missing.test.ts:378 and :387;
  - serve-domain: auth, record-link, service and attachments tests.
  Every dataset in fixture.ts is read by some test (grep).

### Findings outside the brief
1. **findAll's 5000 cap is untested.** The spec decides it (SPEC.md:53, "at most 5000 and refused past that"; writes.ts:238-243), and grep finds no test of it.
2. **validate.test.ts:135-144 is stale.** ENGINE_TABLES lists 8 of the 12 names in SPEC.md:51. It is missing source_display, record_link, action_token and attachment. The code is right because it derives the list from `engineTables` (engine-tables.ts:109); only the test lags.
3. **Stale test name.** declarations.test.ts:372 "a section listing a query is refused" contradicts SPEC.md:54 and :87-90 (a query without `of` may be listed).
4. **Load-sensitive tests.**
   - lifecycle.test.ts:383, :393, :405 and :415 wait for the post-commit mail with `Bun.sleep(5)`, a race under load.
   - The 2600 ms wall-clock bound at rows.test.ts:408 can go red on this box under shake-out load.
5. **rebuild.test.ts:87-89 accepts any 4xx.** The decided answer is 400 `bad_relation`.
6. **rows.test.ts:226 name mismatch.** "a null relation value gives a null lookup" actually builds a dangling relation (value 2, row deleted with FKs off). A literal null relation's lookup is never asserted on /rows.
7. **Fixture-coupled exact lists.** writes.test.ts:215-226 and :443-454, rows.test.ts:341-352, and outside the slice access.test.ts and route-matrix, all need a hand edit for every new fixture source (grid-toolbar/plan.md:266).
8. **Residual risk of the lookups.test.ts:115-121 DELETE.** If `lookupsIn` (rows.ts:107-110) broke, cells of a matrix join that declares a relation lookup would carry `lookups.<name>: null`. Theatre's toewijzing declares `productie` (theatre datasets.ts:276). It is harmless, leaks nothing, and no spec line covers it.
9. **Column with no code path.** `saved_view.format` (saved-view.ts:40) has no production reader or writer; only seed-missing.test.ts:273 sets it. SPEC.md:61 specifies it for step 4, so this is not a scope breach.
10. **Account-command coverage.** The seed-missing combination tests cover 3 of the 6 ACCOUNT_COMMANDS (serve.ts:60-67). After the rewrite they are explicitly a sample.
