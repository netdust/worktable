# Step 0e U2: accounts, roles, scoping and the public route, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Engine accounts replace the dev actor:
- sign-in by magic link, with roles administrator, editor and owner;
- owner columns that scope every read and write;
- seeded views owned by a system owner and read-only until copied;
- the permission check before the in-use check;
- a read-only public route by share token;
- a generated route × role test matrix.

**Architecture:**
- **Engine modules.** Four engine tables (`account`, `magic_link`, `auth_session`, `rate_limit`) are declared like `saved_view` and migrated by U1's migrator. `auth.ts` holds the link and session routes, and a session middleware sets `c.var.actor`. `access.ts` is the one place a role is turned into an answer: what it may reach, and the scope of an owner. Routes, writers and views take the actor from the context instead of `DEV_ACTOR`.
- **The grid** gains a sign-in screen, a confirm screen that POSTs the token, and a 401 handler.
- **First working version:** Task 1. `serve.ts --create-admin you@example.test`, then `curl -X POST /api/auth/request`. The link appears in the outbox file; POSTing its token returns a cookie, and `GET /api/auth/me` answers with the account.

**Tech Stack:** Bun 1.3, Hono 4 (`hono/cookie`, `getConnInfo` from `hono/bun`), bun:sqlite, React 19, Vite, Vitest, Playwright.

**Spec:** `specs/step-0e/spec.md`, U2 (parent: `docs/SPEC.md`, Access).

**Branch:** `feature/step-0e-auth`, from `main` after the migrator and vocabulary plans merge.

**Simplest design:** A shared password per role in an environment variable is simplest. It is rejected by the spec (magic links, generic accounts) and by audit: Revision needs a person, not a role. Within magic links, Folio's shape is the simplest that works, and the departures are each one small function:
- POST-to-consume instead of a GET with a side effect;
- hashed session ids;
- the sweep.

For scoping, a domain-coded `WHERE` per dataset is simplest. It is rejected by the spec ("Scoping is declared, not coded"), and one declared column per role costs the same `and()` term in `whereOf`.

## Decisions
- **Roles.** The roles are `administrator`, `editor` and `owner`, and `admin` becomes `administrator`. An owner account carries `(subject_dataset, subject_id)`. Laika's core team become editors. — Stefan, 2026-10-06.
- **Permissions** (engine, generic). The test matrix is generated from this table.

  | Surface | none | owner | editor | administrator |
  |---|---|---|---|---|
  | `POST /auth/request`, `/auth/consume` | ✓ | ✓ | ✓ | ✓ |
  | `GET /auth/me`, `POST /auth/signout` | 401 | ✓ | ✓ | ✓ |
  | `GET /schema` | 401 | its readable sources only | ✓ | ✓ |
  | `GET /rows/:s`, `GET /revisions/:d/:id` | 401 | scoped; unscoped source 404 | ✓ | ✓ |
  | `POST/PATCH/DELETE /rows/…` | 401 | scoped, then the writer decides | writer decides | writer decides |
  | `GET /views` | 401 | shared views on readable sources | own + shared | own + shared |
  | `POST/PATCH/DELETE /views…`, restore | 401 | 403 `forbidden` | own only | own only |
  | `PUT/DELETE /views/:id/share-token` | 401 | 403 | 403 | ✓ (query views only) |
  | `GET /public/views/:token` | ✓ | ✓ | ✓ | ✓ |
