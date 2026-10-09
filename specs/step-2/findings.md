# Step 2 findings: the engine changes, before any is built

Stefan, 2026-10-09: "Write the findings below first and stop for my approval before building any engine change." Branch `feature/step-2`, cut from main at e080e02. The brief is in Stefan's message of 2026-10-08/09; each finding quotes the line it answers.

## Scope against the spec of record

The brief changes `docs/SPEC.md`'s step 2. Per AGENTS.md, scope changes are an edit to the spec first. These are the differences, for Stefan to confirm before the spec is written:

| Spec today | Brief | Proposed |
|---|---|---|
| Step 2 is "Toewijzing slot-first + Beschikbaarheid + Persoon_rol": soort on availability, rates per role, plan-side cost (SPEC.md:262) | Names none of Beschikbaarheid.soort, Persoon_rol or plan-side cost | **Question 1** |
| Step 2's gate: "an open slot shows a kandidaten list" (SPEC.md:292) | "Out: candidates and conflicts (step 3)" | Kandidaten move to step 3; the gate line is replaced by the brief's gate |
| Toewijzing.state: open · uitgenodigd · bevestigd · geweigerd · geannuleerd; a person may only confirm or decline their own slot (SPEC.md:170) | Adds `voorlopig`; editor transitions open → voorlopig/uitgenodigd/bevestigd, voorlopig → uitgenodigd/bevestigd | The Toewijzing row takes the brief's states and transitions |
| A record token: a token column plus a public projection, with "Laika's signed person link" as an instance (SPEC.md:43, 66) | Two different tokens: the stable person link (F1) and single-purpose action tokens per Toewijzing, hashed, expiring, consumed on first use, POST only | The spec paragraph becomes two shapes: `record_link` (F1) and the action token (F3), which carries the minimal projection |
| Persoon has `token` and `user_id` (SPEC.md:160) | — | The code never had them and neither design needs them: drop both from the spec |
| Four actors (SPEC.md:70) | Person links and service accounts | Still four: a person link is an owner of kind `link`; a service account is an editor or administrator of kind `service` |
| The matrix fills an open row generically: "choosing an entity in an open cell fills one open row whose match column agrees before it creates a new one" (SPEC.md:60) | "Choosing a person in an open cell runs a theatre action that splits the slot" | F4 |
| Signed person links for owners stay step 2 (SPEC.md:70) | F1 | In scope, as F1 |
| Public views: an administrator publishes a query view behind a share token; its owner column must not be visible (SPEC.md:55) | "A view can be marked published. Only query views with an owner column qualify" | F1: two different things that must not share a name |

## F1. Person pages

Brief: "The stable person link and published views." Drafted by the advisor session (most capable model), checked against the code here.

### What exists today
- **Every actor is an integer account id.** Revision, batch, undo (writes.ts:458-467), history's `whose()` (history.ts:119-125) and view ownership all key on `account.id`. `account.email` is required and unique (auth-tables.ts:11, 22). So anything that writes, undoes or shows up in history needs an `account` row.
- **The only credential is the `wt_session` cookie** from a consumed magic link (auth.ts:140-144, 173-187). A token in a header is refused by design (test/auth.test.ts:187). The magic-link request answers `{ ok: true }` for every address and delivers on a timer (auth.ts:117-127), but **logs the link to stdout** (auth.ts:111). No mailer interface exists; `deliver()` writes the outbox itself.
- **An owner reads whole rows** of its scoped sources (rows.ts:24-41, 81, 88), and may filter, sort and group on any column (params.ts:114-156). No column is admin-only on read; theatre's admin-only rates are enforced on write only (packages/theatre/src/writers.ts:222-233). So an owner account today reads its own `notitie` and `dietary`.
- **The existing public view** (`PUT /views/:id/share-token`, `GET /public/views/:token`) reads with scope `'all'` (views.ts:355). That is why the owner column must be hidden (`owner_column_visible`, views.ts:298-304). No response anywhere sets `Cache-Control`, `Referrer-Policy` or `X-Robots-Tag`.
- **No HMAC or server secret exists** (serve.ts:211-232 lists every flag). Tokens are 32 random bytes, stored as sha256, compared with `timingSafeEqual` (auth.ts:39-40; views.ts:331-342).
- **Theatre:** `persoon` has `owners: { owner: 'id' }` and a nullable email, but neither the spec's `token` and `user_id` nor a link version (datasets.ts:126-151). No query has an owner column yet.

