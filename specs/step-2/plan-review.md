# Plan review: step-2 (Toewijzing slot-first, lifecycle, person pages, agent tokens)
Reviewed-plan: 670d905cc7001f17b4c7fcee5a2ea6caf42e683a specs/step-2/plan.md
Verdict: not ready

Two security mitigations in the threat model do not hold against the current source. Both need a plan change before Stefan reads it. Everything else is fixable in place.

## Blocking

**B1. Threats 10 and 15 rest on `may()` "by kind", but `may()` does not guard the routes a link actor must be kept out of.**
- **Plan:** Threat model 10 says "`may()` by kind: a link actor is allowed `owner.views` only (`access.ts`)". The Mitigations list says "`may()` kind rules: 10, 15". Task 9 says "`access.ts` (kind rules)" and expects "a link actor is 403 on `/schema`, `/rows`, `/views`, `/history`, writes and undo".
- **Source:** `may()` is called in exactly three places: `views.ts:241` (views.write), `views.ts:287` (views.share) and `display.ts:83`.
  - None of these call it: `GET /schema` (`app.ts:169`), `GET /rows` (`app.ts:210`), `GET /history` (`app.ts:229`), the write routes, `/actions`, `/batches/:id/undo` and `/revisions` (`app.ts:41-66`), and `GET /views` (`views.ts:250`).
  - `writableOf` (`writes.ts:46-51`) checks only visibility and whether a writer exists.
  - The surfaces `schema`, `rows.read` and `rows.write` are declared in `access.ts:21-32` but never consulted.
- **Effect:** once Task 9 lets a `RecordLink` header authenticate in `sessionMiddleware`, the link actor is an `owner` and reads whole rows on `/rows`, `notitie` and `dietary` included. That is exactly the leak threat 10 names.
- **Smallest change:** Task 9 installs a confinement middleware right after authentication. A `kind: 'link'` actor gets 403 on every path except `/owner/views*` (and `/auth/me` if wanted). Keep the existing per-family 403 tests; they then have something to test. Task 11's service-kind refusals belong in the handlers that already call `may()` (share-token) and in the new routes (for-owners, record-links). Say so.

**B2. An action token acts as the row's *current* owner, so a token survives a reassignment and confirms for someone else.**
- **Plan:**
  - Task 3 Interfaces: "`POST /act { token, to }` → the transition through `runWrite` as `linkAccount(owner of the record)`".
  - The token table stores `(dataset, record_id, from_state, …)`, with no subject.
  - Threat 2: "the link actor's subject must equal the row's `persoon_id` (`scopeOf` in `runTransition`)".
- **Source:**
  - A planner may change `persoon_id` on an `uitgenodigd` row (`switchAssignee`, `packages/theatre/src/writers.ts:141-145`; `toewijzingWriter.update`, `:147-157`).
  - That write changes no lifecycle column, so it is no transition, and no token is revoked.
  - The old invitee's token still matches `record_id` and `from = uitgenodigd`.
  - `/act` then derives the link account from the *new* `persoon_id`, so `scopeOf` (`access.ts:62-68`) passes by construction.
  - Result: person A confirms person B's slot, and history says B confirmed. The second check in threat 2 is a tautology.
- **Smallest change:** store the owner subject on `action_token` at mint, and resolve `/act`'s link account from the token's stored subject. `scopeOf` then refuses when the row's owner has moved, which maps to the identical 401. Add a Task 3 test: "the owner column changes after mint: the old token is 401 and the row is unchanged".

## Should fix

**S1. Task 3's concurrency test contradicts the identical-401 rule.**
- Task 3 Step 1 expects "two concurrent `/act` calls on one row give one 200 and one 409". It also expects "reused … tokens get one identical 401". Test map row 8 lists `simultaneous-confirm-409` under `/act`.
- A row has one token. `runWrite` and the consume run synchronously inside `.immediate()` (`writes.ts:376-395`), so the second call always sees `used_at` set. That is a reuse, so it gets 401.
- A 409 only arises when a *valid, unused* token meets a row that moved, e.g. an editor confirms in the grid first. It also arises between two grid PATCHes with `expect`.
- **Change:** a second `/act` on the same token expects 401. Drive gate 6 through two `PATCH`es with `expect`, or an editor confirm followed by `/act` (409, token left unconsumed). Put it in Task 4's tests and restate the Task 8 e2e.
- Also state that the consume and `runWrite` share one transaction, so a refusal does not burn the token.

