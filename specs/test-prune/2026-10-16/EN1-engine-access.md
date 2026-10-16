# EN1 audit: the engine's access, auth and security tests

I ran no tests or builds. Everything here comes from reading the source in `/home/ntdst/Sites/worktable-prune` (9320fba). In the table, bare file names are under `/home/ntdst/Sites/worktable-prune/packages/engine/test/`, and `src/` means `/home/ntdst/Sites/worktable-prune/packages/engine/src/`.

## Totals
- **Examined:** 18 files (17 test files plus the `sign-in.ts` helper), about 756 test cases. 252 of those are route-matrix cells (42 rows × 6 roles). I read every file in full and skimmed nothing.
- **DELETE:** 35 rows, 50 cases, about 335 lines.
- **DELETE-CONFLICT:** 5 rows, 8 cases, about 70 lines.
- **REWRITE:** 8 rows, 10 fewer cases, about 24 fewer lines.
- **KEEP:** 12 grouped rows (suspects that pass the bar).
- **If you apply everything:** about 68 fewer cases and about 430 fewer lines. The suite also loses 7 `serve.ts` subprocess spawns and 30 uploads.
- **Governance rule I used:** a Test map row, a threat-model mitigation or a review fix line makes a test DELETE-CONFLICT. A plan's task-step list ("Step 1: Tests: …") does not, so those get a note on a plain DELETE.