### Smallest design
1. **Two names, so the two kinds of view never collide.** The existing share-token view stays "public": unscoped, owner column hidden. The new kind is a view **for owners**: scoped by the owner column, which it must have, with only owner-visible columns. A view is one or the other, never both (400 `already_public` / `already_for_owners`). "Publish" keeps its spec meaning (share token, and step 4's Publication). The brief's `member_visible` becomes `owner_visible`, matching the engine's `owner` role and column. **Question 4.**
2. **`ColumnDecl.owner_visible?: boolean`**, marked by the domain. Validation refuses it on a `json` column (custom would expose every key, until Field in step 5) and on the source's owner column (the scope, never a value).
3. **The link version lives in an engine table, `record_link (dataset, record_id, version, rotated_at, rotated_by)`**, not in `link_versie` on Persoon, because:
   - undo restores domain columns, so an admin could undo a rotation and un-revoke a link; engine tables are never undone (writes.ts:475-476);
   - per-record engine state already lives in generic tables (SPEC.md:48);
   - it avoids an `ALTER` on persoon, and an allowlist line for `link` in the vocabulary check.

   A dataset opts in with `record_link: { email?: <text column> }`, valid only on a dataset with `owners`. **Question 5.**
4. **The token** is `<dataset>.<id>.<base64url HMAC-SHA256(secret, "record-link:" + dataset + ":" + id + ":" + version)>`, capped at 128 characters. Nothing is stored per link: it is stable, re-copyable, and dies when the version moves.
   - Verifying reads the live record and its version, recomputes and compares in constant time.
   - Every failure, including a missing record, answers one identical `401 bad_link`, with the MAC computed even for a missing record so the timing says nothing.
   - The secret is a file, `--link-secret-file <path>`: at least 32 bytes, refused when group- or world-readable, never in the database, never logged. Startup refuses a domain declaring `record_link` without it.
5. **Carrying the link.** The page is `<app-url>/#/link/<token>`; the fragment never reaches a log, proxy or Referer, as the magic link already does. The page keeps the token in memory and sends `Authorization: RecordLink <token>` on every call, so no engine URL holds it.
   - Every owner and record-link response sends `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex` and no CORS headers.
   - The Host check and the write guard stay.
   - The grid's `index.html` gets referrer and robots meta tags, since the engine does not serve the page.
6. **The link actor is an account row** of a new `kind`. `account` gains `kind` (`user · service · link`), `name` (unique among services, null otherwise), and a nullable `email`, with `CHECK ((kind = 'user') = (email IS NOT NULL))`; service and link rows get their own creation path, since `createAccount` requires an email (auth.ts:80). History shows a link account as `by: 'link'` with the subject's title as `actor`, so a planner reads "bevestigd door <naam>".
   - The first verified request inserts `{ kind: 'link', role: 'owner', subject }` once; later requests find it.
   - Revision, batch, undo and history then work unchanged when a writer later allows a write (notes).
   - It is also created on the first use of an action token (F3).
   - Only `kind = 'user'` gets session cookies or magic links. `disabled_at` is a second kill switch.
7. **A link actor reaches the owner views and nothing else.** `may()` learns `kind`; `/schema`, `/rows`, `/views`, `/history`, writes and undo answer 403 to it. This is what makes `owner_visible` hold, since `/rows` serves whole rows to owners.
8. **Routes.**
   - `GET /owner/views`: the live for-owners views the actor can read in scope.
   - `GET /owner/views/:id/rows?from&to&filter&sort&group`: scoped, never `'all'`. Every key the request names in filter (inside `$or` too), sort and group must be one of the view's owner-visible columns; `custom.*` is refused; else 400 `column_not_owner_visible` naming it. Rows carry only the listed keys, no `title`, `lookups`, `custom` or `links`. `total` is counted in scope. 60 per address per minute, failing closed.
   - `PUT` / `DELETE /views/:id/for-owners` (administrator, human): refused for a dataset view, a source without an owner column, or a public view. Every visible column and every stored filter, sort and group key must be owner-visible, named in the refusal. While set, only an administrator changes the view, and a PATCH re-runs the checks.
   - `GET /record-links/:dataset/:id` re-copies the link (no state change). `POST …/rotate` bumps the version and answers the new link. Revoking is rotating without handing it on. Administrator, human only.
   - `POST /record-links/request { email }`: the brief's `POST /person-links/request`, renamed because "person" is a domain word in an engine route. Public, write guard, 20 per address and 5 per email per 15 minutes like sign-in. One identical answer for every address, delivery after the response. It mails the current link to each live record whose `record_link.email` matches. It inserts, bumps and revokes nothing.
9. **A `Mailer` interface**, `send({ to, subject, text })`. The development mailer writes the outbox file. Sign-in moves onto it too, and invites (the lifecycle hook) use it. Only the development mailer may log to stdout.
10. **Theatre.** `persoon.record_link = { email: 'email' }`. One query, `mijn_producties`, with `owners: { owner: 'persoon_id' }`: one row per person and production while they hold a `bevestigd` Toewijzing on it, until `toegang_dagen` (parameter, default 30) after its last activity. Its owner-visible columns are the production's title, season, first and last day, and the person's role. A seeded "Mijn producties" view is published for owners by an administrator in the browser, not by a seed.

### Threats it must answer
- **Forgery and enumeration:** HMAC with a 256-bit secret; constant-time compare; one 401 body on one code path; 60/min on reads and 20 failed authentications per 15 minutes, failing closed.
- **Leakage:** fragment URL, `Authorization` header, no-store, no-referrer, noindex, meta tags; no logging middleware exists, and only the dev mailer logs.
- **Inference:** request and stored filter, sort and group keys are held to owner-visible columns, `$or` included; `total` counted under the same restriction; no links or lookups served.
- **Revocation:** the version lives in a table undo never touches, checked on every request with nothing cached; a deleted record refuses.
- **Widening:** a link actor gets 403 on every other route family, each proven by a test.
- **The request route as an oracle:** byte-identical answers, delivery after the response, nothing written on the request path.

### Tests (summary)
- **The link:** stable across copies; rotate kills the old one; undoing a rotation is refused.
- **Uniform refusals:** malformed, wrong MAC, wrong dataset, bumped version, overlong and deleted-record tokens all get the same status and body; 429 after the limit.
- **Startup:** refuses a missing or weak secret.
- **The link actor:** one account row on first use; 403 on `/schema`, `/rows`, `/views`, `/history`, writes and undo.
- **Publishing for owners:** each refusal named; editors and service accounts get 403.
- **The leak script as a test:** for every for-owners view, every key of every row is owner-visible; filter, sort and group on anything else are 400 naming it.
- **Headers:** present on every owner response, including the 401.
- **Request route:** byte-identical answers for known, unknown and deleted addresses; one outbox mail per live match.
- **Validation and migration:** `validateDomain` refusals; the `account` and `record_link` migration on an existing database.
- **Theatre membership:** bevestigd opens the production until `toegang_dagen` after it; geweigerd, geannuleerd, uitgenodigd and open don't.

## F2. Agent tokens

Brief: "Service accounts and an API description."

### What exists today
- Only the session cookie authenticates, and sessions come only from a magic link, so an agent would need a mailbox (auth.ts:156-187).
- Accounts are created from the CLI only (serve.ts:285-297); there are no account routes (SPEC.md:81).
- Role checks are `may(actor, surface)` (access.ts:21-37); nothing tells a human administrator from anything else.
- Writes already record `actor.id`, and undo is the batch owner's alone (writes.ts:384-393, 463-464).
- Only `/auth/*` and `/public/*` are rate-limited; a signed-in caller is unlimited.
- `/schema` is one JSON object filtered to what the actor can read (app.ts:169-208). No OpenAPI exists, and the engine has no dependency for it.

### Smallest design
1. **A service account is an `account` row** of `kind: 'service'`, with a unique `name`, no email, role `editor` unless `--role administrator` is given, and `token_hash` (sha256 of 32 random bytes). Its id is a real actor everywhere. It shares F1's `account` migration.
2. **CLI only.**
   - `--create-service <name> [--role editor|administrator]` prints the token once.
   - `--disable-service <name>` sets `disabled_at`.
   - `--rotate-service <name>` prints a new token.

   No route creates, lists or changes accounts, so "cannot manage accounts" holds by absence.
3. **`Authorization: Bearer <token>`.** Lookup by hash and a constant-time compare, refusing a disabled account. When the header is present the cookie is ignored. Every failure is one 401 body, 20 per address per 15 minutes. It never gets a cookie.
4. **What it may not do, whatever its role:** mint, re-copy or rotate record links, publish a share-token view, or publish for owners. Making data public or owner-facing stays a human administrator's act; the brief names links and accounts, and I add publishing. **Question 7.** Everything else follows its role.
5. **Audit and undo:** nothing to build. Its writes carry its id, it undoes its own batches, and history shows its name (one `COALESCE(email, name)` in `whose()`). After `--disable-service` its next request is 401. Its batches then stay as they are: nobody else may undo another account's batch (today's rule). **Question 8.**
6. **Rate limit:** 600 requests per minute per service account, failing closed.
7. **The write guard stays:** a JSON content type is required, and a cross-site `Origin` is 403.
8. **OpenAPI: `GET /schema?format=openapi`**, an OpenAPI 3.1 document generated from the same filtered source list, so a caller never learns a path it cannot call.
   - It's about 150 lines, hand-written, with no new dependency.
   - Column types map one to one; options become `enum`, nullable becomes `[T, 'null']`, readonly becomes `readOnly`.
   - It covers the paths for rows, writes (only where writable or deletable), actions with their inputs, undo, history, views and `/auth/me`, with bearer and cookie security schemes.
   - Without `format`, `/schema` answers exactly as today.