**S2. "Other-record token" has no request-side record.**
- `/act` takes `{ token, to }` only. Threat 2's `… AND record_id = ?` has no value to bind.
- **Change:** restate the binding as "a token moves only the record it was minted for". Test gate 4's slot-A/slot-B line as "A's token moves A; B is unchanged", plus B2's reassignment case.
- Also say what a `to` outside the token's `to_states` returns.

**S3. Creating a row as `uitgenodigd` never invites, and that row can never be invited later. This is load-bearing on Q12.**
- Task 0's Global Constraints keep the default `state: 'uitgenodigd'` (`datasets.ts:176`).
- Today's ways of assigning both create `uitgenodigd` rows:
  - the people picker ("Picking adds as uitgenodigd", `e2e/dagplanning.spec.ts:235`);
  - the matrix `u` key (`datasets.ts:167`).
- A create is not a transition (R2), so no token and no mail. No declared transition leads back into `uitgenodigd` except `geweigerd → uitgenodigd`.
- Gate 2 says "Assigning a person with an email puts the invite in the outbox". The plan only satisfies it through an explicit `voorlopig → uitgenodigd` move.
- **Change:** pick one of these, with a test:
  - the hook also fires on a create into a hooked state; or
  - the Toewijzing writer's create sets `voorlopig` when no state is given. That avoids the DDL rebuild.

  Ask Stefan alongside Q12.

**S4. Matrix Ctrl+Z on a state change breaks under the lifecycle, and `voorlopig` has no mark.**
- The matrix store undoes by re-sending the reversed PATCH (`apps/grid/src/matrix/store.ts`, `step()`, roughly lines 376-395). It does not use batch undo. After Task 4, `u → b` followed by Ctrl+Z sends `bevestigd → uitgenodigd`, which is undeclared, so 422.
- The grid store uses batch undo (`grid/store.ts:111`) and is fine.
- **Change:** Task 4 (or 7) routes matrix state undo through `undoBatch`, or pins the refusal, with a test.
- Task 4/7 also add `voorlopig` to `matrix.marks` and decide on a key (`datasets.ts:167-168`). Otherwise a `vul_slot` cell renders with no mark.

**S5. Task 0 leaves two spec-of-record paragraphs that the plan contradicts.**
- `git show HEAD:docs/SPEC.md` line 60 (Lifecycle) says "hooks that run in the same write", "a conditional update on the current status" and "Grids hide the transitions a role cannot make".
- HEAD line 174 ("Who may write what") says an owner account's every other write is refused, which Task 4 opens.
- **Change:** add both paragraphs to Task 0 Step 1.
- Task 0 also has three smaller problems:
  - Its line refs (SPEC.md:170, 262, 292 …) are working-copy lines, while Step 2 builds the blob from HEAD (Toewijzing is HEAD:166, step 2 is HEAD:258/288).
  - Stefan's staged edits touch the Dataset, Query and Skin-needs rows (HEAD:43, 44, 46), which Task 0 also edits.
  - `update-index --cacheinfo` will leave his edits unstaged. Tell him.

**S6. The slot shape contradicts the spec, and Review Focus 3's case is not driven.**
- R7 says `slots: [{ rol_id, aantal }]`. Task 6 uses `slots: [{ rol, aantal }]` with `rol` as a title. Either Task 0 writes the title form into the spec, or the plan follows R7.
- Under "seed-missing by natural key" (`seed-missing.ts:73-79` is replaced), a renamed Rol makes "Speler" missing by title, so `--seed-missing` inserts a duplicate "Speler".
- Task 6's tests only drive the apply refusal. Add the seed-missing-on-rename test and decide the rule.

**S7. Rate limits as written cannot be built with `checkLimits`, and three limits have no test.**
- `checkLimits` (`rate-limit.ts:34-44`) counts every request; it has no failure-only mode.
- "20 failures per address per 15 min" on Bearer (Task 11) would throttle an agent at 20 calls. The link page makes several calls per view.
- **Change:**
  - Tasks 3, 9 and 11 name a failure-counting limiter.
  - Task 3 adds a 429 test for `/act` (threat 1).
  - Task 11 adds a rotate test (old token 401) and a 600/min test (threat 16).