## Table
| path::test | disposition | reason |
|---|---|---|
| owner-views.test.ts:157 service admin refused "in the handler" | DELETE | Bare Hono with an invented actor, not a caller's seam. Same denial through the app: service.test.ts:244-256 (PUT/DELETE for-owners → 403 forbidden, tables unchanged) and route-matrix.test.ts:178-188 |
| owner-views.test.ts:410 editor 403 on owner rows | DELETE | Asserts status only, exactly as route-matrix.test.ts:194-198 does (editor 403 on the same route) |
| record-link.test.ts:140 revoke is the version bump | DELETE | Revoke is rotate (SPEC:83); the old link → 401 is already asserted at :119. Move one assertion (below) |
| record-link.test.ts:172 service admin refused "in the handler" | DELETE | Bare Hono again. Same denial: service.test.ts:245-246 (GET and rotate → 403 forbidden, tables unchanged) |
| record-link.test.ts:359 row 'unreadable (mode 000)' | DELETE | Same branch as :358 (serve.ts:227 read failure); also fails when run as root |
| record-link.test.ts:473 accepts the declaration | DELETE | Cannot fail on its own: `migrate()` validates (src/migrate.ts:96) the same domain in beforeEach :47 |
| owner-writes.test.ts:176 the fixture is valid | DELETE | Same: beforeEach `migrate` at :106 validates it |
| owner-writes.test.ts:373 signed-in owner writes lifecycle, undoes | DELETE | "What stays as it was" characterization. Covered by lifecycle.test.ts:253 (owner transition), :312 (owner undoes its own), access.test.ts:145-148 and :154-158 (owner session gets the row, writes a column that is not owner_writable) |
| owner-writes.test.ts:383 editor writes any column | DELETE | Covered by writes.test.ts:342-345 (PATCH reply is the row) |
| lookups-privacy.test.ts:92 dataset view with lookups neither for-owners nor public | DELETE | `not_query` is decided by the source kind; same: owner-views.test.ts:109-112, public.test.ts:60-62 |
| lookups-privacy.test.ts:125 public view PATCH to a lookup key | DELETE | POST and PATCH share `viewBody` (src/views.ts:337, :347); same refusal as :117-122 |
| lookups-privacy.test.ts:137 forged public/for-owners view on a dataset | DELETE | Public half = public.test.ts:88-93. The for-owners half is refused by `no_owner_column` (item has no owners here, :41-46), the same refusal as owner-views.test.ts:114, not by the source kind its name claims |
| lookups-privacy.test.ts:148 forged for-owners view listing a lookup | DELETE | Same `forOwnersProblem` key check (src/views.ts:423) as owner-views.test.ts:278-289 |
| lookups-privacy.test.ts:157 'an owner names only listed, owner-visible keys' (9 cases) | DELETE | `holdKeys` is one `shown.includes` check (src/owner-views.ts:75-88). `per_project` has no lookups, so the lookup names are just unknown keys. Same denials: owner-views.test.ts:356-374 |
| lookups-privacy.test.ts:190 owner reads no dataset with lookups | DELETE | The name is stale since step 3 (:272 shows owners do read them). Passes only because item is unowned; same as access.test.ts:100-104, :106-122 |
| lookups-privacy.test.ts:199 validation accepts lookups on owned dataset | DELETE | `owned()` → `engineOf` → `migrate` validates `withOwnedItem()` (:50, :266). Named in a task step only (specs/step-3/plan.md:283) |
| lookups-privacy.test.ts:203 a scoped read serves no lookup | DELETE | Calls `readRows` with a scope on an unowned dataset, a state no caller reaches. Same behaviour over HTTP: :272-278. Named at step-3/plan.md:283 (task step) |
| lookups-privacy.test.ts:216 deleted target reads null | DELETE | Not a privacy test; the inherited half = lookups.test.ts:74-82. Move the plain half (below) |
| auth.test.ts:418 signed-in request reaches routes "as before" | DELETE | Characterization of auth landing. Every signed-in test covers it, e.g. route-matrix.test.ts:68-72 |
| auth.test.ts:484, :488, :490 CLI rows (subject on editor, undeclared dataset, missing row) | DELETE | Thrown inside `createAccount`, already tested at :349, :334, :339. The CLI catch (serve.ts:139-141) stays covered by the four CLI-only rows |
| auth.test.ts:261 rate_limit index on window_start | DELETE | Read-back of src/auth-tables.ts:74. The migrate half = migrate.test.ts:238. step-0e-auth/review.md:18 records the index as the L2 fix but names no test |
| actions.test.ts:224 cross-site action 403 | DELETE | Global guard (src/app.ts:261). Denial for step-1 threat 8; same denial on a step-1 route: write-guard.test.ts:27 + :45-49 (cross-site POST to undo) |
| actions.test.ts:299 owner runs an action on its own record | DELETE | Positive path next to denials. route-matrix.test.ts:127-132 owner 201. "Scoped to it" is not asserted |
| action-token.test.ts:181 link account created once per subject | DELETE | Calls an internal function. Same via the RecordLink header: record-link.test.ts:91-99. Named in a task step (step-2/plan.md:238) |
| attachments.test.ts:250 unknown kind 400 | DELETE | The streamed case at :214 + :217-222 asserts the same and that no byte is read |
| attachments.test.ts:256 row 'a newline' | DELETE | Same as streamed :215 (`a%0Ab`) |
| attachments.test.ts:406 another account's attachment batch | DELETE | Ownership check (src/writes.ts:744) runs before `undoAttachments` (:836). Same denial: batches.test.ts:77-80 |
| batches.test.ts:293 create answers batch and columns | DELETE | writes.test.ts:305-329 asserts the identical `revision.changed` list |
| public.test.ts:55 anonymous PUT share-token 401 | DELETE | route-matrix.test.ts:167-172 (none 401); auth.test.ts:310 (code and tables, same middleware src/auth.ts:299) |
| service.test.ts:146 cookie + bad Bearer 401 | DELETE | Attack-18 denial; :154-164 covers it once its one case moves (below) |
| service.test.ts:283 write guard holds for Bearer | DELETE | The guard runs before auth (src/app.ts:261 vs :266) and reads no credential (src/write-guard.ts:21-33). Same denials: write-guard.test.ts:38, :45-49. Named in a task step (step-2/plan.md:507) |
| write-guard.test.ts:81 row 'absent' | DELETE | Every write test without `Sec-Fetch-Site` covers it, e.g. :71-77 |
| write-guard.test.ts:91 body-less DELETE | DELETE | Identical to writes.test.ts:396-397 (`type: null` → `{ status: 200, body: { id: 1 } }`) |
| route-matrix.test.ts:205-210 row `PUT /sources/plat/display` (6 cells) | DELETE | Same route and identical status vector as :199-204 |
| route-matrix.test.ts:379 every row names a route and every role | DELETE | Tests the test's own table. A missing role already fails its cell (`toBe(undefined)` at :335). Residual risk: the `nope` row (finding 8) |
| route-matrix.test.ts:359 unlisted route fails | DELETE-CONFLICT | Ratchet on the test's own table against Hono's registry; quote below |
| route-matrix.test.ts:374 upload-only JSON exemption | DELETE-CONFLICT | Checks a regex against route patterns, not an outcome; quote below |
| record-link.test.ts:269 link actor confined | DELETE-CONFLICT | Same denials as the matrix link column and the owner-writes fence; quote below |
| hook-mails.test.ts:293 engine without secret refuses to start | DELETE-CONFLICT | Identical to record-link.test.ts:308-309; quote below |
| owner-writes.test.ts:333-369 the four `[an owner session]` instances | DELETE-CONFLICT | Repeat attachments.test.ts owner tests; quote below |
| write-guard.test.ts:65 Host ×4 writes | REWRITE | One global middleware (src/app.ts:241-246) |
| attachments.test.ts:224 + :296 | REWRITE | Merge two runs of 30 uploads into one |
| attachments.test.ts:515 `--files-max-gb` ×5 | REWRITE | Five spawns, two branches |
| auth.test.ts:253 refused requests write no email rows | REWRITE | Pins the key prefix `link:email:` |
| access.test.ts:106 /schema source lists | REWRITE | The editor's exact list pins every fixture source |
| owner-views.test.ts:183 DELETE clears it "and is revised" | REWRITE | Asserts no revision |
| action-token.test.ts:135 account table migrates | REWRITE | Carries declaration read-backs |
| owner-views.test.ts:356 key refusals ×10 | REWRITE | Several cases hit the same line on the same request part |