9. **Theatre:** nothing.

### Threats it must answer
- **Theft:** the token is shown once, stored hashed, never in a URL; rotate or disable takes effect on the next request.
- **Guessing:** 256 bits, constant-time compare, a failure limit.
- **Escalation to human-only acts:** refused by `kind`, tested as 403 with tables unchanged.
- **Escalation through the role:** no route takes a role or kind from a body.
- **Undoing a human's work:** the existing 403.
- **Mixed credentials:** the header wins.
- **A runaway agent:** a per-account limit, and one CLI call to disable.
- **OpenAPI as reconnaissance:** generated under the caller's own read filter.

### Tests (summary)
- **The CLI:** creates a service and prints its token once; refuses a duplicate name and `--role owner`.
- **Bearer:**
  - a valid token authenticates;
  - a wrong, overlong or disabled token, or a session id offered as a token, gets one 401 body;
  - a valid cookie with a bad Bearer is 401;
  - 429 after the limit.
- **As an editor service account:**
  - a write is logged with its id and shows its name in history;
  - it undoes its own batch, and a human editor's undo of that batch is 403;
  - after disable, its next write is 401.
- **As an administrator service account:** record links, share-token and for-owners all get 403, with tables unchanged.
- **Write guard:** 415 without JSON; 403 cross-site.
- **OpenAPI:** writable paths and enums match the declaration; an owner's document lists only its sources; plain `/schema` is unchanged (snapshot).
- **Migration:** existing accounts become `kind = 'user'`.
- **In the browser gate:** a curl sequence Stefan runs (create, write, see it in history, undo, disable, refused).