**S8. Requiring the secret file at startup breaks one-shot CLI runs.**
- Task 9 says "`serve.ts` (`--link-secret-file`, refused when missing…)".
- `serve.ts` runs account, import and seed commands before listening (`serve.ts:107-185`).
- These callers spawn it with the theatre domain:
  - `e2e/auth.ts:33-55` (`--create-account`, global setup);
  - `packages/theatre/test/import-cli.test.ts:11`;
  - `packages/theatre/test/seed-missing.test.ts:19`.
- Task 10 only adds the flag to the Playwright web server.
- **Change:** refuse only when serving, or add the flag to every spawn site, named in Task 10.

**S9. History shows nothing for a link confirmation.**
- Task 3 adds `by: 'link'` to `whose()`.
- The grid's `HistoryEntry['by']` (`apps/grid/src/types.ts:294`) and `WHO` (`apps/grid/src/ui/HistoryPanel.tsx:20-27`) do not know it, so `t(undefined)`. The planner never reads "bevestigd door <naam>".
- **Change:** add the grid change and a vitest to Task 3 or 8.

**S10. No admin UI for publishing for owners or for copying and rotating a link.**
- Findings F1 item 10: the "Mijn producties" view "is published for owners by an administrator in the browser, not by a seed".
- Task 10 Step 5: "copy a person's link as an admin … rotate it".
- No task lists a grid file for either: `Share.tsx` is not touched, and there is no Persoon action. Gates 8 and 10 need a for-owners view and a link.
- **Change:** add the UI to Task 10's files and tests, or state that the gate seeds or curls them.

**S11. `token_projection` is unspecified for Toewijzing.**
- Its columns are ids (`activiteit_id`, `persoon_id`). The confirm page needs the activity's title, date and place, which live on `activiteit`.
- **Change:** Task 4 lists the projection. Task 3 says whether relation titles (lookups) are served.

**S12. Task 9 is too big for one task on a security boundary.** It holds two modules, five route families, header auth, the secret file, kind rules, a `saved_view` column and the request route.
- **Change:** split it into 9a (record link, link actor, secret file, `/record-links/*` including request) and 9b (views for owners: `owner_visible`, `setForOwners`, `ownerRows`, `/owner/views*`). Each already has its own test file.