- **Owner scope.** An owner whose account has no subject sees nothing: every scoped read is empty and every scoped write is a 404. On create and on update, an owner column given any value other than the subject is 403 `forbidden`, so a row cannot be moved out of scope by PATCH (plan review S8).
- **Every request re-reads the account.** The session middleware joins `account` on every request, so a changed role or a disabled account takes effect at once. Consume refuses an account disabled after its link was sent.
- **System owner** `-1`. No account id is ever ≤ 0 (AUTOINCREMENT from 1). On a view owned by `-1`, PATCH, DELETE and restore answer 403 `read_only_view`. "Save as new" is a plain `POST /views`.
- **Migration of old views.** A view owned by `0` whose `(name, source)` matches a domain seed moves to `-1`. Any other view owned by `0` moves to the lowest administrator id at startup if one exists; if none does, it stays and startup logs the count. Each move is revised with actor `-1`.
- **The order on delete** (the 0e requirement). The engine's scope check runs first, then `writer.delete(ctx)`, which may refuse by role, then the in-use check. `storedOf()` today runs `inUse` before `writer.delete`, and that order is swapped. The swap inverts `packages/engine/test/writes.test.ts:169` ("on a 409 the referenced dataset's writer delete did not run"): that test is rewritten to assert the new order, which is safe because the writer's delete runs inside the same transaction and a 409 rolls it back. It also changes the `docs/SPEC.md` Writer row ("checked before the writer's own delete"), which goes into the spec diff (plan review S13).
- **Refusing by role.** A new engine helper `forbid(message)` throws 403 `forbidden`. `refuse()` stays 422 for domain rules.
- **The link.** It is `<app-url>/#/auth/<token>`, with the token in the fragment so it never reaches a server log or a scanner's GET. The grid's confirm screen shows one button, which POSTs `{ token }`.
- **The engine's new flags:** `--app-url` (default `http://127.0.0.1:5173`) and `--outbox <dir>`. In development the link is written to the outbox as one file per message and printed to the console; there is no mail provider in 0e.
- **Lifetimes:**
  - a token is 32 random bytes (base64url), lives 15 minutes and is single-use, claimed by `UPDATE … SET used_at … WHERE used_at IS NULL AND expires_at > now RETURNING`;
  - a session is a new 32-byte id on every sign-in, stored as sha256 and valid for 30 days;
  - the sweep deletes expired links and sessions on every consume.