## F3. The lifecycle, the action token, and undo of a transition

Brief: "Does undo bypass the transition table? Propose it." The lifecycle and the action token are in the brief's scope but specified nowhere yet, and F3 leans on both, so their shapes come first.

### What exists today
- No lifecycle and no action token exist in code. `DatasetDecl` has neither (packages/engine/src/declare.ts:76-99); the spec describes one combined "record token" (SPEC.md:43, 66).
- Every write reads the row and updates it inside one synchronous, immediate transaction (writes.ts:376-395), and undo likewise (writes.ts:538-551). Requests never interleave inside it.
- A PATCH that changes nothing is a 200 with `batch_id: null` (writes.ts:388-389; test/batches.test.ts:301). So today a second `state: bevestigd` on a confirmed row succeeds quietly.
- `POST /batches/:id/undo` (app.ts:62 → writes.ts:532) restores each column's first `old`, in one transaction:
  - it refuses unless the batch is the caller's own, of kind write, action or undo, and not undone (writes.ts:454-467);
  - it refuses when a column no longer holds what the batch wrote (`changed_since`, writes.ts:500-507);
  - it restores through the writer (`valuesOf` → `writer.update`, writes.ts:523);
  - the row update itself is unconditional (writes.ts:243-246).
- A system-owner batch would fall through to the kind check, so any account could undo it if it were of an undoable kind (writes.ts:463-464). No system batch is undoable today (`seed`, or no batch row), but that is the reason a person's confirmation must never be logged under `-1`.
- The Toewijzing writer refuses every write by an owner (`forPlanners`, packages/theatre/src/writers.ts:62-80, 147-157), and a row with neither person nor name (writers.ts:130-138).