## REWRITE details
For every REWRITE row the test is decided, has hand-written expected values, asserts outcomes over HTTP or the CLI, and can fail. Each one breaks the bar in one place, named below.
- **write-guard:65.** Decided at step-0b/plan.md:48 ("for reads and writes; it stays"). Breaks the bar: the duplicate rule, because host.test.ts:10 covers reads and four routes repeat one middleware. Replace with one test: PATCH `/api/rows/note/1` with Host `evil.example` → 403 `forbidden_host`, tables unchanged (3 fewer cases).
- **attachments:224 + :296.** Decided by attachments threat 5 and SPEC:64. Breaks the bar: duplication, since both make 30 uploads and refuse the 31st. Replace with one test: 30 uploads; the 31st streamed → 429 `rate_limited` with `read.bytes === 0`; then another account's upload → 201.
- **attachments:515.** Decided by SPEC:64. Breaks the bar: `-1`, `''` and `abc` take the regex branch (serve.ts:246); `0` and the tiny value take the under-a-byte branch (serve.ts:247). Keep `abc` and `0.0000000001` (3 fewer spawns).
- **auth:253.** Decided by step-0e-auth/review.md:18 and attack 11. Breaks the bar: it pins key naming instead of the outcome. Assert that `SELECT COUNT(*) FROM rate_limit` is the same before and after the 10 refused requests (src/rate-limit.ts:31 is the behaviour).
- **access:106.** Decided by attack 7. Breaks the bar: the editor's exact list pins the fixture's source list. Keep the owner's list; replace the editor's with `arrayContaining([...mine, 'plat', 'note_lijst'])`.
- **owner-views:183.** Decided by SPEC:63. Breaks the bar: its name claims a revision it never checks. Add the assertion that the `for_owners` revision rows end `{ old: 'true', new: 'false' }`, as :100-106 does for PUT.
- **action-token:135.** Decided at step-2/plan.md:213 (the CHECK, and `kind` defaults to `'user'`). Breaks the bar: :178 (`tableDdl(account)` contains the CHECK) is a read-back of what :170-171 already prove, and :172-176 (the `.pre-migrate` copy) duplicates migrate.test.ts:352-370. Keep the old account migrating to `kind = 'user'` with its `magic_link` and `auth_session` references; theatre/test/migrate.test.ts:66-90 does not assert that.
- **owner-views:356.** Decided by step-2 attack 12. Breaks the bar: everything hits the single `shown.includes` line (src/owner-views.ts:86). Drop :358 (filter on the owner column), :364 (sort on the owner column) and :366 (group on an owner-visible column outside the view). The kept rows still cover filter, `$or`, sort and group, plus hidden, not-listed, custom and unknown keys.