## Note
- **Interfaces left to the implementer:**
  - how `expect` and the undo mode reach `valuesOf` (`runWrite` gains a parameter; `/act` and action updates need it too);
  - where the hook gets `appUrl` for the `#/act/` link;
  - whether `Actor.kind` is optional (`SYSTEM` in `seed-missing.ts:38`, import's `administrator()`, tests);
  - how "unique per `(kind, subject)`" is expressed. A table `UNIQUE` in `checks` (`auth-tables.ts:17-23`) also binds `kind = 'user'` owners sharing a subject, and `indexes` only makes plain indexes (`schema-diff.ts:96-99`).
- **Hooks during undo:** say whether they fire. An undo back into `uitgenodigd` would otherwise mint a token and mail again.
- **Administrators in the role table:** `roles: Role[]` has no hierarchy (`access.ts:21-32`). If theatre lists only `editor`, administrators and administrator service accounts get 422. Say whether `administrator` is listed or implied.
- **Re-invites:** `geweigerd → uitgenodigd` mints a second token while an earlier unused one (same `from`) stays valid. Consider revoking a record's outstanding tokens on mint.
- **Task 2's pinning test** ("token ignored until Task 3") must be deleted in Task 3. Say so there.
- **Task 12:**
  - the parity path is `packages/theatre/test/fixtures/invented-export.json`;
  - the `saved_view.for_owners` migration (Task 9) is missing from the migration test;
  - Step 2 has no RED.
- **E2E flows** are written by `/shakeout` after review, not in any task. The service-account setup in `e2e/global-setup.ts` is in no task's files. That is acceptable under the house process; just say it.
- **Matrix role labels** need the cell's lookups, but `asCell` (`matrix/store.ts:73-75`) keeps only `fields`. Task 7 should name it. The person picker for the open cell is not shown either.
- **Threat 14's `index.html` meta tags** have no test.
- **Close step 2** says `/feature-review step-2`; global rules say `make review name=step-2`.
- **`plan-facts.md` cites line numbers that do not exist** (`serve.ts` 211-232, 259-262, 285-297, 383; the file has 199 lines). The plan does not depend on them.
- **Simplest design paragraph:** honest, and its reasons hold. The brief makes these engine shapes, and a writer cannot see the undo mode: `WriteContext` (`declare.ts:150-155`) carries no mode, and a writer's refusal is not a 409.
- **Task order** is right: 1→2→3 engine, 4 first visible, 5 before 6 and 7, 3 before 8, 9 before 10. Task 11 is independent and could move earlier.
- **Working assumptions that are risky to build on before Stefan answers:**
  - **Q4 (names):** `for_owners` and `owner_visible` go into routes, columns, `/schema`, the grid and the spec section; renaming later touches all of them.
  - **Q5:** the `record_link` table shapes the migration and Task 9.
  - **Q11:** the whole `/act` actor design, and B2's fix.
  - **Q12 with S3:** which state assigning writes, and so whether gate 2 holds.
  - **Q1:** fixes the Task 0 spec text.

  Get answers on these before Task 0 commits the spec. Q2, Q3, Q7, Q8, Q9 and Q10 are cheap to change later.

## Premises checked
- `valuesOf` is the shared write path for PATCH, action creates, import, seed-missing and undo → `writes.ts:317-339`, `actions.ts:65-73`, `seed-missing.ts:51-57`, `writes.ts:523` → holds
- `cutBody` drops undeclared keys, so `expect` must be read in the route → `writes.ts:75-77`, `app.ts:47-51` → holds
- `runWrite` is one immediate transaction; a no-change is a `batch_id: null` 200 → `writes.ts:365-395` (plan says 376-395) → holds
- `restore` calls `valuesOf`; the batch's first old and last new → `writes.ts:478-482, 511-529` → holds
- `undoableBatch` refuses other accounts → `writes.ts:463-464` → holds
- Engine tables are never undone → `writes.ts:476` → holds
- Actions only create, as a flat array → `declare.ts:164`, `actions.ts:72-73` → holds
- Sessionless routes go before `authRoutes`, which installs `sessionMiddleware` on `/*` → `app.ts:166-167`, `auth.ts:189-193` → holds
- `sessionMiddleware` reads only the cookie and re-reads the account → `auth.ts:174-187` → holds
- `may()` gates `/rows`, `/schema`, `/history`, writes and undo for a kind rule → `access.ts:35-38`; callers only `views.ts:241,287`, `display.ts:83` → **does not hold** (B1)
- `scopeOf` for a link actor on Toewijzing guards slot A against slot B → `access.ts:62-68` plus `/act` taking the current owner → **does not hold** after reassignment (B2)
- Rate limit counts failures only → `rate-limit.ts:34-44` counts every request → **does not hold** (S7)
- Token cap 128 → `views.ts:33`, `auth.ts:17` → holds
- `seedDataset` skips when any row exists → `seed-missing.ts:48-49, 73-79` → holds
- Changing a DDL default rebuilds; CHECKs apply only through a rebuild → `schema-diff.ts:46-47, 81-101`, `ddl.ts:70` → holds
- `account.email` NOT NULL → nullable forces a rebuild → `auth-tables.ts:11`, `schema-diff.ts:90` → holds
- `forPlanners` forbids every owner write; `checkAssignee` refuses neither-person-nor-name → `writers.ts:62-80, 130-139` → holds
- `access.test.ts:91` pins the owner's Toewijzing refusal → `packages/theatre/test/access.test.ts:91-100` → holds
- `checkItem` ignores unknown keys, so slots need their own check → `writers.ts:250-263` → holds
- The engine fixture has `aantal`, so `bun run check` would fail without the allowlist line → `test/fixture.ts:111`, `scripts/check-vocabulary.ts:42-52` → holds
- `MatrixDecl` has no `open`; matrix validation is at `validate.ts:160-190` → `declare.ts:51-61` → holds
- The matrix store undoes by re-sending writes; the tab history is batch undo → `matrix/store.ts` `step()`, `App.tsx:175-176` → holds (the cause of S4)
- `whose()` assumes an email; the grid knows five `by` values → `history.ts:119-125`, `apps/grid/src/types.ts:294` → holds (the cause of S9)
- The public-view guard → `views.ts:174-176` → holds
- SPEC.md line refs in Task 0 → HEAD:166/258/288 vs plan 170/262/292 → do not hold against HEAD (working-copy lines; S5)
- `bun run parity test/fixtures/invented-export.json` → the fixture is at `packages/theatre/test/fixtures/` → path does not hold (Note)

A second, fidelity review by the advisor session is at `specs/step-2/plan-review-advisor.md`.