### The lifecycle shape (engine)
- **Declaration:** `DatasetDecl.lifecycle = { column, transitions: { from: string[] | '*', to: string, roles: Role[] }[], hooks?: Record<to, Hook> }`. `column` must be an options column; every `from` and `to` must be one of its options.
- **What counts as a transition:** a write that changes `column` on an existing row, through PATCH, an action's update, or undo. It is allowed when a declared transition matches `(current, to)` for the actor's role.
- **A create is not a transition.** It may set any of the column's options (writers still judge it). So import, `--seed-missing` and the parity run are unaffected, and parity stays at 0 mismatches.
- **The race (the gate's "one success and one 409"):** a 409 exists only when the caller states the value it expects.
  - A lifecycle write carries `expect: { <column>: <from> }`. The engine compares it with the current value inside the transaction; a mismatch is 409 `transition_lost`.
  - The action token carries its `from` by declaration (confirm and decline are `uitgenodigd → …`).
  - The grid sends the value it showed. An agent's PATCH without `expect` keeps today's behaviour: the transition is judged against the current value, and a no-change stays a 200 no-op. **Question 10.**
  - The engine adds no conditional `UPDATE … WHERE column = from`: inside the immediate transaction it would be dead code.
- **Every transition appends to Revision**, as any write does.
- **Hooks are declarative and run after commit.** A hook returns what to do, and the engine does it:
  - `token: { to: string[], days: number }`: mint an action token row inside the transaction;
  - `mail: { to, subject, text }`: sent through the Mailer after commit, as sign-in already delivers after the response (auth.ts:124-125).

  A refusal later in the batch therefore rolls back the token and sends nothing.

### The action token (engine)
- **Table:** an engine table `action_token (hash, dataset, record_id, from, to_options, expires_at, used_at, minted_batch)`.
  - 32 random bytes, stored as sha256, compared in constant time.
  - Expiring, consumed on first use (`UPDATE … WHERE used_at IS NULL AND expires_at > ?`, as the magic link, auth.ts:140-144).
  - Bound to one record and one `from`.
- **The page:** `<app-url>/#/act/<token>`; the token stays in the fragment.
  - `POST /act/view { token }` answers the minimal projection the dataset declares (`lifecycle.token_projection: string[]`, owner-visible columns only).
  - `POST /act { token, to }` performs the transition with `expect` set to the token's `from`. A reused, expired or other-record token gets one identical 401.
  - Public, rate-limited, no CORS headers, Host check and write guard kept, and the F1 no-store, no-referrer and noindex headers.
- **The actor:** the transition is made as the record owner's **link account** (F1 item 6, created on first use). That has four consequences:
  - history names the person;
  - nobody else may undo it (writes.ts:463-464), and link actors have no undo route, so no new batch kind is needed;
  - the role check runs as `owner`, the role the brief gives those two transitions;
  - `scopeOf` checks a second time that a token for slot A cannot act on slot B, since the actor's subject must equal the row's `persoon_id`.

  The token's dataset therefore needs an owner column pointing at a dataset with `record_link`. **Question 11.**

### The answer to "does undo bypass the transition table?"
It depends on where the check sits. A check in the PATCH route only: undo bypasses it, writing `bevestigd → uitgenodigd`, which no transition declares. A check in the shared write path that undo also uses: undo is refused for the same reason, and no confirmation could ever be undone.

### Proposal
1. **The check lives in the shared write path** (beside `valuesOf`), which PATCH, action updates and undo all use.
2. **Undo calls it in an explicit undo mode.** The check then verifies that the write is the exact inverse of the batch's own transition (its first `old`, last `new`, writes.ts:478-482), not the table.
   - `changed_since` already proves the column still holds the batch's `to`.
   - It is no new permission: only the batch's own account may undo, and only while nothing changed since.
3. **An undo revokes the action tokens its batch minted** (`minted_batch`); the engine table is itself never undone. The invite mail stays sent, but its link now answers 401. This replaces the earlier "rely on a 409".
4. **Theatre:** the Toewijzing writer admits an owner's transition on its own row (SPEC.md:178 already promises it), and an `open` row with a role and neither person nor name.

### Tests
- A PATCH of an undeclared transition: 422, row unchanged.
- A PATCH with a stale `expect`: 409 `transition_lost`; a matching one: 200.
- Two confirmations of one token flow (the gate's simultaneous pair, sent concurrently): one 200 and one 409, and the row is `bevestigd` once in Revision.
- Creates, import and `--seed-missing` set any option without meeting the table; parity on the invented export stays at 0.
- A hook's token is minted in the transaction and its mail is written to the outbox only after commit; a writer refusal later in the batch leaves neither.
- An editor's `open → bevestigd`, undone: the row is `open` under an undo batch, and Revision shows both.
- An undo after a later transition: 409 `changed_since`, nothing written.
- Undoing `open → uitgenodigd` marks its token used; the link then answers 401.
- A token confirmation: the batch actor is the person's link account. An editor's undo of it is 403. A token for slot A on slot B is 401.
- The confirm page's projection carries only the declared columns.

## F4. The matrix fill action

Brief: "The matrix declaration names an action." "Choosing a person in an open cell runs a theatre action that splits the slot when aantal > 1."

### What exists today
- `MatrixDecl` (declare.ts:51-61) has down, across, label, cell, note, keys, marks, count and away. It has no match column and no open column, although the spec names both (SPEC.md:46, 60). Theatre's declaration is at packages/theatre/src/datasets.ts:161-171.
- The grid fills a cell by a plain create or update on the join dataset (apps/grid/src/matrix/store.ts:219, 229).
- **An action can only create.** `ActionDecl.run` returns `{ dataset, values }[]`, all created (declare.ts:160-165; actions.ts:72-74), under one batch of kind `action`. A split needs an update: the open row's `aantal` 3 → 2, plus a new filled row.

### Proposal
1. **`MatrixDecl` gains `open: { match: string; count: string; fill: string }`.** `match` is the slot's kind column (theatre: `rol_id`), `count` its number column (`aantal`) and `fill` the name of a domain action. Validation: `match` is a relation column (its labels are the target's titles, through `lookups`), `count` an integer column, and `fill` names an action whose `on` is the join dataset and whose `input` has exactly one relation, to the `across` dataset. Which open row is the action's record (its `id`), not a second input.
2. **The open column (engine, generic):** per down row, the join rows whose `across` is null, shown as the sum of `count` with the `match` labels. Free-text rows (the `label` column) stay under "extern", as today.
3. **Filling:** choosing an entity in an open cell calls `POST /actions/<fill>` on one open row, with the entity as the input. Which open row: **Question 3.** This replaces the spec's generic "fills one open row before it creates a new one" (SPEC.md:60): the domain decides, so the engine knows no split rule.
4. **Actions may update.** `run` returns `{ creates, updates }`, where an update is `{ dataset, id, values }`. Each update's row is read in the caller's scope, as the action's own record is (actions.ts:56-63; out of scope is 404), with `ctx.current` the live row. It goes through `writableOf(…, 'update')`, `valuesOf` and the transition check, under the same `action` batch. One undo reverses both: `touchedBy` already handles updates and creates in one batch (writes.ts:470-486). Existing actions return creates only; the return type accepts the old array for them.
5. **Theatre's `vul_slot`:** writes one state, `voorlopig` by default (**Question 12**); the invite follows only from the lifecycle hook on a later move to `uitgenodigd`. aantal 1 fills the row (persoon_id set); aantal > 1 updates the open row to aantal − 1 and creates a filled row with aantal 1, the same rol_id and activiteit_id.

### Tests
- Validation refuses `open.fill` naming no action, an action on another dataset, or one whose input is not the across relation.
- An action returning an update writes it through the writer (a refusing writer rolls the batch back).
- `vul_slot` on aantal 3: the open row has aantal 2 and one filled row exists. One undo restores aantal 3 and removes the filled row.
- `vul_slot` on aantal 1: the row is filled in place; undo empties it.
- In the browser: the matrix shows the open count and role labels, and filling one of an aantal 3 slot leaves 2.

## F5. The engine's surface: the freeze list

Brief: "Add a section to the spec listing the shapes after step 2 … Anything else needs a finding."

### What exists today
The brief names: dataset, query, writer, skin needs, lifecycle, record token, actions, batches and undo, published views with member-visible columns, service accounts. The engine already carries more than that list, all of it in the spec:
- dataset keys: `owners`, `config` (with `--seed-missing`), `links`, `scoped`, `group_facts`, `icon`, `new_label` (declare.ts:76-99);
- domain keys: `space`, `sections` (declare.ts:131-142);
- engine tables: _migrations, saved_view, revision, batch, source_display, account, magic_link, auth_session, rate_limit (engine-tables.ts:6, 41; auth-tables.ts);
- the filter language, the import command, `/history`, and the public view behind a share token.

### Proposal
The spec gets a section **"The engine's surface after step 2"**, listing:
- **Shapes:** dataset (with owners, config, links, scoped, the lifecycle and the record token), query (with owners, of, creates, links), writer, skin needs (title, date, matrix with `open`, space, sections, group_facts, tones, inherited, icon, new_label), actions (create and update), batches and undo, views for owners with owner-visible columns (F1; names per Question 4), public views behind a share token, record links (F1), service accounts (F2), the action token (F3).
- **Engine tables:** the nine above, plus `record_link` (F1) and `action_token` (F3), and the new `account` columns `kind`, `name`, `token_hash`.
- **Interfaces and CLI:** the Mailer; `--fresh`, `--import`, `--seed-missing`, `--create-admin`, `--create-account`, the service commands, `--link-secret-file`.
- **Routes**, named: `/rows`, `/schema` (and `?format=openapi`), writes, `/actions/:name`, `/batches/:id/undo`, `/revisions`, `/history`, `/views` (with `share-token` and `for-owners`), `/sources/:name/display`, `/auth/*`, `/public/views/:token`, `/owner/views`, `/record-links/*`, `/act`, `/act/view`.
- **The rule:** anything not on this list needs a finding before it is built.

Listing what already exists keeps the freeze honest: a later session cannot read "shapes after step 2" as permission to remove links or the space.

## Questions for Stefan
Defaults taken without a question (say so to change one): rate limits of 600/min per service account, 60/min per address on owner reads, and 20 failed authentications per 15 minutes; OpenAPI at `?format=openapi`; json columns never owner-visible until Field; editors get no preview of an owner view; one mail per live record when two share an email; the link-request route renamed `/record-links/request`; the link account created on first use; `aantal` added to `scripts/vocabulary-allow.txt` (the engine's fixture already uses it, test/fixture.ts:111).

1. **Beschikbaarheid and Persoon_rol.** The spec's step 2 includes availability `soort`, rates per role (Persoon_rol) and plan-side cost. The brief names none of them, and moves kandidaten to step 3. In step 2, or moved with kandidaten to step 3?
2. **An undone invite.** Undo of `open → uitgenodigd` returns the slot to open and revokes its token, but the mail already sits in the outbox. Accept that (recommended), or refuse undo of a transition whose hook sent mail?
3. **Which open row a fill takes.** When an activity has open slots for two roles, choosing a person in its open cell must pick one. (a) The cell asks for the role first, when there is more than one. (b) The person's own role (Persoon_rol) picks it, which is step 3's data. Recommended: (a).
4. **Names.** `for_owners` and `owner_visible` (recommended: the engine's own words, and "publish" keeps one meaning), or the brief's `published` and `member_visible`?
5. **Where the link version lives.** An engine table `record_link` (recommended: undo cannot un-revoke it), or `link_versie` on Persoon as the brief says (then readonly, an allowlist line, and its rotate under a batch kind undo refuses)? With the table, the migration's ALTERs become `rol_id` and `aantal` only.
6. _(Now a default: the link account is created on first use.)_
7. **Service accounts may not publish** (share token, for owners), on top of the brief's links and accounts. Agree?
8. **After a service account is disabled**, its batches stay: nobody else may undo them (today's rule). Agree, or should an administrator be able to undo a disabled service's batch?
9. **Owner accounts and `owner_visible`.** Today an owner account with a session reads whole rows on `/rows`, including `notitie` and `dietary`. The link actor is confined to owner views, so step 2 is safe; until the cut is built, an owner account and a link for the same person see different columns. Should owner accounts be cut to owner-visible columns too? Recommended: change the spec line now, build it in a later step.
10. **The expected state on a lifecycle write.** The grid sends the state it showed (`expect`), so a stale cell edit is a 409 instead of a quiet overwrite; an agent's PATCH without `expect` stays as today. Recommended. Or every lifecycle write must carry `expect`?
11. **A person's confirmation is logged as their link account** (history: "bevestigd door <naam>"), which also guards slot A against slot B through the owner scope. Recommended. It means the action token's dataset must have an owner column pointing at a dataset with `record_link`.
12. **Which state the matrix fill writes.** `voorlopig` (recommended: pencilled in, nothing mailed, as the Koksijde "?"), then the planner moves it to `uitgenodigd`, which mails the invite. Or `uitgenodigd` directly, mailing on fill?
