# Step 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toewijzing slot-first on an engine lifecycle with single-purpose action tokens, templates with slots, the matrix open column and fill, person pages through a stable record link, and agent tokens.

**Architecture:** Five engine shapes, each opt-in and domain-free:
- the lifecycle, a transition check in the shared write path (`valuesOf`);
- actions that also update and nest creates;
- the action token;
- `record_link` with views for owners;
- account kinds `user · service · link`.

Theatre declares the names: the Toewijzing lifecycle and invite hook, `vul_slot`, Sjabloon slots, `mijn_producties`, owner-visible columns. The grid gains the open column, the `#/act` and `#/link` pages, the admin's link and publish controls, and `expect` on lifecycle edits.

**Tech Stack:** Bun, Hono, SQLite, TypeScript; Bun tests (engine, theatre), Vitest (grid), Playwright (e2e).

**Spec:** `specs/step-2/spec.md`. Design: `specs/step-2/findings.md` (with `findings-review.md` and the advisor's full F1/F2 draft `f1-f2-advisor-draft.md`). Code facts: `specs/step-2/plan-facts.md` (its `serve.ts` line numbers are stale; re-read that file). Reviews of this plan: `plan-review.md` (formal), `plan-review-advisor.md` (fidelity).

**Before Task 0 commits the spec, Stefan answers the load-bearing questions** (the formal review's list, plus two the reviews raised): Q1, Q4, Q5, Q11, Q12, Q13 and Q14 (end of this file). The rest are cheap to change later and stay working assumptions.

**First working version:** Task 4. Toewijzing slot-first with its lifecycle in the running grid: open rows with a role, the new states, and a refused transition shown in Dutch. Tasks 1-3 are the engine it stands on and have nothing to see.

**Simplest design:** Theatre-only: put the transition table and the invite in the Toewijzing writer, mint tokens in theatre, and add a theatre route for confirm. The plan does not use it:
- the brief makes the lifecycle, the action token, the person link and service accounts engine shapes;
- AGENTS.md forbids domain routes and words in the engine;
- a writer cannot see undo's mode (`WriteContext`, declare.ts:150-155, carries none) or answer a 409 for a lost race.

Inside the engine each shape stays minimal:
- one check in `valuesOf`, not a transition route;
- hooks return data instead of doing I/O;
- the link is stateless (an HMAC over a version);
- the link actor and the service account are `account` rows, so audit, undo and history need no second actor model;
- one confinement middleware keeps a link actor on its two route families, because `may()` guards only three handlers (views.ts:241, 287; display.ts:83).

## Global Constraints

- `packages/engine` knows no domain word and imports no domain package (`bun run check`). Add `aantal` to `scripts/vocabulary-allow.txt` with its reason (the engine fixture already uses it, `test/fixture.ts:111`).
- Working assumptions are marked in `specs/step-2/spec.md`. A different answer from Stefan changes the spec and this plan before the code.
- `docs/SPEC.md`: Task 0 commits only its own lines (Q14). Everything else is committed by path; never `git add -A`, never `git add docs/SPEC.md`.
- No client data in tests or fixtures; `bun scripts/check-export-terms.ts` on every commit. Fixtures are invented.
- Dutch for every user-facing string (`apps/grid/src/i18n.ts`, theatre refusals); English, generic names in the engine.
- Tokens: 32 random bytes, sha256 at rest, `timingSafeEqual`, capped at 128 characters (`views.ts:33`). Secrets never in the database, never logged. Only the development mailer logs.
- Sessionless routes are registered before `authRoutes` (`app.ts:166`, `auth.ts:189-193`). Public routes keep the Host check and the write guard, send no CORS header, and send `noStoreHeaders()` (Task 3).
- Rate limits: `checkLimits` counts every request (`rate-limit.ts:34-44`). Task 3 adds a failure-counting `failureLimiter(key, max, window)` for bad tokens, links and Bearers. Read limits count every request.
- Creates are not transitions. Hooks fire on entering a hooked state, by a transition or by a create through `POST /rows` or an action, never through import, `--seed-missing` or undo. Toewijzing's DDL `state` default stays `'uitgenodigd'` (changing it rebuilds the table, `schema-diff.ts:46-47`); the writer sets the state on create (Task 4).
- Transitions list their roles explicitly; theatre lists `editor` and `administrator` wherever an editor may. `Actor.kind` is optional and defaults to `'user'` (`SYSTEM`, import's administrator and existing tests stay valid).
- The link secret: `EngineOptions.linkSecret?: Uint8Array`.
  - `createEngine` throws when the domain declares `record_link` and none is given.
  - `serve.ts --link-secret-file <path>` reads it (at least 32 bytes, refused when group- or world-readable), only when serving. One-shot CLI commands (`--create-account`, `--import`, `--seed-missing`) do not need it.
  - `test/sign-in.ts` and `scripts/parity.ts` pass a fixed invented test secret.
  - The e2e web-server command writes `e2e/.tmp/link-secret` under `umask 077` before starting the engine, since Playwright starts servers before global setup. `scripts/shakeout/edit-session.ts:111-125` gets the flag too (Task 10).
- Real data is Stefan's: the plan writes `specs/step-2/real-data.md` with the commands and runs none.
- E2E flows are written and registered by `/shakeout` after the review, per the house process. Tasks write unit and vitest tests.

## Threat model

**Assets:**
- action tokens (confirm or decline a person's slot);
- record links (read a person's productions);
- service tokens (write as an editor or administrator);
- the link secret;
- admin-only columns: rates and amounts, dietary and health notes, absence reasons, other people's contact data, free-text notes;
- the transition table's integrity;
- the audit trail (who confirmed).

**Attacks:**
1. **An outsider guesses or forges an action token** at `POST /act` → 256-bit random, sha256 lookup, constant-time compare, one identical `401 bad_token`, `failureLimiter` 20 per address per 15 min (`actionTokenRoutes`).
2. **A token is used on another slot, after its slot was reassigned, or twice** → the token stores its record and its subject at mint. `/act` acts on that record only, as the link account of the stored subject. `runWrite`'s scope read (`currentOf`, writes.ts:357-362) refuses when the row's owner moved, which maps to the identical 401. Consume (`used_at IS NULL AND expires_at > ?`) and transition run in one transaction: a refused transition does not burn the token, and a second use is 401.
3. **The planner and the person race on one slot** → the planner's PATCH carries `expect`, and `/act` carries the token's `from`. Compared inside the immediate transaction, the later one is 409 `transition_lost` (`checkTransition`).
4. **An editor PATCHes an undeclared transition, or an owner one reserved to editors** → role table, 422 `transition_not_allowed` (`checkTransition`).
5. **Undo writes a transition no one may make** → undo mode allows only the batch's exact inverse, behind `changed_since` (`checkTransition` undo mode).
6. **An editor undoes a person's confirmation** → the batch actor is the person's link account; `undoableBatch` refuses others (writes.ts:463-464).
7. **The invite mail goes out for a write that rolls back, or again on undo** → hooks return data; mail is queued and sent after commit; hooks never fire in undo (`runWrite`, `runAction`).
8. **A stale invite stays usable after a re-invite** → minting revokes the record's outstanding tokens (`mintActionToken`).
9. **An outsider forges a record link or enumerates persons** → HMAC-SHA256 with the file secret; one identical `401 bad_link` on one code path, with the MAC computed for a missing record too; `failureLimiter` 20 per address per 15 min (`verifyRecordLink`).
10. **A rotated or revoked link keeps working** → the version is read on every request from the `record_link` engine table, which undo never touches (writes.ts:475-476).
11. **A link actor reads admin-only columns through `/rows`, `/schema`, `/history` or `/revisions`** → `confineLinkActor`, installed right after authentication: a `kind: 'link'` actor gets 403 on every path but `/owner/views*` and `/auth/me` (Task 9a).
12. **A link actor infers a hidden column through filter, sort, group or `total`** → request keys and the view's stored keys are held to owner-visible columns, `$or` included, `custom.*` refused (`ownerRows`).
13. **An admin publishes a view for owners exposing a hidden column, or a later change does** → `setForOwners` refuses, naming the key. A PATCH re-runs it. `--seed-missing` leaves a for-owners system view alone.
14. **The link-request route as an oracle or a spam lever** → byte-identical answer, delivery after the response, 20 per address and 5 per email per 15 min, nothing written (`recordLinkRequest`).
15. **A token leaks through Referer, logs or caches** → fragment URLs, `Authorization: RecordLink` header, `noStoreHeaders()`, referrer and robots meta in `index.html`, no logging middleware.
16. **A service account escalates** (mints links, publishes, manages accounts) → refusals in the handlers: the share-token handler (which already calls `may()`), `setForOwners`, `/record-links/*`. Accounts are CLI-only; no route takes a role or kind from a body.
17. **A stolen service token is used, or a Bearer is guessed** → rotate or disable from the CLI takes effect on the next request; 600/min per account; `failureLimiter` 20 bad Bearers per address per 15 min.
18. **A cookie and a Bearer are mixed, or a session id is offered as a token** → the header wins and the cookie is ignored; separate hash sets (`bearerActor`).
19. **OpenAPI as reconnaissance** → generated under the caller's own read filter; a link actor gets 403 (`openapi.ts`).

**Mitigations by location:**
- `checkTransition` and the `expect` plumbing: 3, 4, 5.
- `undoableBatch` and the link-account actor: 6.
- Post-commit mail queue: 7.
- `mintActionToken`: 8.
- `actionTokenRoutes` and `failureLimiter`: 1, 2.
- `verifyRecordLink` and `record_link`: 9, 10.
- `confineLinkActor`: 11.
- `ownerRows`: 12.
- `setForOwners` and seed-missing: 13.
- `recordLinkRequest`: 14.
- `noStoreHeaders()` and `index.html`: 15.
- Handler refusals: 16.
- `bearerActor`: 17, 18.
- `openapi.ts`: 19.

**Deferrals:**
- **Mail delivery** (cutover): the outbox only. A forwarded mail carries a working link; rotating is the remedy.
- **Owner accounts with a session** read whole rows on `/rows` until the later cut (assumed Q9); step 2 issues none to persons.
- **Notes through the link:** a link actor writes nothing.
- **Editor preview of an owner view:** not built.

## Review Focus

1. Every mitigation above, each pointing at its Test map row.
2. A lifecycle write on a stale cell, in the grid and in the matrix, answers 409, and the screen shows the current state, never a silent overwrite (Task 4).
3. A renamed seeded Rol: `--seed-missing` re-adds the original title, and an apply naming the renamed role refuses, naming it (Task 6).
4. A fill on an activity with open slots for two roles asks which role first, and never fills the wrong one (Task 7).
5. Two live Persoon records sharing one email get one mail per record, each with its own link (Task 9a).

## Test map

| Unit | Seam | Tests: tier · file · command | E2E flows (written by `/shakeout`) |
|---|---|---|---|
| 0. Spec of record + vocabulary | `docs/SPEC.md`, `bun run check` | check · `bun run check` | — |
| 1. Mailer on `Store` | `createEngine({ mailer })`, `/auth/request` | unit · `packages/engine/test/mailer.test.ts`, `auth.test.ts` · `bun test packages/engine` | sign-in (existing) |
| 2. Lifecycle: check, `expect`, undo mode, hooks | `PATCH /rows`, `POST /batches/:id/undo` | unit · `packages/engine/test/lifecycle.test.ts` (denials 3-5, 7) · `bun test packages/engine/test/lifecycle.test.ts` | — |
| 3. Account kinds, action token, `/act`, limiter, headers, history | `POST /act`, `POST /act/view`, `/history` | unit · `packages/engine/test/action-token.test.ts`, `route-matrix.test.ts` (denials 1, 2, 6, 8); vitest `apps/grid/src/ui/HistoryPanel.test.tsx` · `bun test packages/engine && bun run --filter @worktable/grid test` | — |
| 4. Toewijzing slot-first + `expect` in grid and matrix | `PATCH /rows/toewijzing`, the grid cell, the matrix cell | unit · `packages/theatre/test/toewijzing.test.ts`, `access.test.ts:91`, `parity.test.ts`; vitest `Grid.test.tsx`, `matrix/store.test.ts` · `bun test packages/theatre && bun run --filter @worktable/grid test` | disallowed-transition, stale-state-409, planner-and-person-race-409 |
| 5. Actions update and nest | `POST /actions/:name` | unit · `packages/engine/test/actions.test.ts` · `bun test packages/engine/test/actions.test.ts` | — |
| 6. Templates with slots + seed-missing by key | `sjabloon_toepassen`, `serve.ts --seed-missing` | unit · `packages/theatre/test/apply.test.ts`, `seed-missing.test.ts` (engine and theatre) · `bun test packages` | apply-template-with-slots |
| 7. Matrix open column + `vul_slot` | `/schema` matrix, `POST /actions/vul_slot`, the matrix | unit · `packages/engine/test/matrix.test.ts`, `packages/theatre/test/matrix.test.ts`; vitest `matrix/Matrix.test.tsx`, `store.test.ts` · `bun test packages && bun run --filter @worktable/grid test` | open-counts, fill-splits-slot-and-undo |
| 8. Invites and `#/act` | invite hook, `#/act/<token>` | unit · `packages/theatre/test/invite.test.ts`; vitest `ui/Act.test.tsx` · same | invite-in-outbox, confirm-without-login, reused-or-expired-refused, token-a-not-b, decline-shows-geweigerd, no-email-no-invite |
| 9a. Record link, link actor, confinement, request route | `/record-links/*`, `RecordLink` header | unit · `packages/engine/test/record-link.test.ts`, `route-matrix.test.ts` (denials 9-11, 14, 15) · `bun test packages/engine` | — |
| 9b. Views for owners | `/owner/views*`, `PUT /views/:id/for-owners` | unit · `packages/engine/test/owner-views.test.ts`, `route-matrix.test.ts` (denials 12, 13) · `bun test packages/engine` | — |
| 10. Person pages: theatre, `#/link`, admin controls | `mijn_producties`, `#/link/<token>`, the drawer and Share | unit · `packages/theatre/test/person-pages.test.ts`; vitest `ui/LinkPage.test.tsx`, `ui/Share.test.tsx`, `grid/Drawer.test.tsx` · same | link-shows-own-projects-only, owner-view-key-script, rotated-link-refused, link-request-identical, declined-or-invited-no-project |
| 11. Service accounts, Bearer, OpenAPI | CLI, `Authorization: Bearer`, `/schema?format=openapi` | unit · `packages/engine/test/service.test.ts`, `openapi.test.ts`, `route-matrix.test.ts` (denials 16-19) · `bun test packages/engine` | agent-token-write-undo-revoke |
| 12. Migration on a copy | `migrate` on a seeded theatre file, parity | unit · `packages/theatre/test/migrate.test.ts` · `bun test packages` | — |

---

### Task 0: The spec of record

**Files:** Modify `docs/SPEC.md` (only the lines below), `scripts/vocabulary-allow.txt`.

- [ ] **Step 1:** Precondition (Q14): Stefan has committed or set aside his staged `docs/SPEC.md` edits. They touch the rows this task edits (HEAD:43, 44, 46). If they are still staged, stop and ask.
- [ ] **Step 2:** Write the changes R1 lists. Line numbers are `git show HEAD:docs/SPEC.md`'s:
  - the step 2 row and gate (HEAD:258, 288);
  - the Toewijzing row (HEAD:166): states with `voorlopig`, the transitions, `rol_id`, `aantal`;
  - the Lifecycle paragraph (HEAD:60): hooks return data and mail after commit, `expect` instead of "a conditional update", and grids refusing (not hiding) a transition;
  - "Who may write what" (HEAD:174): an owner's confirm and decline on its own slot, through the action token;
  - the "no app, no account" line (HEAD:306 area): the link account is an internal actor row, never a sign-in (Q11);
  - the record token paragraph (HEAD:62) as two shapes, and the Access paragraph (HEAD:66);
  - Persoon without `token` and `user_id` (HEAD:156);
  - the Access table: kinds `link` and `service`, and the owner-account column cut as a later step;
  - the matrix's `open` replacing the generic fill rule (HEAD:46, 60 area);
  - Actions: updates and nested creates;
  - views for owners next to public views (HEAD:55);
  - Sjabloon slots by role title;
  - the section "The engine's surface after step 2", from findings F5, with this plan's names (`action_token (… from_state, to_states …)`, `record_link`, `for_owners`, `owner_visible`).
- [ ] **Step 3:** Add `aantal` to `scripts/vocabulary-allow.txt` with its reason. Run `bun run check`; expect it to pass.
- [ ] **Step 4:** Commit `docs(step-2): the spec of record before any code` by path.

### Task 1: The Mailer, on `Store`

**Files:** Create `packages/engine/src/mailer.ts`. Modify `auth.ts` (`deliver`), `writes.ts` (`Store` gains `mailer` and `appUrl`, writes.ts:30-34), `app.ts` (`EngineOptions`, the `Store` built at app.ts:163), `serve.ts`, `test/sign-in.ts`. Test `packages/engine/test/mailer.test.ts`.

**Interfaces:**
- Produces `interface Mail { to: string; subject: string; text: string }`.
- Produces `interface Mailer { send(mail: Mail): Promise<void> }`.
- Produces `outboxMailer(dir: string): Mailer`: today's file format `To: <email>\n\n<text>\n`, mode 0600, logging to stdout as `deliver` does.
- Produces `Store.mailer: Mailer`, `Store.appUrl: string`. Tasks 2, 3, 8 and 9a send through `store.mailer`.

- [ ] **Step 1: Tests:** "sign-in mails through the Mailer" (a recording mailer gets one `#/auth/` mail); "the outbox mailer writes the same file as before" (`linkFor` still reads it).
- [ ] **Step 2:** Run `bun test packages/engine/test/mailer.test.ts`; expect it to fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `bun test packages/engine`; expect it to pass. Run `bun run check`.
- [ ] **Step 5:** Commit `feat(engine): a Mailer on the store; sign-in mails through it`.

### Task 2: The lifecycle: transition check, `expect`, undo mode, hooks

**Files:** Modify `declare.ts` (`DatasetDecl.lifecycle`; `WriteContext.lifecycle`, read-only to writers), `validate.ts`, `writes.ts` (`runWrite` gains `opts`, `valuesOf`, `restore`), `app.ts` (PATCH `:47-51` reads and removes `expect`), `actions.ts` (post-commit mail). Test `packages/engine/test/lifecycle.test.ts` with a test domain: a `member` dataset, and `ticket` with `owners: { owner: 'member_id' }`, `state` options a/b/c, transitions a→b (editor, administrator), b→c (owner), `*`→c (editor, administrator), and a hook on `b`.

**Interfaces:**
- Produces `interface LifecycleDecl { column: string; transitions: { from: string[] | '*'; to: string; roles: Role[] }[]; hooks?: Record<string, (row: Values, ctx: WriteContext) => HookResult>; token_projection?: string[] }`.
- Produces `interface HookResult { token?: { to: string[]; days: number }; mail?: (link: string | null) => Mail | null; notice?: string }`. The engine builds `link` as `${store.appUrl}/#/act/<raw token>`; it is null when no token was asked or none minted (until Task 3).
- Produces `checkTransition(dataset, current: Values | null, next: Values, actor: Actor, mode: { kind: 'write'; expect?: string } | { kind: 'undo'; from: string; to: string }): void`. It throws 422 `transition_not_allowed` or 409 `transition_lost`. Called from `valuesOf` through `ctx.lifecycle`.
- Produces `runWrite(store, …, opts?: { expect?: Record<string, unknown> })`. `/act` (Task 3) and action updates (Task 5) pass `expect` the same way.
- The write reply gains `notices: string[]`.
- `/schema` serves `lifecycle: { column }` per source (hooks are functions and are not served). Task 4's grid reads it.
- Hooks fire on entering a hooked state (transition, or create through `POST /rows` or an action), never in undo, import or seed-missing.
- Validation: `column` is an options column; every `from` and `to` is an option; `token_projection` ⊆ columns (Task 9b adds the owner-visible rule).

- [ ] **Step 1: Tests** (each denial asserts status, code and `tables unchanged`):
  - validation refusals;
  - a create sets any option;
  - an undeclared transition is 422;
  - an owner making an editor's transition is 422;
  - a stale `expect` is 409 and a matching one is 200, revised;
  - an editor's a→b, undone, leaves `a`;
  - an undo after a later transition is 409 `changed_since`;
  - an undo back into a hooked state fires no hook;
  - a hook's mail reaches the recording mailer only after commit, and a later writer refusal leaves none;
  - a create into `b` fires the hook; an import into `b` does not;
  - a hook's notice is in the reply;
  - pinning (deleted in Task 3): a hook's `token` mints nothing yet;
  - `/schema` serves `lifecycle: { column }` for a source declaring one, and nothing for one that doesn't.
- [ ] **Step 2:** Run `bun test packages/engine/test/lifecycle.test.ts`; expect it to fail.
- [ ] **Step 3:** Implement. `restore` sets the undo mode from the batch's own revision (first `old`, last `new`, writes.ts:478-482).
- [ ] **Step 4:** Run `bun test packages`; expect it to pass. Run `bun run check`.
- [ ] **Step 5:** Commit `feat(engine): the lifecycle: transitions in the shared write path, expect, undo by inverse, hooks after commit`.

### Task 3: Account kinds, the action token, `/act`

**Files:** Modify `auth-tables.ts` (`account`: `kind` default `'user'`, `name`, `token_hash`, nullable `email`, `CHECK ((kind = 'user') = (email IS NOT NULL))`), `engine-tables.ts` (`action_token`), `declare.ts` (`Actor.kind?`), `auth.ts` (`sessionMiddleware`: `kind = 'user'`; `accountOut`), `history.ts` (`whose()`), `rate-limit.ts` (`failureLimiter`), `writes.ts`/`actions.ts` (mint in the transaction; undo marks the batch's tokens used), `app.ts` (`actionTokenRoutes` before `authRoutes`), `apps/grid/src/types.ts` and `ui/HistoryPanel.tsx` (`by: 'link'`), `i18n.ts`. Create `packages/engine/src/action-token.ts`. Test `packages/engine/test/action-token.test.ts`, `route-matrix.test.ts`, `apps/grid/src/ui/HistoryPanel.test.tsx`. Delete Task 2's pinning test.

**Interfaces:**
- Produces `linkAccount(sqlite, subject: { dataset: string; id: number }): Actor`.
  - It finds or inserts `{ kind: 'link', role: 'owner', subject, email: NULL }` with its own insert, not `createAccount`, whose `emailOf` requires an address (auth.ts:80).
  - Uniqueness per `(kind, subject)` is kept inside the immediate transaction; there is no constraint, since a table UNIQUE would also bind user owners.
  - Task 9a uses it.
- Produces `mintActionToken(sqlite, { dataset, record_id, subject, from, to: string[], days, batch }): string`.
  - `from` is the hooked state, i.e. the transition's `to`. `batch` is the write's key. `subject` is the record's owner at mint: `{ dataset: owner column's relation, or the dataset itself for `id`, id }`.
  - Minting revokes the record's outstanding tokens.
  - Table `action_token (hash, dataset, record_id, subject_dataset, subject_id, from_state, to_states, expires_at, used_at, minted_batch)`.
- Produces `noStoreHeaders()` (`Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`) and `failureLimiter(key, max, windowMinutes)`.
- Routes:
  - `POST /act/view { token }` → `{ dataset, projection }`, where `token_projection` columns are served with relation columns as their titles.
  - `POST /act { token, to }`: consume and `runWrite`, in one transaction, as `linkAccount(token's subject)`, on the token's record, with `expect` set to `from_state`.
    - A `to` not in `to_states` is 422 `transition_not_allowed`.
    - `/act/view` reads as the same link account, so a reassigned token is 401 there too.
    - A failure is counted outside the transaction (a 401 rolls it back).
    - A record with an empty owner column mints no token.
    - Bad, used, expired tokens, or ones whose record's owner moved, get one identical `401 bad_token`.
    - A refused transition leaves the token unused.
- `whose()`: `by: 'link'` with `actor` = the subject's title; `COALESCE(email, name)` otherwise. The grid's history shows "bevestigd door <naam>".

- [ ] **Step 1: Tests:**
  - the account migration on an existing db: kind `user`, a rebuild with `.pre-migrate`, references intact (`test/auth.test.ts:261` pattern);
  - a link account is created once;
  - mint, view, act: the row moves, and the batch actor is the link account;
  - garbage, used (a second `/act`), expired (aged by SQL) and reassigned tokens (the owner column changed after mint) get one identical 401, with the row unchanged;
  - an editor confirms first, then `/act` is 409 and the token stays unused;
  - an editor's undo of the token batch is 403;
  - an undo of the minting batch marks the token used, and `/act` is then 401;
  - a re-mint revokes the earlier token;
  - a hooked state entered on a record whose owner column is empty mints no token, and the hook's mail gets a null link;
  - the 21st failure from one address is 429;
  - `route-matrix` rows;
  - no `Access-Control-*`; the three headers on every response, 401 included;
  - in the grid's history panel: "bevestigd door <naam>".
- [ ] **Step 2:** Run the tests; expect them to fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `bun test packages && bun run --filter @worktable/grid test`; expect them to pass. Run `bun run check`.
- [ ] **Step 5:** Commit `feat(engine): account kinds and the single-purpose action token`.

### Task 4: Toewijzing slot-first, and `expect` in the grid and the matrix

**Files:**
- `packages/theatre/src/datasets.ts` (toewijzing):
  - `rol_id` nullable relation to `rol`;
  - `aantal` integer default 1;
  - `voorlopig` with a tone, `marks.voorlopig: '~'`, key `v`;
  - `lifecycle` with the brief's transitions (editor and administrator, owner for the two token transitions);
  - `token_projection: ['activiteit_id', 'rol_id', 'state']` (the activity's title carries day and place).
- `writers.ts`:
  - `checkAssignee` `:130-139`: an `open` row with a role and neither person nor name; the duplicate rule for filled rows only;
  - on create, the state is `open` when neither person nor name is given, else what is given, else `voorlopig` or `uitgenodigd` per Q13;
  - `forPlanners` `:62-80`: admit an owner's transition on its own row.
- `apps/grid`:
  - a lifecycle cell edit sends `expect`, routed around `toEngineData` in `api.update` (`api.ts:154`, `engine.ts:361-369`);
  - the grid reads `lifecycle.column` from `/schema` (`EngineSource`);
  - the matrix store's `changed()` sends `expect` only when the cell field changes (a note edit's body stays exactly `{ notitie }`, `e2e/react-aria.spec.ts:640`);
  - **the matrix keeps one op stack** (`matrix/store.ts:328-389`). On a join whose cell field is the lifecycle column (theatre's), every op that writes that field (a key, fill-down, paste) keeps its write's batch, and its undo and redo go through `undoBatch(batch)` per op in reverse, instead of re-sending a PATCH (which would be a refused write-mode transition). Three cases are skipped with the Dutch notice "Verwijderen kan niet ongedaan gemaakt worden" and write nothing, because each would be a create into a hooked state (a re-invite, threat 7) and undo of a delete is out of scope (spec.md Out): undoing a cleared cell, including a cleared cell inside a fill or paste; and redoing an undone create (whose undo batch holds a delete, which cannot be undone, writes.ts:473), with the notice "Opnieuw doen kan hier niet". A skipped op is dropped from its step: the step's other ops still undo or redo, and the step moves to the other stack without it, so the stack never jams on it (today `execute()` stops at the first op that does not land, store.ts:283-292, 352-370). Each lifecycle op carries its current batch and replaces it on every undo and redo (an undo returns its own batch, api.ts:181-184). Note edits, and every op on a join whose cell field is not a lifecycle column, keep today's path;
  - `MatrixJoin` learns the lifecycle column (`types.ts:179-191`, built at `engine.ts:181` from `/schema`);
  - the matrix's API carries the batch: `MatrixApi.create` and `update` return `{ row, batch }`, and `MatrixApi` gains `undoBatch` (`matrix/store.ts:7-11`); the adapter in `matrix/hooks.ts:7-11` stops stripping `Saved.batch`, and its comment (`:6`) goes;
  - `i18n.ts` gets `transition_not_allowed` and `transition_lost` in Dutch.

Test `packages/theatre/test/toewijzing.test.ts`, `access.test.ts:91` rewritten, `parity.test.ts:61-77`, `apps/grid/src/grid/Grid.test.tsx`, `apps/grid/src/matrix/store.test.ts`.

- [ ] **Step 1: Tests:**
  - an open row with a role is accepted; without a role it is refused in Dutch;
  - a create with neither person nor name becomes `open`;
  - the duplicate person is refused only when filled;
  - each declared transition passes for an editor and an administrator;
  - geweigerd → bevestigd is 422 in Dutch;
  - an owner may confirm or decline its own uitgenodigd row and nothing else;
  - two PATCHes with the same `expect`: one 200, one 409;
  - the import of `packages/theatre/test/fixtures/invented-export.json` is unchanged (`rol_id` null, `aantal` 1, no mail);
  - grid: a state edit sends `expect`; a 409 refreshes the row and shows the Dutch message;
  - matrix, on a lifecycle join: `u` then `b` then Ctrl+Z restores through batch undo with no 422, and Ctrl+Shift+Z redoes it; interleaved state and note edits undo in order from one stack; Ctrl+Z after clearing a cell shows the notice and writes nothing; paste empty over an `uitgenodigd` cell, Ctrl+Z: the notice shows, nothing is written, no mail; a fill-down of `b` over three `u` cells undoes per op through batch undo; empty→`u`, Ctrl+Z, Ctrl+Shift+Z: the redo is skipped with its notice, no mail; clear a cell after an earlier `u`→`b`: Ctrl+Z shows the notice, and a second Ctrl+Z undoes the `u`→`b`; paste `b` and empty over two `u` cells: Ctrl+Z restores the `b` cell to `u` and skips the cleared one;
  - matrix, on a non-lifecycle join: today's re-create undo is unchanged (the assertions of `store.test.ts:234, 254, 274, 316` kept; their fake, `:46-52`, returns `{ row, batch }` and gains `undoBatch`; lifecycle variants added beside them);
  - matrix: a state key on a cell whose state moved on the server is 409, the cell refreshes, and the Dutch message shows;
- [ ] **Step 2:** Run `bun test packages/theatre && bun run --filter @worktable/grid test`; expect them to fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same commands, plus `bunx playwright test e2e/step-0d.spec.ts e2e/step-0e.spec.ts` (the matrix undo flows); expect them to pass. Run `bun run check`.
- [ ] **Step 5: Look at it:** open slots with a role, the new states, a refused transition in Dutch.
- [ ] **Step 6:** Commit `feat(theatre): Toewijzing slot-first on the lifecycle`.

### Task 5: Actions update and nest

**Files:** Modify `declare.ts` (`ActionDecl.run` `:160-165`), `actions.ts` (`runAction`, `:57-78`). Test `packages/engine/test/actions.test.ts`.

**Interfaces:**
- Produces `type ActionCreate = { dataset: string; values: Values; then?: (id: number) => ActionCreate[] }`.
- Produces `type ActionResult = ActionCreate[] | { creates?: ActionCreate[]; updates?: { dataset: string; id: number; values: Values; expect?: Record<string, unknown> }[] }`.
- An update's row is read in the caller's scope (404 outside it) with `ctx.current` the live row. It goes through `writableOf('update')`, `valuesOf` and the transition check.
- `then` runs after its parent is created, with its id.
- Everything is one `action` batch, and one undo reverses it.

- [ ] **Step 1: Tests:**
  - an update through the writer, where a refusing writer rolls everything back;
  - an update outside an owner's scope is 404;
  - a nested create gets its parent's id;
  - one undo reverses an update, a create and a nested create;
  - `copy_notes` is unchanged;
  - an update entering a hooked state fires the hook after commit.
- [ ] **Step 2:** Run `bun test packages/engine/test/actions.test.ts`; expect it to fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `bun test packages`; expect it to pass.
- [ ] **Step 5:** Commit `feat(engine): actions update and nest creates under one batch`.

### Task 6: Templates with slots, `--seed-missing` by natural key

**Files:**
- `packages/theatre/src/writers.ts` (`checkItem` `:250-263`): `slots: [{ rol: <Rol title>, aantal }]`, with a live Rol title and a positive integer.
- `actions.ts` (`sjabloon_toepassen` `:323-339`): nested creates of open Toewijzingen per slot, `state: 'open'` explicit, `rol_id` resolved by title.
- `seed.ts`: the "speeldag op locatie" sjabloon gets slots.
- `packages/engine/src/seed-missing.ts` (`seedDataset` `:48-79`): per seed row, insert when no row, live or deleted, carries its title; never update; count inserted. Leave a for-owners system view alone, as a public one is (Task 9b adds the flag; this task adds the guard on `public` only and Task 9b extends it).

Test `packages/theatre/test/apply.test.ts`, `seed-missing.test.ts` (engine and theatre, today's "has rows" tests rewritten).

**Interfaces:** `DatasetOutcome` becomes `{ inserted: number; present: number } | 'not config'`; the log reads `seed-missing: sjabloon 1 inserted, 0 present`.

- [ ] **Step 1: Tests:**
  - a slot naming an unknown role, or with `aantal` 0, is refused in Dutch;
  - a four-day template with two slots per day creates the activities and the open Toewijzingen in one batch, and one undo removes them;
  - an existing db with the Rol rows and a Sjabloon of another title: `--seed-missing` inserts "speeldag op locatie" with slots, nothing else changes, and a second run inserts nothing;
  - a db already holding an unslotted "speeldag op locatie" keeps it (never update);
  - a planner-deleted row counts as present;
  - a renamed seeded Rol: `--seed-missing` re-adds the original title (pinned), and an apply naming the new title succeeds while one naming a title no live Rol has refuses, naming it.
- [ ] **Step 2:** Run `bun test packages`; expect it to fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `bun test packages`; expect it to pass. Run `bun run check`.
- [ ] **Step 5:** Commit `feat(theatre): templates with slots; seed-missing adds by natural key`.

### Task 7: The matrix open column and `vul_slot`

**Files:**
- `declare.ts`: `MatrixDecl.open?: { match: string; count: string; fill: string }`.
- `validate.ts` (`:160-190`).
- `packages/theatre/src/datasets.ts`: `open: { match: 'rol_id', count: 'aantal', fill: 'vul_slot' }`.
- `packages/theatre/src/actions.ts`: `vul_slot`.
- `apps/grid/src/engine.ts`: `EngineMatrix`, `joinOf`.
- `types.ts`: `MatrixJoin.open`.
- `matrix/store.ts`:
  - `asCell` keeps `lookups` for the role label;
  - a fifth `MatrixApi` call, `runAction`; the fill pushes a batch op onto the same op stack (Task 4's design).
- `matrix/columns.ts`: open rows kept.
- `matrix/Matrix.tsx`: a fixed leading open column in header, body and footer; the person picker for an open cell, asking the role first when there is more than one.

Test `packages/engine/test/matrix.test.ts`, `packages/theatre/test/matrix.test.ts`, `apps/grid/src/matrix/Matrix.test.tsx`, `store.test.ts`.

**Interfaces:** `vul_slot`:
- `on: 'toewijzing'`, input `{ persoon_id: { relation: 'persoon' } }`;
- aantal 1: an update setting `persoon_id` and `state: 'voorlopig'` with `expect: { state: 'open' }`;
- aantal > 1: an update to `aantal − 1` plus a create with aantal 1, the same `rol_id` and `activiteit_id`, the person, `voorlopig`.

- [ ] **Step 1: Tests:**
  - validation refuses a non-relation `match`, a non-integer `count`, and a `fill` naming no action, an action on another dataset, or a wrong input;
  - `vul_slot` on aantal 3 leaves 2 plus one filled row, and one undo restores it;
  - on aantal 1 the row is filled in place, and undo empties it;
  - matrix: the open column shows the summed `aantal` and the role labels, with free-text names last;
  - two open roles: the picker asks the role first, in Dutch;
  - the fill's undo is a batch undo, and Ctrl+Z re-sends no write;
  - a `voorlopig` cell shows its mark.
- [ ] **Step 2:** Run `bun test packages && bun run --filter @worktable/grid test`; expect them to fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same commands; expect them to pass. Run `bun run check`.
- [ ] **Step 5: Look at it:** the matrix with open counts; fill one of three; undo.
- [ ] **Step 6:** Commit `feat: the matrix open column and the fill action`.

### Task 8: Invites and the `#/act` page

**Files:**
- `packages/theatre/src/datasets.ts`: the Toewijzing hook on `uitgenodigd`:
  - `token: { to: ['bevestigd', 'geweigerd'], days: 14 }`;
  - `mail` to the person's email with the link;
  - `notice` "Geen uitnodiging: <naam> heeft geen e-mailadres." when there is none, and then no `token` (a name-only row has no owner and mints nothing).
- `apps/grid/src/ui/App.tsx`: `landing()` handles `#/act/<token>`.
- Create `apps/grid/src/ui/Act.tsx`: strip the hash first, POST `/act/view`, show the projection, and Bevestigen and Weigeren as POSTs to `/act`.
- `api.ts`, `i18n.ts`.

Test `packages/theatre/test/invite.test.ts`, `apps/grid/src/ui/Act.test.tsx`.

- [ ] **Step 1: Tests:**
  - a move to uitgenodigd, or a create as uitgenodigd per Q13, for a person with an email puts one mail with a `#/act/` link in the outbox;
  - without an email: no mail, the Dutch notice in the reply, and the grid shows it;
  - `/act/view` carries only the projection (the activity's title, the role's title, the state);
  - confirm and decline move the row, and the planner's grid shows `geweigerd`;
  - the page: the hash is gone before any request; refusals read in Dutch (`bad_token` "Deze link werkt niet meer", `transition_lost` "Al beantwoord"); no GET is sent.
- [ ] **Step 2:** Run the tests; expect them to fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `bun test packages && bun run --filter @worktable/grid test`; expect them to pass. Run `bun run check`.
- [ ] **Step 5: Look at it:** invite, open the mailed link in a fresh browser, confirm.
- [ ] **Step 6:** Commit `feat: invites through the lifecycle hook, and the confirm page`.

### Task 9a: The record link, the link actor, confinement, the request route

**Files:** Create `packages/engine/src/record-link.ts`. Modify `declare.ts` (`DatasetDecl.record_link?: { email?: string }`), `validate.ts`, `engine-tables.ts` (`record_link (dataset, record_id, version, rotated_at, rotated_by)`), `auth.ts` (a `RecordLink` header branch, a sibling checked before the cookie, so Task 11 adds a second sibling), `app.ts` (`confineLinkActor` right after authentication; `recordLinkRequest` before `authRoutes`; `GET` and `POST …/rotate` on `/record-links/:dataset/:id`), `app.ts`/`serve.ts` (`linkSecret` per the Global Constraints), `test/sign-in.ts` (a fixed test secret). Test `packages/engine/test/record-link.test.ts`, `route-matrix.test.ts`.

**Interfaces:**
- Produces `recordLinkFor(sqlite, secret, dataset, id): string`.
- Produces `verifyRecordLink(sqlite, secret, token): Actor`, via `linkAccount`, or `401 bad_link`.
- Produces `confineLinkActor` middleware.
- Re-copy and rotate are for a human administrator only; a service account gets 403 in the handler.

- [ ] **Step 1: Tests:**
  - the link is stable; rotate kills the old one; a rotation is never undone;
  - malformed, wrong MAC, wrong dataset, bumped version, overlong and deleted-record tokens get one identical 401; the 21st failure is 429;
  - `createEngine` throws without a secret when a domain declares `record_link`;
  - `serve.ts` refuses a missing, short or readable file when serving, and `--create-account` runs without one;
  - a link actor gets 403 on `/schema`, `/rows`, `/views`, `/history`, `/revisions`, writes, `/actions` and undo, with tables unchanged;
  - the request route answers byte-identically for known, unknown and deleted addresses, with nothing written before the response and one outbox mail per live match (two records sharing an email get one each, with their own links); 429 per its two limits;
  - `Cache-Control: no-store`, `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex` on every `/record-links/*` response, the request route and every 401;
  - revoke is the version bump (rotate without handing out the new link): the old link is 401;
  - validation refuses `record_link` without `owners`, or a non-text `email`;
  - `route-matrix` rows.
- [ ] **Step 2:** Run `bun test packages/engine`; expect it to fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `bun test packages`; expect it to pass. Run `bun run check`.
- [ ] **Step 5:** Commit `feat(engine): record links, the link actor and its confinement`.

### Task 9b: Views for owners

**Files:** Create `packages/engine/src/owner-views.ts`. Modify `declare.ts` (`ColumnDecl.owner_visible?: boolean`), `validate.ts` (not on json, not on the owner column; `token_projection` columns must be owner-visible), `saved-view.ts` (`for_owners`), `views.ts`:
- `setForOwners`;
- `checkPublishable` (views.ts:298-304) refuses share-token on a for-owners view (`already_for_owners`);
- `DELETE /views/:id` clears `for_owners` (views.ts:273);
- the `public_view` guard (views.ts:174-176) covers `for_owners`.

Also `packages/theatre/src/datasets.ts` (`owner_visible` on `toewijzing.activiteit_id`, `rol_id` and `state`, so theatre's `token_projection` still validates; `migrate` runs `validateDomain`, migrate.ts:92), `seed-missing.ts` (leave a for-owners system view alone) and `app.ts` (`GET /owner/views`, `GET /owner/views/:id/rows`, `PUT` and `DELETE /views/:id/for-owners`). Test `packages/engine/test/owner-views.test.ts`, `route-matrix.test.ts`.

**Interfaces:**
- Produces `ownerRows(db, domain, view, actor, params)`: scoped with `scopeOf(actor, source)`, never `'all'`; the listed keys only.
- `GET /owner/views` answers each view's column keys, labels and types itself: a link actor cannot read `/schema`.
- `owner.views` is open to role `owner` of any kind; an editor or administrator session gets 403.
- Reads are limited to 60 per address per minute, counting every request, failing closed.

- [ ] **Step 1: Tests:**
  - `setForOwners` refusals, each naming the key: a dataset view, no owner column, a public view, a non-owner-visible visible field, filter, sort or group key, a link key. An editor or a service account gets 403. A later PATCH adding a hidden column is refused. `PUT share-token` on a for-owners view is `already_for_owners`. A deleted then restored view is not for owners.
  - The leak script as a test: for every view for owners, every key of every row is owner-visible, with no `id`, `title`, `lookups`, `custom` or `links`. Filter, sort and group on anything else, inside `$or` too, are 400 naming it.
  - An owner session and a link for the same subject read the same list; an editor session is 403.
  - The 61st read in a minute is 429.
  - The three headers on every `/owner/views*` response, 401 included.
  - `--seed-missing` leaves a for-owners system view's `visible_fields` alone.
  - Validation refusals.
- [ ] **Step 2:** Run `bun test packages/engine`; expect it to fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `bun test packages`; expect it to pass. Run `bun run check`.
- [ ] **Step 5:** Commit `feat(engine): views for owners with owner-visible columns`.

### Task 10: Person pages: theatre, `#/link`, the admin's controls

**Files:**
- `packages/theatre/src/datasets.ts`: `persoon.record_link = { email: 'email' }`; `owner_visible` on the member-facing columns (beyond the three Task 9b marked).
- `queries.ts`: `mijn_producties`.
  - `owners: { owner: 'persoon_id' }`, with `persoon_id: { relation: 'persoon' }` so `pointsAt` scopes it (access.ts:58-61).
  - A `date` column (the production's last day).
  - `toegang_dagen` read as `COALESCE(json_extract(o.parameters, '$.toegang_dagen'), 30)` from the organisation with `soort = 'eigen'`.
- `seed.ts`: the "Mijn producties" view, not for owners; the admin publishes it.
- `scripts/parity.ts`: passes a test secret.
- `scripts/shakeout/edit-session.ts` (`:111-125`): writes its secret file with `writeFileSync(…, { mode: 0o600 })` then `chmodSync(…, 0o600)` (a leftover file keeps its old mode otherwise) and passes `--link-secret-file`.
- `apps/grid`:
  - `App.tsx`: `#/link/<token>`;
  - `ui/LinkPage.tsx`: the token kept in memory, sent as `Authorization: RecordLink`, hash stripped; lists the views for owners and renders their rows read-only;
  - `api.ts`: an injectable header;
  - `ui/Share.tsx`: "Voor eigenaars publiceren" for an administrator on a qualifying view;
  - `grid/Drawer.tsx`: "Link kopiëren" and "Nieuwe link" for an administrator on a dataset declaring `record_link`;
  - `index.html`: referrer and robots meta.
- `playwright.config.ts`: the secret written in the web-server command, and `--link-secret-file e2e/.tmp/link-secret`.

Test `packages/theatre/test/person-pages.test.ts`, `apps/grid/src/ui/LinkPage.test.tsx`, `ui/Share.test.tsx`, `grid/Drawer.test.tsx`.

- [ ] **Step 1: Tests:**
  - `mijn_producties`:
    - a bevestigd row opens the production until `toegang_dagen` after its last activity;
    - geweigerd, geannuleerd, uitgenodigd and open do not;
    - the parameter is read and defaults to 30;
  - "Mijn producties" publishes for owners; a view listing `notitie`, `dietary` or a rate is refused, naming it;
  - LinkPage: the header is sent, the hash is stripped, only the person's productions show, and a 401 shows "Deze link werkt niet meer";
  - Share and Drawer: the controls show for an administrator only, and call the routes;
  - `index.html` holds both meta tags.
- [ ] **Step 2:** Run the tests; expect them to fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `bun test packages && bun run --filter @worktable/grid test`, then `bun run e2e` (the engine must start with the secret); expect them to pass. Run `bun run check`.
- [ ] **Step 5: Look at it:** publish "Mijn producties", copy a person's link, open it in a fresh browser, rotate it, reload.
- [ ] **Step 6:** Commit `feat: person pages through the record link`.

### Task 11: Service accounts, Bearer, OpenAPI

**Files:** Modify `serve.ts` (`--create-service <name> [--role editor|administrator]`, `--disable-service`, `--rotate-service`; their own insert, not `createAccount`), `auth.ts` (`bearerActor`, the second sibling branch), `views.ts` and `record-link.ts` (service refusals in the handlers), `rate-limit.ts` (600/min per account), `app.ts` (`/schema?format=openapi`), `e2e/global-setup.ts` (a service account for `/shakeout`). Create `packages/engine/src/openapi.ts`. Test `packages/engine/test/service.test.ts`, `openapi.test.ts`, `route-matrix.test.ts`.

- [ ] **Step 1: Tests:**
  - the CLI prints the token once; a duplicate name and `--role owner` are refused; rotate makes the old token 401;
  - a valid Bearer authenticates; wrong, overlong, disabled and session-id tokens get one 401 body; a valid cookie with a bad Bearer is 401; the 21st failure is 429;
  - a write is logged as the service and shows its name in history; it undoes its own batch, and a human's undo of it is 403; after disable its next write is 401; the 601st request in a minute is 429;
  - an administrator service gets 403 on record links, share-token and for-owners, with tables unchanged;
  - write guard: 415 without JSON, 403 cross-site;
  - OpenAPI: writable paths and enums match the declaration; an owner's document lists only its sources; a link actor is 403; plain `/schema` carries no OpenAPI keys.
- [ ] **Step 2:** Run `bun test packages/engine`; expect it to fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `bun test packages`; expect it to pass. Run `bun run check`.
- [ ] **Step 5:** Commit `feat(engine): service accounts by Bearer token, and OpenAPI from /schema`.

### Task 12: Migration on a copy

**Files:** Test `packages/theatre/test/migrate.test.ts`; create `specs/step-2/real-data.md`.

- [ ] **Step 1: Test** (a characterisation test of code the earlier tasks built, so it may pass on its first run):
  - a seeded step-1 theatre file migrates: `rol_id` and `aantal` by ALTER; `record_link`, `action_token` and `saved_view.for_owners` added; the `account` rebuild as Task 3 pins it;
  - every row, revision and id survives;
  - imported Toewijzingen keep a null role;
  - `bun run parity packages/theatre/test/fixtures/invented-export.json` reports 0 mismatches.
- [ ] **Step 2:** Run `bun test packages`; expect it to pass.
- [ ] **Step 3:** Write `specs/step-2/real-data.md`, the commands Stefan runs on a copy, none run here, each with what its output must show:
  - copy the database;
  - `serve.ts --db <copy> --link-secret-file <file>` (migrate);
  - `--seed-missing`;
  - `bun run parity <export>`;
  - the value-parity script.

  Note there:
  - Laika's `maybe` stays mapped to `uitgenodigd`; remapping it to `voorlopig` changes the exporter and the parity rules, and needs Stefan's ruling;
  - a database with an unslotted "speeldag op locatie" keeps it.
- [ ] **Step 4:** Run `bun run gate`; expect it to pass.
- [ ] **Step 5:** Commit `test(step-2): migration on a copy; the real-data commands for Stefan`.

## Close

Per `netdust-gates:policy`. This repo has no Makefile, so the review is `/feature-review`.
1. `bun run gate`.
2. `/feature-review step-2` with `security-sentinel` (the plan carries a threat model).
3. One fix pass.
4. `/shakeout`: it writes and drives the E2E flows of the Test map (the brief's gate) in a real browser, registers them, and takes one screenshot per surface.
5. Then the after-gate report: a read-only paper declaration of cargovelo-core and of the studio draft against the built engine, naming every engine change either would need, plus the four-item report and the matrix findings. Their sources are asked of Stefan if they are not in the repo.

## Questions Stefan answers before Task 0

Narrowed after the advisor's independent view (`specs/step-2/questions-advisor.md`), which agrees with every recommendation:

- **Q14 (his action):** commit his staged `docs/SPEC.md` edits on `feature/step-2` first, or say "fold them in". If he is away, Task 0 builds the blob from `HEAD:docs/SPEC.md` and keeps his edits in the working file.
- **Q1 (his nod):** Beschikbaarheid.soort, Persoon_rol and plan-side cost move to step 3 with kandidaten.

**Taken as defaults, reported to Stefan:**
- **Q4:** `for_owners` / `owner_visible`.
- **Q5:** the `record_link` engine table.
- **Q11:** the confirmation is logged as the person's link account. Task 0 also rewords `docs/SPEC.md:306` ("no app, no account") to say the link account is an internal actor row, never a sign-in.
- **Q12:** the fill writes `voorlopig`.
- **Q13:** a create into `uitgenodigd` through the grid invites at once (SPEC.md:232). The brief's "(no invite)" is read as qualifying a direct `bevestigd` only.
