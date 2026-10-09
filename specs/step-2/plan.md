# Step 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toewijzing slot-first on an engine lifecycle with single-purpose action tokens, templates with slots, the matrix open column and fill, person pages through a stable record link, and agent tokens.

**Architecture:** Five engine shapes, each opt-in and domain-free:
- the lifecycle, a transition check in the shared write path (`valuesOf`);
- actions that also update and nest creates;
- `record_link` with views for owners;
- the action token;
- account kinds `user · service · link`.

Theatre declares the names: the Toewijzing lifecycle and invite hook, `vul_slot`, Sjabloon slots, `mijn_producties`, owner-visible columns. The grid gains the open column, the `#/act` and `#/link` pages, and `expect` on lifecycle edits.

**Tech Stack:** Bun, Hono, SQLite, TypeScript; Bun tests (engine, theatre), Vitest (grid), Playwright (e2e).

**Spec:** `specs/step-2/spec.md`; the design is `specs/step-2/findings.md`, with the advisor's full F1/F2 draft at `specs/step-2/f1-f2-advisor-draft.md` and the code facts behind this plan at `/tmp/claude-1000/worktable-step-2/plan-facts.md` (copied to `specs/step-2/plan-facts.md`).

**First working version:** Task 4. Toewijzing slot-first with its lifecycle in the running grid: open rows with a role, the new states, and a refused transition shown in Dutch. Tasks 1-3 are the engine it stands on and have nothing to see.

**Simplest design:** Theatre-only: put the transition table and the invite in the Toewijzing writer, mint tokens in theatre, and add a theatre route for confirm. The plan does not use it:
- the brief makes the lifecycle, the action token, the person link and service accounts engine shapes;
- AGENTS.md forbids domain routes and words in the engine;
- a writer cannot see undo's mode or give a 409 on a lost race.

Inside the engine the plan keeps each shape minimal:
- one check in `valuesOf`, not a transition route;
- hooks return data instead of doing I/O;
- the link is stateless (an HMAC over a version);
- the link actor and the service account are `account` rows, so audit, undo and history need no second actor model.

## Global Constraints

- `packages/engine` knows no domain word and imports no domain package (`bun run check`). New engine words: lifecycle, transition, record link, action token, owner view, service. Add `aantal` to `scripts/vocabulary-allow.txt` with its reason (the engine fixture already uses it, `test/fixture.ts:111`).
- Every requirement's working assumption is in `specs/step-2/spec.md`. If Stefan answers a finding's question differently, the spec and this plan change before the code does.
- `docs/SPEC.md` holds Stefan's staged edits. Commit only the lines Task 0 writes (index blob, never `git add docs/SPEC.md`), and commit everything else by path.
- No client data in tests or fixtures; `bun scripts/check-export-terms.ts` on every commit. Fixtures are invented (`@example.test`, `@e2e.test`).
- Dutch for every user-facing string (`apps/grid/src/i18n.ts`, theatre refusals), English and generic names in the engine.
- Tokens: 32 random bytes, sha256 at rest, `timingSafeEqual`, capped at 128 characters (`views.ts:33`). Secrets never in the database, never logged. Only the development mailer may log.
- Sessionless routes are registered before `authRoutes` (`app.ts:166`, `auth.ts:189-193`). Every public route keeps the Host check and the write guard, sends no CORS header, and is rate-limited, failing closed.
- Creates are never transitions (import, seed-missing and parity stay unaffected). Toewijzing's `state` default stays `'uitgenodigd'`: changing a DDL default rebuilds the table (`schema-diff.ts:46-47`).
- Real data is Stefan's: the plan prints the commands of the real-data run and runs none.

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
1. **An outsider guesses or forges an action token** at `POST /act` → 256-bit random, sha256 lookup, constant-time compare, one identical 401, 20 failures per address per 15 min (`actionTokenRoutes`).
2. **A person replays their used or expired token, or uses slot A's token on slot B** → `UPDATE action_token SET used_at … WHERE hash = ? AND used_at IS NULL AND expires_at > ? AND record_id = ?`. Also the owner scope: the link actor's subject must equal the row's `persoon_id` (`scopeOf` in `runTransition`).
3. **Two confirmations race** → `expect` compared inside the immediate transaction, 409 `transition_lost` (`checkTransition`).
4. **An editor PATCHes an undeclared transition**, or an owner one reserved to editors → role table in `checkTransition`, 422 `transition_not_allowed`.
5. **Undo writes a transition no one may make** → undo mode allows only the batch's exact inverse, behind `changed_since` (`checkTransition` undo mode).
6. **An editor undoes a person's confirmation** → batch actor is the person's link account; `undoableBatch` refuses others (`writes.ts:463-464`).
7. **The invite mail is sent for a write that rolls back** → hooks return data; mail is queued and sent after commit (`runWrite`/`runAction` after the transaction).
8. **An outsider forges a record link or enumerates persons** → HMAC-SHA256 with a ≥32-byte file secret, one identical `401 bad_link` on one code path (the MAC is computed for a missing record too), 20 failures per 15 min (`verifyRecordLink`).
9. **A rotated or revoked link keeps working** → the version is read on every request from the `record_link` engine table, which undo never touches (`writes.ts:475-476`).
10. **A link actor reads admin-only columns through `/rows`, `/schema` or `/history`** → `may()` by kind: a link actor is allowed `owner.views` only (`access.ts`).
11. **A link actor infers a hidden column through filter, sort, group or `total`** → request keys and the view's stored keys held to owner-visible columns, `$or` included, `custom.*` refused (`ownerRows`, `setForOwners`).
12. **An admin publishes a view for owners that exposes a hidden column** → `setForOwners` refuses a non-owner-visible visible field, filter, sort or group key, naming it; a later PATCH re-runs the check.
13. **The link-request route as an oracle or a spam lever** → byte-identical answer, delivery after the response, 20 per address and 5 per email per 15 min, nothing written (`recordLinkRequest`).
14. **A token leaks through Referer, logs or caches** → fragment URLs, `Authorization: RecordLink` header, `no-store`, `no-referrer`, `noindex`, meta tags in `index.html`, no logging middleware.
15. **A service account escalates** (mints links, publishes, manages accounts) → kind rule in `may()`; no route takes a role or kind from a body; accounts are CLI-only.
16. **A stolen service token is used** → rotate or disable from the CLI takes effect on the next request; 600/min per account, failing closed.
17. **A cookie and a Bearer are mixed, or a session id is offered as a token** → the header wins, the cookie is ignored, separate hash sets (`bearerActor`).