## KEEP (suspect, passes)
- **route-matrix.test.ts:284 (252 cells).** Required by step-0e-auth/plan.md:130. Expected values are hand-written from the Decisions table (:25), so they can disagree with the code. Asserts status, over real credentials of every kind. It is the only test that gives every route × role a decided status; the other files' denials add code and tables-unchanged for a subset.
- **auth.test.ts:310.** Overlaps the matrix's `none` column, but adds the `unauthenticated` code, tables unchanged on writes, and `GET /api/nope` → 401 (an unknown route answers 401, not 404), which the matrix cannot express.
- **record-link:163, owner-views:149, service:235, access:172, public:49.** The matrix repeats these as status only; these add code and tables unchanged. They are named denials (step-2 threat 16; step-0e-auth threat 8). access:172 is the only code-and-tables test of an owner's view write; views.test.ts has none.
- **mailer.test.ts:30.** The outbox format `To: <email>\n\n<text>\n` is decided at step-2/plan.md:169 and read by e2e/auth.ts:76 and e2e/step-2.spec.ts:91 and :101; this is its lowest seam. Line 38 (`linkFor`) only tests the test helper and can go.
- **auth.test.ts:326.** A raw insert, but the decided rule is the DB constraint itself (step-0e-auth/plan.md:163, Stefan's ruling; SPEC:61). The outcome is the insert failing.
- **record-link.test.ts:84.** The `<dataset>.<id>.<mac>` shape and the 128-character limit are SPEC:83 decisions that websites build on.
- **`/schema` read-backs: record-link:314, actions:313 and :403, attachments:652.** SPEC:51, :64 and :81 decide what `/schema` serves; it is the engine's contract with the grid, tested at `GET /schema`.
- **write-guard:45-57, :59; auth:201; attachments:285.** One global guard, but each case is a different step's named mitigation (step-0b/plan.md:59 and :124; step-1/plan.md:61; step-0d/plan.md:51; step-0e-auth threat 5; attachments threat 6). The upload path skips the JSON checks (src/write-guard.ts:28), so its own site check matters.
- **owner-writes.test.ts:250-270 (the fence).** Covers path shapes no registered route has (trailing slash, extra segment, PATCH or DELETE on the attachments path, HEAD) against `OPEN_TO_LINKS` (src/record-link.ts:63-70).
- **batches:77, action-token:295, service:212.** All hit one check (src/writes.ts:744), but they are three named denials with different actor kinds (step-1 threat 2; step-2 threat 6; step-2 Task 11).
- **lookups-privacy:104 and :113.** A query given `lookups` through a type cast must stay inert, as decided at virtual-columns/plan.md:72 and :77. They fail if queries ever start honouring lookups.
- **batches:308.** The only test of the reserved column name `revision` (src/validate.ts:228; SPEC:53).

## DELETE-CONFLICT: the governing lines
- **route-matrix:359.** step-0e-auth/plan.md:130: "| Route × role matrix | every registered route | integration · `packages/engine/test/route-matrix.test.ts`, from `EXPECTED` in the test file plus `app.routes` | none |". And :288: "A second test lists every route Hono registered under `/api` … and fails, naming the route, if `EXPECTED` has no entry for it." This is an absence ratchet. There is no ARCHITECTURE-INVARIANTS.md, and the check needs the runtime route list, so a grep cannot replace it directly. It is what keeps the matrix complete, so keeping it is defensible.
- **route-matrix:374.** attachments/review.md:21: "| M3 | security | A later POST route shaped `/api/attachments/<word>/<digits>` would skip the JSON checks | fix: a route-matrix assertion that the exemption matches only the upload route | 86790e3 |". A behavioural replacement would send `text/plain` to every registered POST/PUT/PATCH route except the upload one and expect 415.
- **record-link:269.** step-2/plan.md:132: "| 9a. Record link, link actor, confinement, request route | `/record-links/*`, `RecordLink` header | unit · `packages/engine/test/record-link.test.ts`, `route-matrix.test.ts` (denials 9-11, 14, 15) |". The same denials are asserted elsewhere:
  - The route-matrix link column (route-matrix.test.ts:57-227) gives 403 on each of the 15 routes. `/rows/per_project` differs from `/rows/taak` (:68-72) only in the source.
  - owner-writes.test.ts:250-264 covers the fence with code and tables.
  - Line 296 of the test (PATCH → `column_not_owner_writable`) is owner-writes.test.ts:234-244.
- **hook-mails:293.** hook-mails/review.md:19: "the test asserts that refusal ('an engine without a link secret refuses to start on a dataset declaring record_link')". record-link.test.ts:308-309 asserts the same refusal.
- **owner-writes owner-session instances.** attachments/plan.md:111: "| T4 link writes | … attachment routes as owner/link, `confineLinkActor` | … `owner-writes.test.ts`, `route-matrix.test.ts` |". And :117: "T4 for owners and links". The same owner-session denials are in attachments.test.ts:324-332, :303-312, :339-355, :314-317, and route-matrix:234-249. The link instances stay.

## Assertions to move before deleting
- record-link.test.ts:145-148 (GET re-copy after a rotate answers the current link) → into the rotate test at :109, after :120.
- lookups-privacy.test.ts:218-220 (a deleted team: the plain `team_name` reads null) → into lookups.test.ts:74-82, which covers only the inherited half.
- service.test.ts:149 (`'Bearer not-a-token'`) → add it to the list at service.test.ts:156.
- attachments.test.ts:299-300 (`rate_limited` code; another account still uploads) → into :224 (REWRITE b).

## Support code that goes dead
- **owner-views.test.ts** (if :157 goes): imports at :3 (`Hono`), :5 (`Actor`), :16 (`AuthEnv`), :17 (`ApiError`), :19 (`shareRoutes`).
- **record-link.test.ts** (if :172 goes): imports at :6 (`Hono`), :8 (`Actor`), :17 (`AuthEnv`), :18 (`ApiError`), and `recordLinkRoutes` at :19. `shareRoutes` and `recordLinkRoutes` keep their production callers (src/app.ts:354, :267).
- **lookups-privacy.test.ts:** `forgeView` (:64-74), `asLink` (:58-62), `HOST` (:22), and imports `drizzle` (:3), `sha256` (:14), `parseRowsParams` (:15), `recordLinkFor` (:16), `readRows` (:17), `freshDb`/`ownerDomain` (:18), `TEST_LINK_SECRET` (:20).
- **route-matrix.test.ts:** `concrete` (:363-372) and the `UPLOAD` import (:9) if :374 goes; `listed` and `matches` (:345-357) if :359 and :379 both go.
- **actions.test.ts:** the `site` parameter of `act` (:166-167).
- **owner-writes.test.ts:** `owner` (:101, :110) if both the owner-session instances and :373 go. That also saves a magic-link sign-in in every test's beforeEach.

## Findings outside the brief
1. **Untested leak guard.** The public route strips the owner column at read time (src/views.ts:508), and no test reaches that line. PUT refuses the owner column (public.test.ts:64), but PATCH on a public view never re-checks it (src/views.ts:342-353 re-checks only for-owners views). Removing the strip would pass the suite. SPEC:63 says "never the owner column". A test that would catch it: an admin PATCHes a public `per_project` view to `visible_fields: ['name', 'project_id']`, and the public rows still lack `project_id`.
2. **`forOwnersProblem` trusts the stored `source_type`** (src/views.ts:415), while `publicRows` checks the real source kind (:501). Through the API, `source_type` is derived from the source (:177), so only a hand-edited row gets past this.
3. **The engine suite never tests the service-account half of the address rule** (SPEC:83 "a service account included"), nor the action-token revocation on an address change (src/record-link.ts:108-115). Only theatre tests them (theatre/test/invite.test.ts:252-279). Separately, invite.test.ts:245-250 duplicates record-link:381-383, for whoever audits the theatre slice.
4. **Flake risk at minute boundaries.** Rate-limit windows are aligned to the clock (src/rate-limit.ts:17). public.test.ts:145-146 waits out a minute boundary before its run; owner-views:440, service:173 (601 requests, the longest), and attachments:224 and :296 do not.
5. **Stale governing lines:**
   - step-1/plan.md:61-62 says threat 8 is "Tested by: new rows in the route matrix", but the matrix never sends `Sec-Fetch-Site` or `Origin` (:325-334).
   - virtual-columns/future-lookups-on-owners.md:3 says "not built, not planned"; step 3 built it.
   - The name of lookups-privacy:190 is false since step 3.
6. **Names that overclaim:** owner-views:183 ("is revised") and actions:299 ("scoped to it").
7. **record-link:359 fails under root:** root can read a mode-000 file.
8. **One matrix row cannot detect its own route's removal.** route-matrix:133-138 (`POST /api/actions/nope`) expects exactly what an unregistered path answers (401, 403, 404). Only :379 catches its loss; if :379 goes, point that row at a real action.
9. **The same "fixture is valid" pattern exists outside the slice:** validate.test.ts:133 and lifecycle.test.ts:191. lookups.test.ts:234 also overlaps lookups-privacy:334 and :345.
10. **The engine typecheck covers `src` only** (packages/engine/tsconfig.json `"include": ["src"]`), so types inside the tests are never checked in the gate.
