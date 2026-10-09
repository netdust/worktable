# SDD ledger — plan: specs/step-2/plan.md

Spec: specs/step-2/spec.md (binding). Branch feature/step-2, start 8cfd34e (Stefan's SPEC.md edits committed; Task 0 precondition holds).
Execution: subagent-driven, chosen by Stefan 2026-10-09.

## Pre-flight scan

| Tasks | Producer → consumer | Found |
|---|---|---|
| 1 → 2, 3, 8, 9a | `Store.mailer`, `Store.appUrl` → hook mail, `/act` link, record-link mail | agrees |
| 2 → 3 | `HookResult.token` → `mintActionToken`; Task 2's pinning test deleted in 3 | agrees |
| 2 → 4 | `/schema` `lifecycle: { column }`, `expect` plumbing → grid and matrix | agrees |
| 2 → 5 | `runWrite(opts.expect)` → action updates' `expect` | agrees |
| 3 → 8 | `mintActionToken`, `noStoreHeaders()` → invite hook, `#/act` page | agrees |
| 3 → 9a, 11 | `linkAccount`, `failureLimiter`, `sessionMiddleware` kind=user → RecordLink branch (9a), Bearer branch (11) | agrees |
| 3 → 12 | account rebuild test → referenced, not repeated | agrees |
| 4 → 7 | one op stack with batch ops, `MatrixApi.undoBatch` → `runAction` as the fifth call | agrees |
| 4 ↔ 6 | writer creates `open` for an empty assignee ↔ nested creates pass `state: 'open'` | agrees |
| 4 ↔ 9b | `token_projection` ['activiteit_id','rol_id','state'] ↔ 9b marks those three `owner_visible` | agrees |
| 5 → 6, 7 | `ActionCreate.then`, `updates` → slots, `vul_slot` | agrees |
| 6 ↔ 9b | seed-missing view guard | **conflict**: Task 6 says it "adds the guard on public only", but seed-missing already leaves public views alone (seed-missing.ts:159). See ruling R1 |
| 8 ↔ 4 | invite hook lands in 8; between 4 and 8 a create into `uitgenodigd` mails nothing | agrees (no hook declared yet) |
| 9a → 9b | link actor, `confineLinkActor` allows `/owner/views*` → `ownerRows` | agrees |
| 9a → 10 | `linkSecret`: test/sign-in in 9a; theatre declares `record_link`, parity.ts, edit-session, playwright in 10 | agrees |
| 9b → 10 | `owner_visible` (three marks) → more marks, `mijn_producties`, Share control | agrees |
| 0 | precondition `git status --short docs/SPEC.md` empty | holds at 8cfd34e |

| Task | Self-consistency |
|---|---|
| 0 | commits by path; SPEC.md now clean, so a plain path commit is right | ok |
| 1–3, 5, 7–9b, 11, 12 | tests vs files vs interfaces | ok |
| 4 | Step 4 runs step-0d/0e e2e for the matrix undo; files list covers types.ts, engine.ts, hooks.ts | ok |
| 6 | the "adds the guard on public only" line contradicts existing code | R1 |
| 10 | Step 4 runs the full e2e (engine needs the secret from here on) | ok |

## Rulings
- Ruling R1: Task 6 does not touch seed-missing's view guard. The existing public-view guard (seed-missing.ts:159) stays as it is, and Task 9b extends it to for-owners views. — The plan text describes a guard that already exists. — Cost if wrong: none; 9b's test pins the for-owners case.

## Progress
Task 0: dispatched (BASE 8cfd34e, implementer opus)
Task 0: implementer DONE dc31bc9 (8cfd34e..dc31bc9); review: Needs fixes (1 Important: mijn_producties missing from queries table/counts; 2 minors: kandidaten in step 2 walkthrough, "signed-link" leftover)
Task 0: minor (deferred): failureLimiter and noStoreHeaders() listed in the engine surface though internal — Ruling: keep; the plan names them and listing them is harmless — cost if wrong: two words in the freeze list
Task 0: fix round 1/5 (3 addressed, 0 open; commits dc31bc9..99f050e)
Task 0: complete (commits 8cfd34e..99f050e, review clean)
Task 1: dispatched (BASE 99f050e, implementer sonnet)
Task 1: implementer DONE_WITH_CONCERNS c5b51ed (99f050e..c5b51ed); stdout line generic (no repo reader); review dispatched
Task 1: complete (commits 99f050e..c5b51ed, review clean)
Task 1: minor (deferred): mailer.test.ts waits with Bun.sleep(20) for timer delivery (poll with a deadline instead)
Task 1: minor (deferred): no test of send() rejecting (request still 200, error logged)
Task 1: minor (deferred): Store built in three places with silentMailer/appUrl '' (factory if a fourth appears)
Task 1: minor (carried to Task 2): Mail/Mailer not exported from src/index.ts — Task 2 exports Mail with HookResult
Task 2: dispatched (BASE c5b51ed, implementer opus)
Task 2: implementer DONE 34f6736 (c5b51ed..34f6736); review dispatched (opus)
Task 2: complete (commits c5b51ed..34f6736, review clean)
Task 2: minor (deferred, fix before merge): the second checkTransition (on the writer's returned values, writes.ts ~411) has no test
Task 2: minor (deferred, fix before merge): PATCH strips `expect` from every body; `expect` is not a reserved column name (validate or document)
Task 2: minor (deferred): `roles: []` accepted at validation, never fires
Task 2: minor (deferred): sendAfterCommit — a mailer whose send() throws synchronously turns a committed write into 500 and skips later mails; wrap each send
Task 2: minor (deferred): `expect` on POST /rows silently dropped (inconsistent with PATCH 400; harmless)
Task 2: minor (deferred): hook tests wait with Bun.sleep(5)
Task 3: dispatched (BASE 34f6736, implementer opus)
Task 3: implementer DONE 6af775b (34f6736..6af775b); runWrite split into applyWrite for /act's single transaction; noStoreHeaders() in action-token.ts
Ruling R2: /act/view answers { dataset, projection } without the token's to_states; Task 8 (the confirm page) adds `to` (the allowed states with their option labels) to /act/view, since the page draws one button per allowed answer — cost if wrong: one field on one route
Task 3: review dispatched (opus)
Task 3: complete (commits 34f6736..6af775b, review clean)
Task 3: minor (deferred): actOn checks `to ∈ to_states` (422) before the scope read; a reassigned token with a bad `to` gets 422 not 401 (needs a real token)
Task 3: minor (deferred): write guard's 403 and the Host check answer before the /act no-store middleware
Task 3: minor (carried to Task 9a): writes.ts ↔ action-token.ts circular import; move noStoreHeaders() to a neutral module (e.g. public-headers.ts)
Task 3: minor (carried to Task 9a): findLink/linkAccount should refuse a disabled link account (disabled_at IS NULL) before anything can disable one
Task 3: minor (deferred, spec note): an undo back into the hooked state restores the old token's use (no re-mint) — state it in the spec
Task 3: minor (deferred): an owner sees `hidden` for a link batch (revisit with owner sessions); whose() reads the subject title without a read check (fine for editor/admin)
Task 4: dispatched (BASE 6af775b, implementer opus)
Task 4: implementer DONE_WITH_CONCERNS 49d4c78 (6af775b..49d4c78); grid vitest 1/9 runs one unreproduced failure; full e2e 146/151 when overlapping other runs, failed specs 36/36 alone
Ruling R3: the engine answers transition refusals as English codes (transition_not_allowed, transition_lost); Dutch comes from the grid's errorText (and the #/act page's), so the brief's "422 in Dutch" is met at the screen, not the wire — per the global constraint "English in the engine, Dutch for user-facing strings" — cost if wrong: an agent reading the API sees English messages
Task 4: note: a clean full `bun run gate` is required at Task 6's gate (the overlapped run is not evidence)
Task 4: review dispatched (opus)
Task 4: review: Needs fixes (1 Important: a batch-less note op on a lifecycle join re-creates a deleted row into uitgenodigd on undo/redo — threat 7 once Task 8's hook lands)
Ruling R4: on a lifecycle join, an op without a batch (a note edit) never creates: when its record is gone, it is skipped with the existing Dutch notice and dropped from its step, like a skipped state op. Overrides the plan's "note edits keep today's path" for the create case only (spec threat 7 binds) — cost if wrong: a note edit on a deleted cell cannot be undone
Ruling R5: an `open` row with a person or a name is refused in Dutch ("Een open plaats heeft nog geen persoon of naam."); open means unfilled — the converse of the spec's "neither person nor name is valid only as open with a role" — cost if wrong: one writer rule to drop
Task 4: fix round 1/5 (2 addressed, 0 open; commits 49d4c78..44f7639)
Task 4: complete (commits 6af775b..44f7639, review clean)
Task 4: minor (deferred): an owner's same-value {state} PATCH passes as a no-op (writers.ts answersInvite + writes.ts early return)
Task 4: minor (deferred): `aantal` not validated as a positive integer on Toewijzing (Task 6 validates slot aantal; row aantal still open)
Task 4: minor (deferred): matrix expectOf sends {state:''} if the confirmed status is empty (unreachable with toewijzing's options)
Task 4: minor (deferred): one unreproduced grid vitest failure in 1/9 runs; likeliest new candidate Grid.test.tsx 409 case (one act(), no waitFor)
Task 4: note: the "Look at it" step is deferred to /shakeout — Stefan's :4330 engine runs older code on his session db; restarting it migrates that db (account rebuild), which is his call
Task 5: dispatched (BASE 44f7639, implementer sonnet)
Task 5: implementer DONE 18ca757 (44f7639..18ca757); creates before updates; then-property needs biome-ignore (thenable hazard flagged to review)
Task 5: review: Approved (minors: `then` thenable trap, plan-mandated; rollback test asserts only the 422)
Ruling R6: rename ActionCreate's `then` to `children` before Tasks 6 and 7 build on it (engine, tests, docs/SPEC.md, plan.md) — a callable `then` makes every ActionCreate a thenable that await/Promise.resolve would invoke; the plan's name, overruled — cost if wrong: a three-site rename back
Task 5: fix round 1/5 (2 addressed, 0 open — R6 rename, rollback assertion; commits 18ca757..20cedb2)
Task 5: complete (commits 44f7639..20cedb2, review clean)
Task 5: minor (deferred): creates run before updates in one action; an action freeing and re-adding a person on one activiteit would trip the duplicate rule (no current action does)
Task 5: minor (deferred): ActionResult has no delete step (vul_slot keeps an aantal-0 row? it never reaches 0: aantal 1 fills in place)
Task 6: dispatched (BASE 20cedb2, implementer sonnet)
Task 6: implementer DONE 7f27ec3 (20cedb2..7f27ec3); added WriteContext.findBy (new engine surface); weak RED (implementation before tests)
Task 6: review: Needs fixes (2 Important: findBy not on the freeze list / spec Writer row; no engine test for findBy)
Ruling R7: WriteContext.findBy(dataset, match) is accepted as engine surface (first live row by equality on declared columns, same bounds as exists, no scope applied) — the freeze rule's finding is this ruling; Task 6's fix adds the docs/SPEC.md Writer-row line and the surface list entry — cost if wrong: one helper to remove and Task 6's title resolution to rewrite
Task 6: fix round 1/5 (4 addressed, 0 open — findBy spec line, findBy engine test, matchOf caller name, aantal/slots tests; commits 7f27ec3..b4442b6)
Task 6: complete (commits 20cedb2..b4442b6, review clean)
Task 6: minor (deferred): slotsOf can compute rol_id undefined without a guard (safe only because validateItems runs first in the same transaction)
Gate after Task 6: running (full bun run gate); Task 7 waits for it (shared e2e ports)
Gate after Task 6: FAIL 1/151 e2e — step-1.spec.ts:205 apply-template expects 28 created, gets 36 (28 activities + 8 open slots from Task 6's slotted seed); 1252 bun + 962 grid pass. Back to Task 6 as fix round 2
Task 6: fix round 2/5 (1 addressed, 0 open — e2e apply-template counts the open slots; commits b4442b6..a0a50b0)
Task 6: complete (commits 20cedb2..a0a50b0, review clean)
Gate after Task 6: green — full run 1252 bun + 962 grid + 150/151 e2e, the one failure (apply-template) fixed in a0a50b0 and passing with step-1, grid-ux, ui-fit specs
Task 7: dispatched (BASE a0a50b0, implementer opus)
Task 7: implementer DONE dc7aea7 (a0a50b0..dc7aea7); concerns: fill not painted until server answers; open column not reachable by arrow keys; vul_slot shown as a generic row action; redo of a split fill skipped (threat 7)
Ruling R8: an action named by a matrix's `open.fill` is not offered as a generic row action in the grid (it is refused on any row that is not open, so offering it only misleads) — cost if wrong: one filter to drop
Task 7: review dispatched (opus)
Task 7: review: Needs fixes (2 Important: R8 not built — vul_slot still a generic row action; a failed re-read after a landed write inverts the next undo / drops the fill's undo step)
Task 7: fix round 1/5 (3 addressed, 0 open — R8 fill not a row action; landed write survives a failed re-read; focus back to the open cell; commits dc7aea7..18412d3)
Task 7: complete (commits a0a50b0..18412d3, review clean)
Task 7: minor (deferred): open-column cells not on the arrow-key grid (Tab/click only)
Task 7: minor (deferred): no optimistic paint for a fill; a full window GET per fill/undo/redo
Task 7: minor (deferred): openSlots treats any person-less, name-less row as open (a cancelled unnamed slot would be offered, then 409)
Task 7: minor (deferred): the fill picker ignores away data (absent people offered silently)
Task 7: minor (deferred): Matrix.tsx +110 lines; FillPicker could move to its own file
Task 7: minor (deferred, verify): store.send's new refresh() call is not awaited — confirm refresh() catches its own rejection
Task 8: dispatched (BASE 18412d3, implementer opus)
Task 8: implementer DONE 6277fee (18412d3..6277fee); grid now shows write notices as toasts; /act/view also answers `labels`
Ruling R9: a lifecycle transition may carry an optional `label` (its verb, declared by the domain); /act/view answers each allowed `to` with the label of the transition from the token's from_state (fallback: the option label); theatre labels uitgenodigd→bevestigd "Bevestigen" and →geweigerd "Weigeren"; the page's status row shows the option label, not the raw value — the engine cannot invent verbs and the brief's buttons are verbs — cost if wrong: one optional key on the transition shape (spec Lifecycle line + surface)
Task 8: review dispatched (opus)
Task 8: review: Needs fixes (2 Important under R9: verb labels on the buttons; option label for the status row; minor: dead end after a transient failure)
Ruling R10: /act/view's extra `labels` (the projection's column labels) is accepted — the page has no session and no /schema; it carries declaration labels only, computed after the token checks — the spec's /act/view line names `to` and `labels` — cost if wrong: one field to drop
Task 8: fix round 1/5 (4 addressed, 0 open — R9 verbs, R9 status label, retry after a passing failure, R10 spec lines; commits 6277fee..efc4266)
Task 8: complete (commits 18412d3..efc4266, review clean)
Task 8: minor (deferred): the no-email notice name falls back to '' when weergavenaam is missing ("Geen uitnodiging:  heeft…")
Task 8: minor (deferred): no test asserts the invite token's 14 days or stored to_states; runAction/updateThrough notice propagation untested
Task 8: minor (deferred): Act.answer sets state after the promise with no live guard; an initial /act/view network failure is terminal
Task 9a: dispatched (BASE efc4266, implementer opus; carries Task 3's noStoreHeaders move and disabled-link-account check)
Task 9a: implementer DONE e80e30d (efc4266..e80e30d); confineLinkActor inside authRoutes; request route fails open on limiter error (vs constraint: fail closed)
Task 9a: review: Needs fixes (1 Important: the request route and the bad-link failureLimiter share key record-link:ip:, so 20 requests lock out valid links and vice versa)
Ruling R11: POST /record-links/request stays fail-open when its limiter errors — step 0e chose fail-open for link requests so a broken limiter never blocks a person's way in; the route answers identically and writes nothing either way — cost if wrong: while the limiter is broken, the 5-per-email cap is gone (one argument to flip)
Task 9a: minor (deferred): the writes.ts ↔ action-token.ts import cycle is structural and remains (only the header coupling was removed); safe at call time
Task 9a: minor (deferred): deliverLinks runs sync SQLite reads after the response (negligible)
Task 9a: fix round 1/5 (3 addressed, 0 open — separate limiter keys, case-insensitive scheme, unreadable secret message; commits e80e30d..32ce108)
Task 9a: complete (commits efc4266..32ce108, review clean)
Task 9a: minor (deferred): no negative test pins `RecordLinkX token` (regex rejects it)
Task 9a: minor (deferred, verify): if a record id could ever be reused (hard delete), an old link would open the new record — confirm nothing hard-deletes
Task 9b: dispatched (BASE 32ce108, implementer opus)
Task 9b: implementer DONE 3d4fb96 (32ce108..3d4fb96); from/to refused unless the date column is owner-visible in the view; action-token.test fixture changed (owner column no longer projectable); share-token service refusal left to Task 11
Task 9b: complete (commits 32ce108..3d4fb96, review clean)
Task 9b: minor (deferred): ownerRows duplicates publicRows' projection; two mechanisms for a view's own filter (RowsParams.stored vs filter override) — one shared projector
Task 9b: minor (deferred): holdKeys re-parses sort tokens apart from params.ts
Task 9b: minor (carried to Task 10): owner-visible relation columns are served as raw ids (lookups dropped, no /schema) — mijn_producties should output names as text columns
Task 9b: minor (deferred): final ORDER BY id tiebreak reveals hidden id order among ties (negligible); verify no generic write path reaches saved_view.for_owners
Task 10: dispatched (BASE 3d4fb96, implementer opus)
Task 10: implementer DONE_WITH_CONCERNS fd0021e (3d4fb96..fd0021e); full e2e 151/151 with the secret; fixed step-0d (3 matrix tests) and react-aria edit-long-text e2e helpers that Task 7's open column had shifted (Task 7 never ran them — a gap the Task-7 brief's e2e list missed); /schema serves record_link: true
Ruling R12: mijn_producties must not carry admin-only columns (notitie, dietary, dagtarief) just for a refusal test — Task 9b answers unknown and hidden keys with the same column_not_owner_visible, so the test holds without them and nothing admin-only enters the query (owner sessions still read whole rows until the Q9 cut) — cost if wrong: the refusal test names an unknown key rather than a hidden one
Task 10: review dispatched (opus)
Task 10: review: Needs fixes (2 Important: R12 admin-only columns still in mijn_producties; no date declared, against SPEC:225)
Ruling R13: mijn_producties declares `date: 'laatste_dag'` as SPEC:225 says (from/to must work for owner rows); the admin grid's default week window on that query is accepted — cost if wrong: the admin opens it on a week and widens it
Ruling R14: /schema serving `record_link: true` gets its spec line next to "/schema serves lifecycle: { column }" (freeze rule) — cost if wrong: one spec line
Task 10: fix round 1/5 (4 addressed, 0 open — R12 no admin-only columns, R13 date declared, R14 spec line, react-aria lookup; commits fd0021e..d384442)
Task 10: complete (commits 3d4fb96..d384442, review clean)
Task 10: minor (deferred, fix before merge): mijn_producties no longer excludes soft-deleted persons (the dropped persoon join filtered deleted_at); an admin's unscoped read lists a deleted person's productions — add `persoon_id IN (live persons)` or an EXISTS
Task 10: minor (deferred): LinkPage.readAll uses Promise.all (one failing view hides all); the link page's 401 also fires the global unauthenticated() callback; the index.html test reads via process.cwd()
Task 10: minor (deferred, verify): the dagen CTE's "last activity" includes cancelled activities, if activiteit has a cancelled status
Task 11: dispatched (BASE d384442, implementer opus)
Task 11: implementer DONE 3f53377 (d384442..3f53377); serve refuses two account commands in one run; service refused DELETE share-token too; signout with Bearer answers 200 (cookie-expiry only); OpenAPI info fixed; e2e global setup not run
Task 11: complete (commits d384442..3f53377, review clean)
Task 11: minor (deferred, fix before merge): an Authorization header that is neither RecordLink nor Bearer falls through to the cookie (rule: header present → cookie ignored → 401)
Task 11: minor (deferred, fix before merge): POST /auth/signout with a Bearer/RecordLink answers 200 with a cookie-expiry Set-Cookie (skip deleteCookie when no session)
Task 11: minor (deferred): serviceByToken's timingSafeEqual compares the hash with itself (theatre); service-name uniqueness only in the CLI transaction, names not trimmed
Task 11: minor (deferred, threat-model deferral): failureLimiter on bad Bearers locks out a valid service from the same address for 15 min (shared-IP lever)
Task 11: minor (deferred): --subject with --create-service ignored silently; OpenAPI /actions/<name> could collide across sources; info/servers fixed; e2e global-setup service step depends on a fresh e2e db
Task 12: dispatched (BASE 3f53377, implementer sonnet)
Task 12: implementer DONE_WITH_CONCERNS 55f9aee (3f53377..55f9aee); gate RED: e2e 137 pass / 13 fail (timeouts on 'Laden'); owner-sees-own fails alone
Task 12: complete (commits 3f53377..55f9aee, review clean)
Task 12: minor (deferred, fix before merge): the step-1.sql fixture carries no note of how it was generated (step-1 at 2f6cc9b, invented export, --seed-missing, invented admin)
Task 12: minor (deferred): parity on the invented export (0 mismatches) was run by hand, not asserted in a test (brief step 1)
Task 12: minor (deferred): migrate.test's `count(*) FROM mijn_producties` toBeDefined is weak — compare to the fixture
Gate after Task 12 (1st, by implementer): e2e 13 timeouts at load ~4.6; (2nd, controller): grid 14 timeouts at load 15.8 from other sessions; the 5 failed grid files rerun alone at load 3.3: 230/230 pass; owner-sees-own alone: pass. Running a 3rd gate at low load.
Gate after Task 12 (3rd, controller): bun 1490+ pass; grid 994/998 — 4 timeouts (15 s, Testing Library waits) at load 15.5 with 20 cores and other sessions; e2e not reached. Different files fail each run; every failed file passes alone.
Ruling R15: the whole-branch review starts now; the final fix wave caps the grid vitest pool (maxWorkers ~50%) so the gate holds on a loaded machine; the gate must be fully green after the fix wave and before /shakeout — cost if wrong: the review sees code the gate has not yet passed in one run (each tier and file has passed)
Final review: 1 Blocking · 7 Should fix · 13 Note; saved specs/step-2/review.md (committed with the fix wave)
Ruling R16: lifecycle writes from a service account (kind service) must carry `expect` (400 bad_body when a PATCH names the lifecycle column without it); human clients keep Q10's default (judged on the current value) — agents are the race risk the security review named — cost if wrong: humans' API tools stay unprotected
Ruling R17: the final review's Should fix 4 (R7 on a database that already holds an unslotted "speeldag op locatie") goes to Stefan with the finish; the fix wave does not change seed-missing — cost if wrong: none until his real-data run
Ruling R18: Should fix 6 (per-address limiters are global behind a proxy) is recorded as a cutover precondition in the plan's threat-model deferrals and the spec's Access paragraph, not built in step 2 — cost if wrong: a network deployment without the trusted-proxy fix lets 20 bad clicks lock every person out for 15 min
Final fix wave: dispatched (BASE 55f9aee, opus, one subagent)
Stefan, 2026-10-09, on R17 (review Should fix 4): option 1 — seed the slotted template under its own title, next to the old one.
Final fix wave: DONE_WITH_CONCERNS (commits 55f9aee..45f8d18, 14 commits); gate once alone: e2e 150/151 — apply-redo-refused expected the old notice, fixed in 45f8d18 (step-1 spec 14/14 alone)
Ruling R19: `uitgenodigd → voorlopig` becomes a declared Toewijzing transition (editor, administrator) so S3's writer-made move is legal; a planner may make it by hand too, and the old invite token then answers 409 at /act — beyond the brief's transition list — cost if wrong: one transition to remove and S3 to rework
Gate after fix wave: bun 1513/0; grid 998/999 — GridBar 'groups by a field and closes on Escape' failed once; 6/6 alone; GridBar untouched by step 2 (pre-existing flake from react-aria, logged); e2e not reached — running it alone
Task -: minor (deferred, pre-existing): GridBar.test 'groups by a field and closes on Escape' flakes under parallel load (passes alone)
Final fix wave re-review: 22/22 ADDRESSED (B1, S1–S6, S7a–f, N1–N5), no blocking breakage
Ruling R20 (residual, to Stefan at the finish): swapping the person on a bevestigd/geweigerd row keeps the state, so person B reads confirmed without being asked and gains mijn_producties access; not an escalation (an editor may set open → bevestigd directly), so no second fix wave — Stefan decides whether a swap on any filled state pencils back to voorlopig — cost if wrong: a planner's swap grants access silently
Final fix wave: minor (deferred): an editor editing a persoon's email gets 403 (B1); the grid does not mark the cell read-only — check the Dutch text for `forbidden`
Final fix wave: minor (deferred): every redo refused as not_undoable reads "Opnieuw doen kan hier niet" (accurate wording)
Gate after fix wave, by tier: check green; bun 1513/0; grid 998/999 (GridBar pre-existing flake, 6/6 alone); e2e alone 151/151 (17.6 min). Head 45f8d18.
Stefan, 2026-10-09, on R20: yes — swapping the person (or name) on any filled state pencils the row back to voorlopig.
Ruling R21: "any filled state" = uitgenodigd (already, S3), bevestigd and geweigerd; geannuleerd stays geannuleerd (a cancelled row is not a commitment); bevestigd → voorlopig and geweigerd → voorlopig become declared transitions (editor, administrator) so the writer-made move is legal; applied after the shake-out finishes (it runs the e2e ports), RED→GREEN, then the affected flows re-driven — cost if wrong: a cancelled row's swap keeps "geannuleerd"
Shake-out (0987979): 18/18 Test map flows pass (14 browser, 4 wire); registered surfaces re-driven at 45f8d18, 151/151, verified bumped; CHECKS.md +19 e2e, +4 smoke; checker FAIL on row 19: a cancelled invite's #/act page still offers answers (review Minor 2), test marked test.fail()
Shake-out fix: dispatched (row 19 + R21), BASE 0987979
Shake-out fixes: f4836ea (row 19), cb6999a (R21); docs/SPEC.md edit refused by the permission classifier for the subagent — surfaced to Stefan, not re-attempted
Shake-out: row 19 re-driven, row 20 (R21 swap) added, 13a1ae7; checker PASS (20 rows, 16 browser); finding: link-shows-own-projects-only hangs when Mijn producties is already for owners (test not idempotent)
Shake-out test fix: link-shows-own-projects-only reads the offered menu item before clicking (no PUT wait on an already-published view); RED repeat-each=2 hang → GREEN 2/2; spec edit fa4fb81 (R21) by Stefan's request
Gate on merged main a9c6583: bun 1522/0, grid 1000/1000, e2e 174/175 — react-aria not-nullable-select-offers-no-leeg timed out once (column Status poll); passes alone and in its exact run order (51/51); intermittent, not step-2 code; logged