**Mitigations by location:**
- `checkTransition` and the `expect` read in the write route: 3, 4, 5.
- `undoableBatch` and the link-account actor: 6.
- Post-commit mail queue: 7.
- `actionTokenRoutes`: 1, 2.
- `verifyRecordLink` and `record_link`: 8, 9.
- `may()` kind rules: 10, 15.
- `ownerRows` and `setForOwners`: 11, 12.
- `recordLinkRequest`: 13.
- Owner headers middleware and `index.html`: 14.
- `bearerActor`: 16, 17.

**Deferrals:**
- **Mail delivery** (cutover): the outbox only. A forwarded mail carries a working link; rotating it is the remedy.
- **Owner accounts with a session** still read whole rows on `/rows`. The spec line changes now and the cut is built later (assumed Q9); step 2 issues no owner accounts to persons.
- **Notes written through the link:** a link actor writes nothing in step 2.
- **Editors previewing an owner view:** not built.

## Review Focus

1. Every mitigation above, each pointing at its Test map row.
2. A lifecycle write on a stale cell (the grid's `expect`) answers 409 and the grid shows the current state, never a silent overwrite (Task 4 grid test).
3. A Sjabloon slot naming a role by title on a migrated database whose role was renamed (Task 6 `seed-missing` test).
4. A fill on an activity with open slots for two roles asks which role first, and never fills the wrong one (Task 7 grid test).
5. A person with two live Persoon records sharing one email gets one mail per record, each with its own link (Task 9 test).

## Test map

| Unit | Seam | Tests: tier · file · command | E2E flows |
|---|---|---|---|
| 0. Spec of record + vocabulary | `docs/SPEC.md`, `bun run check` | check · `bun run check` | — |
| 1. Mailer | `createEngine({ mailer })`, `/auth/request` | unit · `packages/engine/test/mailer.test.ts`, existing `auth.test.ts` · `bun test packages/engine` | sign-in (existing) |
| 2. Lifecycle check, `expect`, undo mode, hooks | `PATCH /rows`, `POST /batches/:id/undo` | unit · `packages/engine/test/lifecycle.test.ts` (denials 3, 4, 5, 7) · `bun test packages/engine/test/lifecycle.test.ts` | — |
| 3. Account kinds, action token, `/act` | `POST /act`, `POST /act/view` | unit · `packages/engine/test/action-token.test.ts`, `route-matrix.test.ts` rows (denials 1, 2, 6) · `bun test packages/engine` | — |
| 4. Toewijzing slot-first (theatre) + grid `expect` | `PATCH /rows/toewijzing`, the grid cell | unit · `packages/theatre/test/toewijzing.test.ts`, `access.test.ts:91` rewritten, `parity.test.ts`; vitest `apps/grid/src/grid/Grid.test.tsx` · `bun test packages/theatre && bun run --filter @worktable/grid test` | disallowed-transition, stale-state-409 |
| 5. Actions update and nest | `POST /actions/:name` | unit · `packages/engine/test/actions.test.ts` · `bun test packages/engine/test/actions.test.ts` | — |
| 6. Templates with slots + seed-missing by key | `POST /actions/sjabloon_toepassen`, `serve.ts --seed-missing` | unit · `packages/theatre/test/apply.test.ts`, `seed-missing.test.ts` (engine and theatre) · `bun test packages` | apply-template-with-slots |
| 7. Matrix open column + `vul_slot` | `/schema` matrix, `POST /actions/vul_slot`, the matrix render | unit · `packages/engine/test/matrix.test.ts`, `packages/theatre/test/matrix.test.ts`; vitest `apps/grid/src/matrix/*.test.tsx` · `bun test packages && bun run --filter @worktable/grid test` | fill-splits-slot-and-undo, open-counts |
| 8. Invites and the `#/act` page | invite hook, `#/act/<token>` | unit · `packages/theatre/test/invite.test.ts`; vitest `apps/grid/src/ui/Act.test.tsx` · same | invite-in-outbox, confirm-without-login, reused-or-expired-refused, token-a-not-b, decline-shows-geweigerd, simultaneous-confirm-409, no-email-no-invite |
| 9. Record link and views for owners (engine) | `/record-links/*`, `/owner/views*`, `PUT /views/:id/for-owners` | unit · `packages/engine/test/record-link.test.ts`, `owner-views.test.ts`, `route-matrix.test.ts` (denials 8-14) · `bun test packages/engine` | — |
| 10. Person pages (theatre + grid) | `mijn_producties`, `#/link/<token>` | unit · `packages/theatre/test/person-pages.test.ts`; vitest `apps/grid/src/ui/LinkPage.test.tsx` · same | link-shows-own-projects-only, owner-view-key-script, rotated-link-refused, link-request-identical, declined-or-invited-no-project |
| 11. Service accounts, Bearer, OpenAPI | CLI, `Authorization: Bearer`, `/schema?format=openapi` | unit · `packages/engine/test/service.test.ts`, `openapi.test.ts`, `route-matrix.test.ts` (denials 15-17) · `bun test packages/engine` | agent-token-write-undo-revoke |
| 12. Migration on a copy | `migrate` on a seeded theatre file | unit · `packages/theatre/test/migrate.test.ts`, `packages/engine/test/auth.test.ts` (account rebuild) · `bun test packages` | — |

The brief's gate lines map onto the E2E flows of rows 6, 7, 8, 10 and 11. `/shakeout` drives and registers them.

---

### Task 0: The spec of record

**Files:** Modify `docs/SPEC.md` (only the lines below), `scripts/vocabulary-allow.txt`. Create `specs/step-2/plan-facts.md` (copy of the advisor's facts).

- [ ] **Step 1:** Write the `docs/SPEC.md` changes R1 lists:
  - the step 2 row and gate (SPEC.md:262, 292);
  - the Toewijzing row (SPEC.md:170): states with `voorlopig`, the brief's transitions, `rol_id`, `aantal`;
  - the record token paragraph (SPEC.md:43, 66) as two shapes, `record_link` and the action token;
  - Persoon without `token` and `user_id` (SPEC.md:160);
  - the Access table (SPEC.md:70-81): kinds `link` and `service`, and the owner-account column cut as a later step;
  - the matrix's `open` declaration replacing the generic fill rule (SPEC.md:46, 60);
  - Actions: updates and nested creates;
  - Views for owners next to public views (SPEC.md:55);
  - the new section "The engine's surface after step 2" from findings F5.
- [ ] **Step 2:** Stage only these lines. Build the blob from `git show HEAD:docs/SPEC.md` with the same edits, `git hash-object -w`, `git update-index --cacheinfo`. Apply the same edits to the working file, so Stefan's staged edits are kept there. Check that `git diff --cached docs/SPEC.md` holds only Task 0's lines.
- [ ] **Step 3:** Add `aantal` to `scripts/vocabulary-allow.txt` with its reason. Run `bun run check`; expect it to pass.
- [ ] **Step 4:** Commit `docs(step-2): the spec of record before any code`.

### Task 1: The Mailer

**Files:** Create `packages/engine/src/mailer.ts`. Modify `auth.ts` (`deliver`, `:98-115`), `app.ts` (`EngineOptions`, `:132-138`), `serve.ts`, `test/sign-in.ts`. Test `packages/engine/test/mailer.test.ts`.

**Interfaces:**
- Produces `interface Mail { to: string; subject: string; text: string }`.
- Produces `interface Mailer { send(mail: Mail): Promise<void> }`.
- Produces `outboxMailer(dir: string): Mailer`: keeps today's file format `To: <email>\n\n<text>\n` and mode 0600, and logs to stdout as `deliver` does.
- `EngineOptions.mailer?: Mailer`, defaulting to `outboxMailer(outbox)`. Tasks 2, 8 and 9 send through `c.get('mailer')` or the engine's mailer.

- [ ] **Step 1: Tests:** "sign-in mails through the Mailer" (a recording mailer gets one mail with the `#/auth/` link); "the outbox mailer writes the same file as before" (the `linkFor` reader still finds it).
- [ ] **Step 2:** Run `bun test packages/engine/test/mailer.test.ts`; expect it to fail.
- [ ] **Step 3:** Implement. `deliver` builds a `Mail` and calls `mailer.send`.
- [ ] **Step 4:** Run `bun test packages/engine`; expect it to pass. Run `bun run check`.
- [ ] **Step 5:** Commit `feat(engine): a Mailer interface; sign-in mails through it`.

### Task 2: The lifecycle: transition check, `expect`, undo mode, hooks

**Files:** Modify `declare.ts` (`DatasetDecl.lifecycle`), `validate.ts`, `writes.ts` (`valuesOf` `:317-339`, `runWrite` `:376-395`, `restore` `:511-529`), `app.ts` (PATCH route `:47-51`: read `expect`), `actions.ts` (post-commit mail). Test `packages/engine/test/lifecycle.test.ts`, with a fixture dataset added in the test (`lifecycleDomain`): `ticket` with `state` options a/b/c, transitions a→b (editor), b→c (owner), `*`→c (editor), a hook on `b`.

**Interfaces:**
- Produces `interface LifecycleDecl { column: string; transitions: { from: string[] | '*'; to: string; roles: Role[] }[]; hooks?: Record<string, (row: Values, ctx: WriteContext) => HookResult>; token_projection?: string[] }`.
- Produces `interface HookResult { token?: { to: string[]; days: number }; mail?: (link: string | null) => Mail | null; notice?: string }`.
- Produces `checkTransition(dataset: DatasetDecl, current: Values | null, next: Values, actor: Actor, mode: { kind: 'write'; expect?: string } | { kind: 'undo'; from: string; to: string }): void`. It throws 422 `transition_not_allowed` or 409 `transition_lost`. Called from `valuesOf`; the mode travels on `WriteContext.lifecycle`.
- The write reply gains `notices: string[]`, the hooks' notices: theatre's Dutch "geen e-mailadres". Hook mail is queued and sent after the transaction commits. A token the hook asks for is minted in Task 3; until then `token` is ignored, with a test pinning that.
- `PATCH /rows/:dataset/:id` takes `{ ...values, expect?: { [column]: value } }`. The route reads and removes `expect` before `runWrite`, since `cutBody` drops unknown keys (`writes.ts:75-77`).

- [ ] **Step 1: Tests** (each denial asserts the status, the code and `tables unchanged`):
  - validation refuses an unknown column, a non-options column, or an undeclared `from` or `to`;
  - a create sets any option;
  - an undeclared transition is 422;
  - an owner making an editor's transition is 422;
  - a stale `expect` is 409;
  - a matching `expect` is 200 and is revised;
  - an editor's a→b, undone, leaves the row at `a`;
  - an undo after a later transition is 409 `changed_since`;
  - a hook's mail reaches the recording mailer only after commit;
  - a hook in a batch that a later writer refusal rolls back sends nothing;
  - a hook's notice is in the reply.
- [ ] **Step 2:** Run `bun test packages/engine/test/lifecycle.test.ts`; expect it to fail.
- [ ] **Step 3:** Implement. `restore` sets `ctx.lifecycle = { kind: 'undo', from: <batch new>, to: <batch first old> }` from the batch's own revision (`writes.ts:478-482`).
- [ ] **Step 4:** Run `bun test packages`; expect it to pass. Run `bun run check`.
- [ ] **Step 5:** Commit `feat(engine): the lifecycle: transitions in the shared write path, expect, undo by inverse, hooks after commit`.

### Task 3: Account kinds, the action token, `/act`

**Files:** Modify `auth-tables.ts` (`account`: `kind` default `'user'`, `name`, `token_hash`, nullable `email`, `CHECK ((kind = 'user') = (email IS NOT NULL))`), `engine-tables.ts` (`action_token`), `declare.ts` (`Actor.kind`), `auth.ts` (`sessionMiddleware`: `kind = 'user'` only; `accountOut`), `history.ts` (`whose()`), `writes.ts`/`actions.ts` (mint the hook's token in the transaction; undo marks the batch's tokens used), `app.ts` (`actionTokenRoutes` before `authRoutes`). Create `packages/engine/src/action-token.ts`. Test `packages/engine/test/action-token.test.ts`, `route-matrix.test.ts`.

**Interfaces:**
- Produces `linkAccount(sqlite, subject: { dataset: string; id: number }): Actor`: finds or inserts `{ kind: 'link', role: 'owner', subject, email: NULL }`, unique per `(kind, subject_dataset, subject_id)`. Task 9 uses it.
- Produces `mintActionToken(sqlite, { dataset, record_id, from, to: string[], days, batch }): string` (the raw token) and the `action_token (hash, dataset, record_id, from_state, to_states, expires_at, used_at, minted_batch)` table.
- Routes:
  - `POST /act/view { token }` → `{ dataset, projection }`, `token_projection` columns only;
  - `POST /act { token, to }` → the transition through `runWrite` as `linkAccount(owner of the record)`, with `expect` set to the token's `from`.
  - A bad, used, expired or out-of-scope token gets one identical `401 bad_token`. 20 failures per address per 15 min. The F1 headers.
- `whose()` answers `by: 'link'` with `actor` = the subject's title for a link account, and `COALESCE(email, name)` for a service account.

- [ ] **Step 1: Tests:**
  - the account migration on an existing db: kind `user` on old rows, a rebuild with `.pre-migrate`, references intact (`test/auth.test.ts:261` pattern);
  - a link account is created once;
  - mint, view, act: the row moves, and the batch actor is the link account;
  - reused, expired (aged by SQL), other-record and garbage tokens get one identical 401, with tables unchanged except `rate_limit`;
  - two concurrent `/act` calls on one row give one 200 and one 409;
  - an editor's undo of the token batch is 403;
  - an undo of the minting batch marks the token used, and `/act` is then 401;
  - `route-matrix` rows for both routes;
  - no `Access-Control-*` header; the three owner headers are present.
- [ ] **Step 2:** Run `bun test packages/engine/test/action-token.test.ts`; expect it to fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `bun test packages`; expect it to pass. Run `bun run check`.
- [ ] **Step 5:** Commit `feat(engine): account kinds and the single-purpose action token`.

### Task 4: Toewijzing slot-first, and `expect` in the grid

**Files:** Modify `packages/theatre/src/datasets.ts` (toewijzing `:153-193`: `rol_id` nullable relation to `rol`, `aantal` integer default 1, `voorlopig` option with a tone, `lifecycle` with the brief's transitions and `token_projection`), `writers.ts` (`checkAssignee` `:130-139`: an open row with a role and neither person nor name; the duplicate rule for filled rows only; `forPlanners` `:62-80`: admit an owner's transition on its own row), `apps/grid` (a lifecycle cell edit sends `expect`; `i18n.ts` gets the Dutch for `transition_not_allowed` and `transition_lost`). Test `packages/theatre/test/toewijzing.test.ts`, `access.test.ts:91` rewritten, `parity.test.ts:61-77`, `apps/grid/src/grid/Grid.test.tsx`.

- [ ] **Step 1: Tests:**
  - the open row: neither person nor name with a role is accepted only as `open`; without a role it is refused, in Dutch;
  - duplicate person refused only when filled;
  - each declared transition passes for an editor;
  - geweigerd → bevestigd is 422 in Dutch;
  - an owner may confirm or decline its own uitgenodigd row and nothing else;
  - the import of `invented-export.json` is unchanged: `rol_id` null, `aantal` 1;
  - in the grid, a state edit sends `expect` with the shown value, and a 409 refreshes the row and shows the Dutch message.
- [ ] **Step 2:** Run `bun test packages/theatre && bun run --filter @worktable/grid test`; expect it to fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same commands; expect them to pass. Run `bun run check`.
- [ ] **Step 5: Look at it:** in the grid, open slots with a role, the new states, and a refused transition in Dutch.
- [ ] **Step 6:** Commit `feat(theatre): Toewijzing slot-first on the lifecycle`.

### Task 5: Actions update and nest

**Files:** Modify `declare.ts` (`ActionDecl.run` `:160-165`), `actions.ts` (`:56-96`). Test `packages/engine/test/actions.test.ts`.

**Interfaces:**
- Produces `type ActionCreate = { dataset: string; values: Values; then?: (id: number) => ActionCreate[] }`.
- Produces `type ActionResult = ActionCreate[] | { creates?: ActionCreate[]; updates?: { dataset: string; id: number; values: Values }[] }`.
- An update's row is read in the caller's scope (404 outside it) with `ctx.current` the live row, and goes through `writableOf('update')`, `valuesOf` and the transition check.
- `then` runs after its parent is created, with its id. Everything stays in one `action` batch, and one undo reverses all of it.

- [ ] **Step 1: Tests:**
  - an update through the writer, where a refusing writer rolls everything back;
  - an update outside an owner's scope is 404;
  - a nested create gets its parent's id;
  - one undo reverses one update, one create and one nested create;
  - an existing array-returning action is unchanged (`copy_notes`).
- [ ] **Step 2:** Run `bun test packages/engine/test/actions.test.ts`; expect it to fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `bun test packages`; expect it to pass.
- [ ] **Step 5:** Commit `feat(engine): actions update and nest creates under one batch`.

### Task 6: Templates with slots, `--seed-missing` by natural key

**Files:** Modify `packages/theatre/src/writers.ts` (`checkItem` `:250-263`: `slots: [{ rol, aantal }]` with `rol` a live Rol title, `aantal` a positive integer), `actions.ts` (`sjabloon_toepassen` `:323-339`: `then` creates one open Toewijzing per slot with `rol_id` resolved by title), `seed.ts` (the "speeldag op locatie" sjabloon gets slots), `packages/engine/src/seed-missing.ts` (`seedDataset` `:48-79`: per seed row, insert when no row, live or deleted, carries its title, never update; count inserted). Test `packages/theatre/test/apply.test.ts`, `seed-missing.test.ts` (engine and theatre, rewritten from today's "has rows" tests).

**Interfaces:** `DatasetOutcome` becomes `{ inserted: number; present: number } | 'not config'`; the log reads `seed-missing: sjabloon 1 inserted, 0 present`.

- [ ] **Step 1: Tests:**
  - a slot naming an unknown role, or with `aantal` 0, is refused in Dutch;
  - applying a four-day template with two slots per day creates the activities and the open Toewijzingen in one batch, and one undo removes all of them;
  - on an existing db with Rol and an older Sjabloon, `--seed-missing` inserts the missing slotted "speeldag" and touches nothing else; a second run inserts nothing;
  - a row deleted by a planner counts as present and is not re-added;
  - a role renamed on the db makes the slot's title unknown, so the apply refuses, naming the role.
- [ ] **Step 2:** Run `bun test packages`; expect it to fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `bun test packages`; expect it to pass. Run `bun run check`.
- [ ] **Step 5:** Commit `feat(theatre): templates with slots; seed-missing adds by natural key`.

### Task 7: The matrix open column and `vul_slot`

**Files:** Modify `declare.ts` (`MatrixDecl.open?: { match: string; count: string; fill: string }`), `validate.ts` (`:160-190`), `packages/theatre/src/datasets.ts` (`open: { match: 'rol_id', count: 'aantal', fill: 'vul_slot' }`), `packages/theatre/src/actions.ts` (`vul_slot`), `apps/grid/src/engine.ts` (`EngineMatrix`, `joinOf`), `types.ts` (`MatrixJoin.open`), `matrix/columns.ts` (open rows kept), `matrix/Matrix.tsx` (a fixed leading open column in header, body and footer), `matrix/store.ts` (a fourth `MatrixApi` call, `runAction`, whose batch goes onto the tab history, `App.tsx:176`, not the op stack). Test `packages/engine/test/matrix.test.ts`, `packages/theatre/test/matrix.test.ts`, `apps/grid/src/matrix/Matrix.test.tsx`, `store.test.ts`.

**Interfaces:** `vul_slot`:
- `on: 'toewijzing'`, input `{ persoon_id: { relation: 'persoon' } }`;
- aantal 1: an update that sets `persoon_id` and state `voorlopig`;
- aantal > 1: an update to `aantal − 1` plus a create with aantal 1, the same `rol_id` and `activiteit_id`, the person, `voorlopig`.

- [ ] **Step 1: Tests:**
  - validation refuses a non-relation `match`, a non-integer `count`, and a `fill` naming no action, an action on another dataset, or a wrong input;
  - `vul_slot` on aantal 3 leaves 2 plus one filled row, and one undo restores it;
  - on aantal 1 the row is filled in place, and undo empties it;
  - in the grid: the open column shows the summed `aantal` and the role labels; free-text names stay last;
  - two open roles: picking a person asks the role first, in Dutch;
  - the fill's undo is a batch undo; the matrix's Ctrl+Z does not re-send a write.
- [ ] **Step 2:** Run `bun test packages && bun run --filter @worktable/grid test`; expect it to fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same commands; expect them to pass. Run `bun run check`.
- [ ] **Step 5: Look at it:** the matrix with open counts; fill one of three; undo.
- [ ] **Step 6:** Commit `feat: the matrix open column and the fill action`.

### Task 8: Invites and the `#/act` page

**Files:** Modify `packages/theatre/src/datasets.ts` (the Toewijzing lifecycle hook on `uitgenodigd`: `token: { to: ['bevestigd', 'geweigerd'], days: 14 }`; `mail` to the person's email with the `#/act/` link; `notice` "Geen uitnodiging: <naam> heeft geen e-mailadres." when there is none), `apps/grid/src/ui/App.tsx` (`landing()`: `#/act/<token>`), create `apps/grid/src/ui/Act.tsx` (POST `/act/view`, show the projection, Bevestigen and Weigeren buttons that POST `/act`, strip the hash first), `api.ts`, `i18n.ts`. Test `packages/theatre/test/invite.test.ts`, `apps/grid/src/ui/Act.test.tsx`.

- [ ] **Step 1: Tests:**
  - voorlopig → uitgenodigd for a person with an email puts one mail in the outbox with a `#/act/` link;
  - without an email: no mail, the Dutch notice in the reply, and the grid shows it;
  - the token's `/act/view` carries only the projection;
  - confirm and decline move the row;
  - in the page: the hash is gone before any request, a refusal reads in Dutch, and the buttons never send a GET.
- [ ] **Step 2:** Run the tests; expect them to fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `bun test packages && bun run --filter @worktable/grid test`; expect them to pass. Run `bun run check`.
- [ ] **Step 5: Look at it:** invite, open the mailed link in a fresh browser, confirm.
- [ ] **Step 6:** Commit `feat: invites through the lifecycle hook, and the confirm page`.

### Task 9: The record link and views for owners

**Files:** Create `packages/engine/src/record-link.ts`, `owner-views.ts`. Modify `declare.ts` (`DatasetDecl.record_link?: { email?: string }`, `ColumnDecl.owner_visible?: boolean`), `validate.ts`, `engine-tables.ts` (`record_link (dataset, record_id, version, rotated_at, rotated_by)`), `saved-view.ts` (`for_owners`), `views.ts` (`setForOwners`; the `public_view` guard `:174-176` extended), `access.ts` (kind rules), `auth.ts` (`RecordLink` header before the cookie), `app.ts` (routes; `recordLinkRequest` before `authRoutes`), `serve.ts` (`--link-secret-file`, refused when missing, short or group/world-readable). Test `packages/engine/test/record-link.test.ts`, `owner-views.test.ts`, `route-matrix.test.ts`.

**Interfaces:**
- Produces `recordLinkFor(sqlite, secret, dataset, id): string`.
- Produces `verifyRecordLink(sqlite, secret, token): Actor` (via `linkAccount`, Task 3), or `401 bad_link`.
- Produces `ownerRows(db, domain, view, actor, params)`.
- Routes, per findings F1 items 7-8:
  - `GET /owner/views`, `GET /owner/views/:id/rows`;
  - `PUT` and `DELETE /views/:id/for-owners`;
  - `GET /record-links/:dataset/:id`, `POST /record-links/:dataset/:id/rotate`;
  - `POST /record-links/request`.

- [ ] **Step 1: Tests** (the findings' F1 test list):
  - the link is stable; rotate kills the old one; a rotation is never undone;
  - malformed, wrong MAC, wrong dataset, bumped version, overlong and deleted-record tokens all get one identical 401; 429 after the limit;
  - startup refuses a missing, short or readable secret;
  - a link actor is 403 on `/schema`, `/rows`, `/views`, `/history`, writes and undo;
  - `setForOwners` refusals each name the key (dataset view, no owner column, public view, a non-owner-visible visible field, filter, sort or group key, a link key), and an editor or a service account gets 403;
  - the leak script as a test: every key of every row of every view for owners is owner-visible, with no `id`, `title`, `lookups`, `custom` or `links`; filter, sort and group on anything else, inside `$or` too, are 400 naming it;
  - the headers are on every owner and record-link response, including the 401;
  - the request route answers byte-identically for known, unknown and deleted addresses, with nothing written before the response and one outbox mail per live match;
  - validation refuses `owner_visible` on json or on the owner column, and `record_link` without `owners`;
  - `route-matrix` rows.
- [ ] **Step 2:** Run `bun test packages/engine`; expect it to fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `bun test packages`; expect it to pass. Run `bun run check`.
- [ ] **Step 5:** Commit `feat(engine): record links and views for owners`.

### Task 10: Person pages: theatre and the `#/link` page

**Files:** Modify `packages/theatre/src/datasets.ts` (`persoon.record_link = { email: 'email' }`; `owner_visible` on the member-facing columns), `queries.ts` (`mijn_producties`, `owners: { owner: 'persoon_id' }`, `toegang_dagen` read as `COALESCE(json_extract(o.parameters, '$.toegang_dagen'), 30)` from the own organisation, `soort = 'eigen'`), `apps/grid/src/ui/App.tsx` (`#/link/<token>`), create `apps/grid/src/ui/LinkPage.tsx` (token kept in memory, sent as `Authorization: RecordLink`, hash stripped; lists the views for owners and renders their rows read-only), `api.ts` (an injectable header), `apps/grid/index.html` (referrer and robots meta), `playwright.config.ts` (`--link-secret-file e2e/.tmp/link-secret`, written by global setup). Test `packages/theatre/test/person-pages.test.ts`, `apps/grid/src/ui/LinkPage.test.tsx`.

- [ ] **Step 1: Tests:**
  - `mijn_producties`:
    - a bevestigd row opens the production until `toegang_dagen` after its last activity;
    - geweigerd, geannuleerd, uitgenodigd and open do not;
    - the parameter is read and defaults to 30;
  - a view for owners on it publishes;
  - a view listing `notitie`, `dietary` or a rate is refused, naming it;
  - in the page: the header is sent, the hash is stripped, only the person's productions show, and a 401 shows "Deze link werkt niet meer".
- [ ] **Step 2:** Run the tests; expect them to fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `bun test packages && bun run --filter @worktable/grid test`; expect them to pass. Run `bun run check`.
- [ ] **Step 5: Look at it:** copy a person's link as an admin, open it in a fresh browser, rotate it, reload.
- [ ] **Step 6:** Commit `feat: person pages through the record link`.

### Task 11: Service accounts, Bearer, OpenAPI

**Files:** Modify `serve.ts` (`--create-service <name> [--role editor|administrator]`, `--disable-service`, `--rotate-service`), `auth.ts` (`bearerActor`), `access.ts` (a service account may not reach record links, share-token or for-owners), `rate-limit.ts` (600/min per account), `app.ts` (`/schema?format=openapi`). Create `packages/engine/src/openapi.ts`. Test `packages/engine/test/service.test.ts`, `openapi.test.ts`, `route-matrix.test.ts`.

- [ ] **Step 1: Tests** (the findings' F2 test list):
  - the CLI prints the token once and refuses a duplicate name or `--role owner`;
  - a valid Bearer authenticates; wrong, overlong, disabled and session-id tokens get one 401 body; a valid cookie with a bad Bearer is 401; 429 after the limit;
  - a write is logged as the service and shows its name in history; it undoes its own batch, and a human's undo of it is 403; after disable its next write is 401;
  - an administrator service gets 403 on links, share-token and for-owners, with tables unchanged;
  - write guard: 415 without JSON, 403 cross-site;
  - OpenAPI: writable paths and enums match the declaration; an owner's document lists only its sources; a link actor gets 403; plain `/schema` is unchanged (snapshot).
- [ ] **Step 2:** Run `bun test packages/engine`; expect it to fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `bun test packages`; expect it to pass. Run `bun run check`.
- [ ] **Step 5:** Commit `feat(engine): service accounts by Bearer token, and OpenAPI from /schema`.

### Task 12: Migration on a copy

**Files:** Test `packages/theatre/test/migrate.test.ts`, `packages/engine/test/auth.test.ts`; `specs/step-2/real-data.md` (new).

- [ ] **Step 1: Tests:**
  - a seeded step-1 theatre file migrates: `rol_id` and `aantal` by ALTER, `account` by rebuild with `.pre-migrate` written first, `record_link` and `action_token` created;
  - every row, revision and id survives;
  - imported Toewijzingen keep a null role;
  - `bun run parity test/fixtures/invented-export.json` reports 0 mismatches.
- [ ] **Step 2:** Run `bun test packages`; expect it to pass.
- [ ] **Step 3:** Write `specs/step-2/real-data.md`: the commands Stefan runs on the real copy, none run here. Copy the database, `serve.ts --db <copy> --link-secret-file <file>` (migrate), `--seed-missing`, `bun run parity <export>`, and the value-parity script, with what each output must show. Note there that Laika's `maybe` stays mapped to `uitgenodigd`: remapping it to `voorlopig` is a change to the exporter and the parity rules, and needs Stefan's ruling.
- [ ] **Step 4:** Run `bun run gate`; expect it to pass.
- [ ] **Step 5:** Commit `test(step-2): migration on a copy; the real-data commands for Stefan`.

## Close

Per `netdust-gates:policy`:
1. `bun run gate`.
2. `/feature-review step-2`, with `security-sentinel`, since the plan carries a threat model.
3. One fix pass.
4. `/shakeout`: it drives the E2E flows of the Test map (the brief's gate) in a real browser and takes one screenshot per surface.
5. Then the after-gate report: a read-only paper declaration of cargovelo-core and of the studio draft against the built engine, naming every engine change either would need, plus the four-item report and the matrix findings. Their sources are asked of Stefan if they are not in the repo.