- **The cookie** is `wt_session`, `HttpOnly; SameSite=Lax; Path=/`, with no `Secure` on loopback (the cutover's job).
- **Rate limits** use a fixed window in the `rate_limit` table:
  - a link request: 5 per email and 20 per client address per 15 minutes;
  - a consume: 20 per client address per 15 minutes;
  - the public route: 60 per client address per minute;
  - over the limit is 429 `rate_limited` whatever the email.

  The client address is Bun's `requestIP` (`getConnInfo`). Proxy headers are never trusted; a proxy is the cutover's question.
- **Identical answers.** `POST /auth/request` answers `200 { ok: true }` for a known, unknown or disabled email. The request path does no database write and no file write for any email beyond the rate-limit counter: the token insert and the outbox write run in `setTimeout(…, 0)`, after the response is returned (a microtask would still run before Hono writes the response, plan review S10). An email that is not shaped like one (over 254 characters or no `@`) is 400 `bad_email`, which reveals nothing about accounts.
- **The public route** (Stefan, 2026-10-06):
  - `PUT /views/:id/share-token` (administrator only, query-sourced views only, else 400 `not_query`) sets `public = 1`, stores sha256 of a new 32-byte token in `share_token`, and returns `{ token }` once. A second PUT rotates it.
  - `DELETE` clears both.
  - `GET /public/views/:token` takes only `from` and `to` (any other parameter is 400). It applies the stored filters and sort, and projects each row to `visible_fields` (no `id` unless listed, no `lookups`, `custom` or `title`). It compares with `timingSafeEqual`, rate-limits, and sets no `Access-Control-*` header. A deleted view's token answers 404.
  - **No owner id, in either sense** (spec constraint 4, plan review S16): `PUT share-token` is refused with 400 `owner_column_visible` when `visible_fields` holds a column the source declares as an owner column, and the projection never serves `owner_id`.
  - **A public view is administrator-only to change** (plan review S9): while `public = 1`, PATCH, DELETE and restore by anyone but an administrator answer 403 `public_view`, so an editor cannot widen what a token serves.
- **Accounts are managed by the CLI only in 0e:** `--create-admin`, `--create-account <email> --role <r> [--subject <dataset>:<id>]`, and `--disable-account <email>`. There are no `/accounts` routes and no grid screen. Ruling (plan review round 2 SF1): the shell is the administrator's door until a later step needs a screen. The cost if wrong is a small routes-and-UI task.

## Global Constraints
- `packages/engine` holds no domain word and imports no domain package (`bun run check`, plus U3's vocabulary check once merged).
- Every write route keeps the 0b guard (JSON content type, `Sec-Fetch-Site`, Host), and that includes `/auth/*`.
- Domain rules, including who may write which theatre dataset, live in theatre writers. The engine knows roles only as the table above.
- The fiche package keeps running, with its tests signed in as an editor.
- No commit leaves the grid unable to boot or an earlier e2e flow red: each grid or engine task ends with `rm -rf e2e/.tmp && bun run e2e`.
- Out: signed person links, record tokens, lifecycle, mail delivery, `Secure` cookies, HTTPS, proxy trust, and account routes or UI.
- `docs/SPEC.md` is never committed by this plan; its lines go into `specs/step-0e/spec-diff.md`.
- Each task logs its start and end time in the Time log.

## Threat model

**Assets:**
- sessions and sign-in tokens;
- planning rows (personal data: names, absences, dietary notes once imported);
- saved views and the right to publish one;
- the account list and roles.

**Attacks:**
1. **Account enumeration through the link request.** An attacker posts emails and watches the status, body or time. → **`requestLink()` answers the same 200 body for every shaped email, with delivery after the response. Rate limits per email and per address. Test: the known, unknown and disabled cases return byte-identical bodies and the same status.**
2. **A mail scanner burns the link,** or a link is replayed. → **The token travels in the URL fragment, so a GET to the app burns nothing. Consume is a POST behind the write guard, claimed atomically and single-use, and expires in 15 minutes. Tests: a second consume is 400 `bad_token`; an expired one is 400; two concurrent consumes give one session.**
3. **A stolen database yields live sessions or links.** → **Only sha256 of session ids and tokens is stored (`auth.ts`). Test: no raw cookie value appears in `auth_session`.**
4. **Session fixation.** → **Consume always mints a new id, and no route accepts a session id from a parameter.**
5. **Login CSRF.** A cross-site page POSTs the attacker's token to consume. → **The write guard refuses `Sec-Fetch-Site: cross-site/same-site` and an `Origin` without fetch metadata, and the cookie is SameSite=Lax. Test: a cross-site consume is 403.**
6. **An owner reads or writes another person's rows** through `/rows`, `/revisions`, `?cells=1`, lookups or a query. → **`scopeOf(actor, source)` in `access.ts` is applied in `whereOf` (reads), in `runWrite` (the current row must be in scope, else 404), on create (the owner column is forced to the subject; any other value is 403), in `readRevisions` (the row must be in scope), and in `cellsOf` (the join is filtered too). Tests per path, the denial asserted with tables unchanged.**
7. **An owner learns what exists through `/schema`** or through status codes. → **`/schema` lists only readable sources. An unscoped source and an out-of-scope id both answer 404 `unknown_source`/`unknown_record`, never 403.**
8. **Privilege escalation:** an editor creates or promotes an account, makes a view public, or edits a system view. → **There is no account route (CLI only). Share-token routes are administrator-only (`may()`). System views answer 403 `read_only_view`. No route takes a role or subject from a body.**
9. **The in-use check leaking counts to an actor who may not delete.** → **The order is scope, then writer, then in-use, in `storedOf()`. Test: an owner deleting a referenced Persoon gets 403 with no `by`.**
10. **Public token guessing or misuse.** → **A 256-bit token stored hashed and compared in constant time, 60/min per address, served only for `public = 1` query views, with only `from`/`to` accepted and rows projected to `visible_fields`. Test: the response holds no `owner_id`, no `id` unless listed, and no column outside `visible_fields`; a dataset view cannot be made public; a rotated token is 404.**
11. **The rate-limit table as a lever.** Many addresses or emails fill it. → **The sweep deletes expired windows on every write to it. An error in the limiter fails closed for consume and the public route, and open for link requests (Folio's behaviour, kept so a broken limiter never blocks sign-in). A test asserts each.**
12. **DNS rebinding and a foreign Host.** → **The 0a Host allowlist stays in front of every route, including `/public`.**

**Mitigations — where they live:**
- `auth.ts`: `requestLink`, `consumeLink`, `sessionMiddleware`, `sweep` (1–5, 11);
- `access.ts`: `may`, `scopeOf` (6–8);
- `writes.ts`: `storedOf` order and the scope checks in `runWrite` and `readRevisions` (6, 9);
- `rows.ts`: `whereOf`, `cellsOf` (6);
- `views.ts`: the system owner, share-token routes and `publicRows` (8, 10);
- `rate-limit.ts` (1, 10, 11);
- `app.ts`: the Host check (12).

**Deferrals:**
- No `Secure` flag, no HTTPS and no proxy trust until the cutover.
- No mail provider.
- No per-account session list or "sign out everywhere"; disabling an account kills its sessions on their next request.
- No audit of sign-ins beyond `auth_session.created_at`.

## Test map

| Unit | Seam | Tests: tier · file · command | E2E flows |
|---|---|---|---|
| Sign-in and sessions | `/api/auth/*`, the session middleware, CLI flags | integration · `packages/engine/test/auth.test.ts` (denials first: attacks 1–5, 11) · `bun test packages/engine` | sign-in-by-link |
| Access and owner scope | `/rows`, `/revisions`, `?cells=1`, `/schema`, writes | integration · `packages/engine/test/access.test.ts` (attacks 6, 7, 9) | owner-sees-own |
| Route × role matrix | every registered route | integration · `packages/engine/test/route-matrix.test.ts`, from `EXPECTED` in the test file plus `app.routes` | none |
| Views: system owner, public route | `/api/views*`, `/api/public/views/:token` | integration · `packages/engine/test/views.test.ts`, `public.test.ts` (attacks 8, 10) | seeded-view-read-only, public-view-by-token |
| Theatre owners and writers | theatre through the routes | integration · `packages/theatre/test/access.test.ts` | owner-sees-own |
| Grid sign-in, 401, read-only views | `App`, `SignIn`, `Confirm`, `api.ts` | unit · `apps/grid/src/ui/SignIn.test.tsx`, `api.test.ts` · `bun run --filter @worktable/grid test` | sign-in-by-link, seeded-view-read-only |
| Browser gate | Playwright | e2e · `e2e/step-0e.spec.ts` · `bun run e2e` | all five above, plus session-less-401 |

## Review Focus
1. The denied actor through the whole chain, not the route function (edge 2): an owner reaching another person's row through lookups, `?cells=1`, `/revisions` or a query → `access.test.ts`.
2. Byte-identical link-request answers for a known, unknown and disabled account (attack 1) → `auth.test.ts`.
3. Double consume, or two tabs (edge 4) → `auth.test.ts`: concurrent consumes give one session.
4. A 401 mid-flow, when the session expires while editing → the grid test: an unsaved new row is kept as a draft (the grid's only draft mechanism) and the sign-in screen shows; the e2e flow session-less-401.
5. The public route never widens (attack 10) → `public.test.ts`: the projection and parameter refusals.
6. An empty subject (edge 1) → `access.test.ts`: an owner without a subject sees zero rows and writes nothing.

## Time log

| Task | Start | End |
|---|---|---|

---

### Task 1: Accounts, links and sessions in the engine

**Files:**
- Create:
  - `packages/engine/src/auth-tables.ts` (`account`, `magic_link`, `auth_session`, `rate_limit` declared with `defineDataset`; `migrate()` includes them beside `savedView` and `revision`);
  - `packages/engine/src/auth.ts`, `packages/engine/src/rate-limit.ts`, `packages/engine/test/auth.test.ts`.
- Modify: `migrate.ts`, `app.ts` (mount `/auth/*`; session middleware on `/api/*` except the open routes; options `appUrl`, `outbox`, `cookieName`, `clientIp`), `serve.ts` (`--create-admin`, `--create-account`, `--disable-account`, `--role`, `--subject`, `--app-url`, `--outbox`, `--cookie-name`; `getConnInfo` passed in), `declare.ts` (`Actor`), `packages/engine/test/fixture.ts` (`signIn(app, role, subject?)` returns a cookie; `send()` takes `cookie`).
- Delete: `packages/engine/src/dev-actor.ts`.

**Notes from the plan review (N7):** `ApiError`'s status union in `params.ts` gains 401 and 429. "Concurrent consumes" are tested on two `Database` connections to one file, because a single bun:sqlite connection serialises them. `email` joins `scripts/vocabulary-allow.txt` with its reason (plan review S5).

**Interfaces:**
- Produces:
  ```ts
  interface Actor { id: number; role: 'administrator' | 'editor' | 'owner'; subject: { dataset: string; id: number } | null }
  interface EngineOptions { port: number; appUrl?: string; outbox?: string; cookieName?: string; clientIp?: (req: Request) => string }  // cookieName defaults to 'wt_session'
  function createAccount(sqlite: Database, domain: Domain, email: string, role: Actor['role'], subject?: Actor['subject']): number
  ```
  Table columns:
  - `account`: `email` (unique `COLLATE NOCASE`), `role` (options), `subject_dataset`, `subject_id`, `disabled_at`;
  - `magic_link`: `account_id`, `token_hash`, `expires_at`, `used_at`;
  - `auth_session`: `account_id`, `id_hash`, `expires_at`;
  - `rate_limit`: `key`, `window_start`, `count`.

  Routes:
  - `POST /api/auth/request {email}` → 200 `{ok:true}` | 400 `bad_email` | 429;
  - `POST /api/auth/consume {token}` → 200 `{account}` plus `Set-Cookie` | 400 `bad_token`;
  - `GET /api/auth/me` → `{ id, email, role, subject }`;
  - `POST /api/auth/signout` → 200, deletes the session row.

  Everything else under `/api` without a valid session is 401 `unauthenticated`.
- **Engine fixtures:** every existing engine test signs in as an editor through `signIn()` (fixture accounts are created with `createAccount`). Revisions written in tests carry that account's id. The last `planner` in code (`packages/engine/test/views.test.ts:378`, `role: 'planner'`) becomes `editor`; the `Actor['role']` union forces it (plan review round 2 N-g).

- [ ] **Step 1: Denial tests first**:
  - attacks 1–5 and 11;
  - a request without a cookie, with a garbage cookie, with an expired session, or with a disabled account → 401;
  - `--subject` naming an undeclared dataset is refused;
  - the cookie is named `wt_session` by default and `--cookie-name` changes it.

  Run → FAIL.
- [ ] **Step 2: Behaviour tests.**
  - The link is written to the outbox, and consume sets the cookie.
  - `me` answers with the account; signout ends it.
  - The sweep removes expired rows.
  - `--create-admin` is idempotent on the same email.
- [ ] **Step 3: Implement.** Move every existing test to `signIn()`.
- [ ] **Step 4: Run** `bun test packages`, `bun run check` → PASS. The grid is not yet signed in, so `bun run e2e` is expected red from here until Task 5. Tasks 1–4 are the exception to the e2e rule, and Task 5 closes it (plan review round 2 SF2).
- [ ] **Step 5: Commit.** `feat(engine): accounts, magic links and sessions replace the dev actor`.

### Task 2: Access, owner scope, and the delete order

**Files:**
- Create: `packages/engine/src/access.ts`, `packages/engine/test/access.test.ts`.
- Modify:
  - `declare.ts`: `DatasetDecl.owners?` and `QueryDecl.owners?` as `Partial<Record<'owner', string>>`;
  - `validate.ts`: an owner column is `id` or a relation column;
  - `rows.ts`: `whereOf` and `cellsOf` take the scope;
  - `writes.ts`: `runWrite` scope checks; create forces the owner column; `storedOf` order; `readRevisions` scope; `forbid()`;
  - `app.ts`: `/schema` filtered; the actor from `c.var`;
  - `index.ts`: export `forbid`;
  - `fixture.ts`: a dataset with `owners: { owner: 'project_id' }` and one without.

**Interfaces:**
- Produces:
  ```ts
  function may(actor: Actor | null, surface: Surface): boolean        // the Decisions table, as data
  function scopeOf(actor: Actor, source: Source): { column: string; id: number } | 'all' | 'none'
  export function forbid(message: string): never                       // ApiError(403, 'forbidden')
  ```
  The expected statuses are not exported from `access.ts`: the matrix test holds its own table, `EXPECTED: { method, path, status: Record<'none'|'owner'|'editor'|'administrator', number> }[]`, written from the Decisions table by hand, so a wrong cell in `may()` cannot pass both sides (plan review S11).

- [ ] **Step 1: Denial tests first**:
  - attacks 6, 7 and 9 on the fixture domain: another subject's row by id, by filter, by `?cells=1`, by `/revisions`, and through a query with an owner column;
  - an unscoped source → 404;
  - a create with a foreign owner value → 403;
  - an owner without a subject;
  - a PATCH of an owner's own row that sets the owner column to another subject → 403, tables unchanged;
  - a delete of a referenced row by an actor whose writer forbids it → 403 with no `by`;
  - the rewritten `writes.test.ts:169` case: on a 409, the writer's delete ran but nothing it wrote survives the rollback.

  Each case asserts the tables are unchanged. Run → FAIL.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** `bun test packages`, `bun run check` → PASS.
- [ ] **Step 4: Commit.** `feat(engine): owner scope, roles, and the permission check before in-use`.

### Task 3: Views — the system owner, and the public route

**Files:**
- Modify: `views.ts` (actor from context; owner `-1` read-only; owner-role listing; share-token routes; `publicRows`), `migrate.ts` (`seedDomain` inserts owner `-1`; the owner-0 migration in Decisions), `saved-view.ts` (no column change: `share_token` now holds the hash).
- Create: `packages/engine/test/public.test.ts`. Extend `views.test.ts`.

**Interfaces:**
- Produces:
  - `PUT /api/views/:id/share-token` → `{ token }`;
  - `DELETE /api/views/:id/share-token` → `{ id }`;
  - `GET /api/public/views/:token?from&to` → `{ rows: Record<string, unknown>[], total }`;
  - `ViewOut.editable` is false for owner `-1`;
  - `ViewOut` gains `public: boolean` and never the token or its hash.

- [ ] **Step 1: Denial tests first**:
  - attacks 8 and 10;
  - PATCH, DELETE and restore on a system view → 403 `read_only_view`, unchanged;
  - an editor's PATCH, DELETE or restore of their own view while it is public → 403 `public_view`, unchanged;
  - a share token on a view whose `visible_fields` holds an owner column → 400 `owner_column_visible`;
  - a deleted public view's token → 404;
  - an editor's share-token → 403;
  - a dataset view → 400 `not_query`;
  - `?filter=` on the public route → 400;
  - a rotated token → 404;
  - the 61st call in a minute → 429.

  Run → FAIL.
- [ ] **Step 2: Behaviour tests.**
  - "Save as new" from a system view creates a view the caller owns.
  - The owner-0 migration moves seeded views to `-1` and others to the first administrator.
  - The public response equals the view's rows projected to `visible_fields` (assert exact keys).
- [ ] **Step 3: Implement, run, commit.** `feat(engine): seeded views read-only under a system owner; the public view route`.

### Task 4: The route × role matrix

**Files:**
- Create: `packages/engine/test/route-matrix.test.ts`.

- [ ] **Step 1: Write the test.**
  - For each entry of `EXPECTED` (in the test file) and each role, build the request: a fixture row id in the actor's scope, a valid JSON body for writes, and the required headers. Assert the status.
  - A second test lists every route Hono registered under `/api` (`app.routes`, method + path, with middleware entries such as `ALL /*` and the write guard filtered out) and fails, naming the route, if `EXPECTED` has no entry for it.
- [ ] **Step 2: Run.** A mismatch is a bug in `access.ts` or a wrong cell in `EXPECTED`: fix it where the Decisions table says the truth is, never by copying the observed status into the test.
- [ ] **Step 3: Commit.** `test(engine): every route against every role, generated`.

### Task 5: Theatre owners and writers; the grid signs in

**Files:**
- Modify:
  - `packages/theatre/src/datasets.ts`: `owners: { owner: 'persoon_id' }` on toewijzing and beschikbaarheid, `{ owner: 'id' }` on persoon;
  - `packages/theatre/src/writers.ts`: an owner may create, update and delete only Beschikbaarheid, and anything else uses `forbid` with a Dutch message; editors keep what they had;
  - `packages/fiche`: tests sign in.
- Grid:
  - Create: `apps/grid/src/ui/SignIn.tsx`, `apps/grid/src/ui/Confirm.tsx`.
  - Modify: `api.ts` (401 → `onUnauthenticated` callback), `ui/App.tsx` (routes `#/signin` and `#/auth/<token>`; the signed-in account in the rail foot, with sign out), `i18n.ts` (Dutch strings), the view menu (Save disabled on `editable: false`; "Opslaan als nieuw" stays).
- e2e: `playwright.config.ts`:
  - Both engines get `--outbox` (`e2e/.tmp/outbox`, `e2e/.tmp/outbox-fiche`) and `--app-url` (5174, 5175).
  - A global setup runs `--create-account` for a theatre administrator, a theatre editor, an owner linked to a seeded Persoon, and a fiche editor. It signs each in through the confirm screen and saves `storageState` per role.
  - Every earlier spec uses the editor state, and `step-0c.spec.ts` uses the fiche editor's.
  - Cookies ignore the port, so the cookie name is per instance: `--cookie-name` (default `wt_session`, fiche e2e `wt_session_fiche`). Ruling (plan review S12): a flag is cheaper than moving fiche to `localhost`, and the cost if wrong is one option.
  - No rate-limit flag. Every client address behind the Vite proxy is 127.0.0.1, but the e2e engines start `--fresh` and sign in about six times per run (four roles in setup plus the sign-in flow), under 20 per 15 minutes. The other specs reuse `storageState` (plan review round 2 N-a).
- Create: `packages/theatre/test/access.test.ts`, `apps/grid/src/ui/SignIn.test.tsx`, `e2e/step-0e.spec.ts`.

- [ ] **Step 1: Theatre denial tests first.**
  - An owner cannot read activiteit, productie or other people's Toewijzingen.
  - An owner cannot write a Toewijzing, nor a Beschikbaarheid for another persoon.
  - An editor's rights are unchanged.
- [ ] **Step 2: Grid unit tests.**
  - The sign-in form posts the email and shows the same "check your mail" text for any answer.
  - Confirm posts the token from the fragment only when the button is pressed.
  - A 401 on any request shows sign-in and keeps an unsaved new row's draft (the grid's only draft mechanism).
  - After consume, the token is removed from the location and from history (`history.replaceState`) before the grid's hash state is written, since `ui/hash.ts` rewrites the hash on mount.
  - A system view's Save is disabled.
- [ ] **Step 3: Write `e2e/step-0e.spec.ts`:**
  1. **sign-in-by-link:** request a link, read it from the outbox file, open it, press the button, and see the grid.
  2. **owner-sees-own:** as the owner, Toewijzingen shows only their rows and Afwezigheden only theirs; another person's row id typed into the URL hash shows nothing.
  3. **seeded-view-read-only:** Save is disabled; "Opslaan als nieuw" creates a copy, which saves after a change and survives a reload.
  4. **public-view-by-token:** create a token with the administrator API in setup; a cookie-less `request.get` returns the projected rows; a wrong token gives 404.
  5. **session-less-401:** clear cookies mid-session; the next action shows sign-in.
- [ ] **Step 4: Implement, then run** `rm -rf e2e/.tmp && bun run gate` → PASS. Quote the counts.
- [ ] **Step 5: Commit.** `feat: theatre owners, the grid signs in, and the 0e auth gate`.

### Task 6: The spec diff
- [ ] **Step 1:** Append the proposed `docs/SPEC.md` lines to `specs/step-0e/spec-diff.md`:
  - Access: Planner → Editor, `views_plan` dropped for the role table;
  - roles administrator, editor and owner;
  - `(subject_dataset, subject_id)`;
  - the system owner;
  - the public route's four constraints;
  - the link in the fragment with a POST consume;
  - the Writer row: the permission check, including the writer's own delete, runs before the in-use check.

  Commit `docs(step-0e): proposed spec lines for accounts and access`.
