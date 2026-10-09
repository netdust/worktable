# Findings F1 and F2: person pages and agent tokens

Advisor draft, 2026-10-09, on `feature/step-2` at `e080e02`. Every claim about today's engine carries a `file:line`. Nothing here is built; Stefan approves first. Format follows `specs/step-1/finding-seed-missing.md`.

The two findings share one engine fact: **every actor the engine knows is an integer account id**. `Revision.actor_id` (`packages/engine/src/revision.ts:14`), `batch.actor_id` (`engine-tables.ts:86`), `undoableBatch` (`writes.ts:458-467`: a batch is undoable only by `actor.id`, or when it belongs to the system owner `-1`), `history.whose()` (`history.ts:119-125`: resolves the actor's email from `account` by id, `-1` is "system", an unknown id is "gone"), `listViews` (`views.ts:232`: `owner_id = actor.id`) and `saved_view.owner_id` all key on it. The `Actor` a writer sees is `{ id, role, subject }` (`declare.ts:144-148`). Both a person link and a service account therefore need a row in `account`, or they fall outside audit, undo and history. That decides most of the design below.

---

# F1: person pages, the stable record link, owner views, the link request by email

## What is missing today

**Actors and sessions.**
- Three roles, `administrator · editor · owner` (`auth-tables.ts:3`). An owner is an account row with `(subject_dataset, subject_id)` (`auth-tables.ts:13-14`), checked at creation against a declared dataset and a live row (`auth.ts:60-71`). Accounts are CLI-only (`serve.ts:285-316`); the spec confirms there are no account routes (`docs/SPEC.md:81`).
- The only way in is the `wt_session` cookie: `sessionMiddleware` reads the cookie, hashes it, joins `auth_session` to `account`, re-reads the role and `disabled_at` on every request, else 401 (`auth.ts:173-187`). A session id in any header or parameter is refused (`test/auth.test.ts:187`). The magic link is `<app-url>/#/auth/<token>` (`auth.ts:108`), consumed by a POST from the grid's confirm screen (`apps/grid/src/ui/App.tsx:56-62`), single-use through `UPDATE … WHERE used_at IS NULL AND expires_at > ? RETURNING` (`auth.ts:140-144`), 15 minutes (`auth.ts:14`).
- `account.email` is `NOT NULL` and `UNIQUE … COLLATE NOCASE` (`auth-tables.ts:11,22`): no account exists without an email, so nothing today could represent "this Persoon, via its link".
- The link request answers `{ ok: true }` for every shaped email, delivers after the response on a timer, 20 per address and 5 per email per 15 minutes (`auth.ts:117-127`). Delivery writes an outbox file with mode 0600 and **logs the link to stdout** (`auth.ts:98-115`, the log at `:111`). There is no mailer interface: `deliver()` writes the file itself.

**Tokens, hashing, comparison.**
- Tokens are 32 random bytes base64url (`auth.ts:40`); only `sha256` is stored (`auth.ts:39`, used at `:107,:152`; share tokens at `views.ts:316`). The public-view lookup compares with `timingSafeEqual` over every public view's stored hash (`views.ts:331-342`), after a 128-character cap (`views.ts:33,332`). Nothing HMAC-based exists; there is no server secret and no config for one (`serve.ts:211-232` lists every flag).

**Owner scoping.**
- `scopeOf(actor, source)` is `'all'` for any non-owner, `'none'` when the source has no owner column or the column does not point at the subject's dataset, else `{ column, id }` (`access.ts:63-69`; `pointsAt` at `:58-61` needs the query column to declare `relation: <subject dataset>`). `readable()` hides every source without an owner column from an owner (`access.ts:48-50`); `/schema` filters on it (`app.ts:178-181`).
- An owner reads **whole rows** of its scoped sources: `readRows` adds only the scope `WHERE` (`rows.ts:24-41`); every declared column is served (`rows.ts:81`), with `lookups`, `custom` and `title` (`rows.ts:88`). Nothing in the engine marks a column admin-only; the only admin-only values are enforced in theatre writers on **write** (`packages/theatre/src/writers.ts:222-233`: rates and parameters), never on read. So an owner account on Toewijzing today reads its own `notitie`, and on Persoon its own `dietary`, both admin-only in the brief.
- Filters, sort and group accept any declared column (`params.ts:114-156`, `filter.ts:28-33`), and `custom.*` keys on a dataset with `custom` (`filter.ts:20-26`). A saved view validates the same way (`views.ts:96-126`). So an owner can today sort or filter on any column of a scoped source: the inference channel the brief closes does not exist as a concept yet.

**The existing public view (share token).**
- `PUT /views/:id/share-token`, administrator only (`access.ts:30`, `views.ts:286-289`), mints a token, stores `sha256`, sets `public = 1`, answers the token once; a second PUT rotates, `DELETE` clears (`views.ts:306-327`). It refuses a dataset view (`not_query`) and a view whose `visible_fields` holds the source's owner column (`owner_column_visible`) (`views.ts:298-304`).
- `GET /public/views/:token` is registered before the session middleware (`app.ts:166`), takes only `from` and `to` (`views.ts:34,368-370`), 60 per address per minute failing closed (`views.ts:366-367`), and reads with scope **`'all'`** (`views.ts:355`): a public view is unscoped by construction, which is why the owner column must be hidden. Rows are projected to `visible_fields` minus the owner column and link keys (`views.ts:354,358`); columns carry `key, label, type` (`views.ts:357`). No `Access-Control` header is set (`test/public.test.ts:123-130`); the Host allowlist stands in front of it (`app.ts:154-160`). No response sets `Cache-Control`, `Referrer-Policy` or `X-Robots-Tag` (grep over `packages/engine/src`: none).
- `saved_view` has `public`, `share_token`, `shared`, `owner_id`, `format` (`saved-view.ts:231-235`); nothing like "for owners".
- While public, only an administrator may change the view (`views.ts:174-176`).

**Theatre.**
- `persoon` declares `owners: { owner: 'id' }`, a nullable `email`, and neither `token`, `user_id` nor `link_versie` (`packages/theatre/src/datasets.ts:126-151`). The spec lists `token` and `user_id` on Persoon (`docs/SPEC.md:160`); the code never had them.
- `persoonWriter` checks only that an email holds `@` (`writers.ts:121`): two live personen may share one address.
- No query has an owner column yet; `dagplanning`, `productie_dag` and `voorstellingen` (`queries.ts`) are unscoped. A query with `owners.owner` works (fixture `per_project`, `test/fixture.ts:98-113`, with `project_id: { relation: 'project' }`), and the access tests prove it (`test/access.test.ts:79`).

**Vocabulary.** `bun run check` builds the forbidden word list from every domain column name split on `_` (`scripts/check-vocabulary.ts:42-52`). A `link_versie` column on Persoon adds `link` and `versie`; `link` is used throughout the engine (`declare.ts` LinkDecl, `auth-tables.ts` magic_link, `views.ts`, `rows.ts`, tests). It would need an allowlist line in `scripts/vocabulary-allow.txt`, or the column lives elsewhere (see design, point 2).

## Smallest design

**0. Two words, so the two kinds of view never collide.**

| | Public view (exists) | Owner view (new) |
| --- | --- | --- |
| Column on `saved_view` | `public` + `share_token` | `for_owners` |
| Who reads | anyone holding the share token | an owner actor: a record link, or an owner account |
| Scope | `'all'`: unscoped, so the owner column must be hidden (`owner_column_visible`) | `scopeOf(actor)`: the source **must** declare an owner column (`no_owner_column`) |
| Columns | any `visible_fields` | only columns declared `owner_visible` (`column_not_owner_visible`, naming it) |
| Route | `GET /public/views/:token` | `GET /owner/views`, `GET /owner/views/:id/rows` |
| Publish | `PUT /views/:id/share-token` | `PUT /views/:id/for-owners`, `DELETE` clears |

A view is one or the other, never both (`PUT for-owners` on a public view is 400 `already_public`, and the reverse `already_for_owners`), because the two scopes contradict. "Publish" stays the word for the share token, as `docs/SPEC.md:55` uses it (and step 4's Publication will use it a third time; the brief's "published view" would be a fourth meaning, so I avoid it). The brief's `member_visible` becomes `owner_visible`: the engine's role is `owner`, the scope column is the `owner` column, and "visible to the row's owner" is exactly what the flag means. If Stefan prefers `member`, it is a rename, nothing structural.

**1. The column flag.** `ColumnDecl` gains `owner_visible?: boolean` (`declare.ts:28-41`). The engine never decides which columns get it; theatre marks them. `validateDomain` refuses `owner_visible` on a `json` column (a custom JSON would expose every key; Field is step 5) and on a column that is the source's owner column (it is the scope, never a value).

**2. The record link: an engine table, not a domain column.** The brief says `link_versie` on Persoon. I recommend instead an engine table `record_link (dataset, record_id, version, rotated_at, rotated_by)`, unique on `(dataset, record_id)`, version `0` when no row exists. Reasons, in order of weight:
- **Undo.** A bump on a domain column is revised like any write (`writes.ts:388-393`), and the admin who rotated it could undo that batch and **un-revoke** the link (`undoBatch` restores any domain column, `writes.ts:511-529`). Engine tables are never undone, because `touchedBy` refuses an entity that is not a domain dataset (`writes.ts:475-476`). The display override already uses exactly this argument (`docs/SPEC.md:58`: "revised under a write batch and is not undone").
- **The generic-table rule.** The spec keeps per-record engine state in tables keyed on `(entity, record_id)` (`docs/SPEC.md:48`); a link version is such state.
- **Vocabulary and migration.** No `link` allowlist line, no `ALTER` on `persoon`, no parity concern.

The dataset declares that it can carry a link: `record_link: { email?: <text column> }` on `DatasetDecl`. (`links` plural already means linked rows, `declare.ts:64-71`; the singular key is too close, hence `record_link`.) Validation: the dataset must declare `owners.owner` (else no owner view could ever scope to it), and `email`, when given, must be a `text` column.

**3. The token.** `token = <dataset>.<id>.<base64url(HMAC-SHA256(secret, "record-link:" + dataset + ":" + id + ":" + version))>`; 32 bytes of MAC, the whole thing capped at 128 characters like every other token (`views.ts:33`). Verification: parse the three parts, require the dataset to declare `record_link`, read the live record (`deleted_at IS NULL`) and its `record_link.version` (0 if none), recompute the MAC, compare with `timingSafeEqual`. Any failure, including a missing or deleted record, a dataset without `record_link` and a malformed token, answers the same `401 bad_link` body, and the MAC is computed and compared even when the record is missing (against version 0), so the timing does not say whether the id exists. Nothing is stored for a link: it is stable, re-copyable, and dies the moment the version moves.

The secret: `--link-secret-file <path>` on `serve.ts`, a file of at least 32 bytes, mode checked (refuse group/world readable), never in the database, never logged. Startup refuses a domain that declares `record_link` without it, the way a non-loopback hostname is refused (`serve.ts:259-262`). The test engine passes it as an option.

**4. How a link carries.** The page is `<app-url>/#/link/<token>`: the token in the fragment, as the magic link does (`docs/SPEC.md:81`, `App.tsx:56`), so it never reaches a server log, a proxy or a `Referer`. The grid's link page keeps the token in memory and sends every API call with `Authorization: RecordLink <token>`; the token is never in a URL the engine sees. Responses on `/owner/*` and on `/record-links/*` carry `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`, no `Access-Control-*`; the Host check (`app.ts:154-160`) and the write guard (`write-guard.ts:18-30`) stay. The page itself is static: the grid's `index.html` gets `<meta name="referrer" content="no-referrer">` and `<meta name="robots" content="noindex">`, because the engine does not serve the page and cannot set its headers (Vite in dev, whatever hosts `apps/grid` later).

**5. The link actor is an account row.** `account` gains `kind` (`user · service · link`, default `user`) and `name` (nullable), and `email` becomes nullable (`UNIQUE` on SQLite admits several NULLs). On the first verified request for a record, the engine inserts `{ kind: 'link', role: 'owner', subject_dataset, subject_id, email: NULL }`, unique per `(kind, subject_dataset, subject_id)`; later requests find it. From then on it is an ordinary `Actor` `{ id, role: 'owner', subject }` plus `kind: 'link'`, so Revision, batch, undo, history and `whose()` all work unchanged when a writer later allows a write ("notes later"). The magic-link request must skip rows without an email (`auth.ts:101` already needs an email match, and NULL matches nothing); a `link` or `service` account never gets a session cookie (`sessionMiddleware` adds `AND kind = 'user'`). Disabling is `disabled_at`, which the middleware already re-reads per request.

Why not a sentinel id: `-1` is the system owner and passes the undo ownership check (`writes.ts:463`); `0` is the pre-account orphan owner (`migrate.ts:111-127`); any other negative number is an unauditable actor. Why not the general API: see 6.

**6. The surface a link actor gets is the owner views, nothing else.** `may()` (`access.ts:34-37`) learns `kind`: a `link` actor is allowed exactly `owner.views` (new surface). `/schema`, `/rows`, `/views`, `/history`, writes and undo answer 403 to it. This is what makes `owner_visible` hold: an owner **account** today reads whole rows on `/rows` (above), and a link actor on the same routes would read `notitie`, `dietary`, rates. The link actor never touches those routes. Owner accounts keep what the spec gives them (`docs/SPEC.md:76`), and also get `owner.views`; whether they too should be cut to `owner_visible` on `/rows` is an open question below.

**7. The owner-view routes.**
- `GET /owner/views`: the live `for_owners` views whose source the actor can read with a scope that is not `'none'`, each as `{ id, name, source, skin, columns: [{ key, label, type, options? }], sort, group_by, date }`, columns limited to its `visible_fields`. Shared or not is irrelevant here; `for_owners` is the only gate.
- `GET /owner/views/:id/rows?from&to&filter&sort&group&limit&offset`: `readRows` with `scopeOf(actor, source)` (never `'all'`; `'none'` is 404). The stored filters apply, then the request's filter on top (AND). Every key the request names in `filter` (including inside `$or`), `sort` and `group` must be in the view's `visible_fields` and `owner_visible`; a `custom.*` key is refused outright; otherwise 400 `column_not_owner_visible` naming the key. Rows are projected exactly as `publicRows` does (`views.ts:354-360`): the listed keys only, no `id` unless listed, no `title`, `lookups`, `custom` or `links`; `total` counts within scope. Same 60/min per address limiter as `/public`, failing closed.

**8. Publishing for owners.** `PUT /views/:id/for-owners`, administrator with `kind: user` only (a service account may not, see F2). Checks, in this order: a live view the admin can see (`shareable`, `views.ts:292-296`), `not_query` on a dataset view, `no_owner_column` when the source declares none, `already_public`, then every `visible_fields` entry must be a column (a link key is 400 `link_not_allowed`) and `owner_visible`, and every key in the stored `filters`, `sort` and `group_by` likewise (a stored filter on an admin-only column lets the reader infer it through which rows pass; so the admin's own filter is held to the same rule). Sets `for_owners = 1`, revised. `DELETE` clears. While `for_owners`, only an administrator may change the view (extend the `public_view` guard at `views.ts:174-176` to `for_owners`), and a PATCH re-runs the column checks so a visible column cannot be added later. Deleting the view clears `for_owners` as it clears `public` (`views.ts:273`).

**9. Rotation.** `GET /record-links/:dataset/:id` (administrator, kind user) answers `{ link }` computed from the current version: re-copy at any time, no state change. `POST /record-links/:dataset/:id/rotate` bumps `record_link.version` (insert at 1 when absent), stores `rotated_at` and `rotated_by`, answers the new link. Revoke is rotate without handing the link on. The old MAC fails on its next request; nothing is cached. Both routes 404 on a dataset without `record_link` or an unknown record; a service account gets 403 whatever its role.

**10. The link request by email.** `POST /record-links/request { email }`: public (before the session middleware), write guard, limits 20 per address and 5 per email per 15 minutes exactly as `/auth/request` (`auth.ts:119-123`), answers `{ ok: true }` identically for every shaped address, delivery on a timer after the response. Delivery: for each dataset declaring `record_link.email`, `SELECT id FROM "<dataset>" WHERE "<email>" = ? COLLATE NOCASE AND deleted_at IS NULL`; for each row, compute the current link and send one mail. It inserts nothing (not even the link account: that is made on first use), bumps nothing, and sends nothing for an address no live record carries. A `Mailer` interface, `send({ to, subject, text })`, with the development implementation writing the outbox file `deliver()` writes today (`auth.ts:109-110`); `/auth/request` moves onto the same interface, so invites (F3) get it for free. The development mailer may keep logging to stdout (`auth.ts:111`); a real mailer must not, and that is written on the interface.

**11. Theatre.** `persoon.record_link = { email: 'email' }`. One query, say `mijn_producties`, `owners: { owner: 'persoon_id' }` with `persoon_id: { relation: 'persoon' }`, one row per (persoon, productie) while the person holds a `bevestigd` Toewijzing on it and until `toegang_dagen` (organisation parameter, default 30) after its last activity; its `date` column is the production's last day so `from`/`to` work. Columns `owner_visible`: the production title, season, first and last day, the person's role label. Not visible: `persoon_id` (the scope), anything with amounts, dietary or health notes, absence reasons, other people's contact data, free text. A seeded view "Mijn producties" on it, `for_owners` set by `--seed-missing`? No: publishing is an administrator's act (the seed-missing finding kept that line); the gate's admin sets it in the browser.

## Threats and the answer to each

1. **Forgery or enumeration of links.** HMAC-SHA256 over `dataset:id:version` with a 256-bit file secret; `timingSafeEqual`; one `401 bad_link` body for every failure, computed on the same path whether the record exists or not; 60/min per address on `/owner/*` and 20 failed authentications per address per 15 minutes, both failing closed. The id in the token is not a secret: ids are sequential and the MAC is what cannot be forged.
2. **Timing on the verify.** Constant-time compare; the record lookup is by primary key for every token shape; a missing record still computes and compares a MAC.
3. **Leakage through Referer, history, logs, caches.** Fragment URL on the page; `Authorization` header on the API, so no engine URL ever holds the token; `no-store`, `no-referrer`, `noindex` on every owner response and the page's meta tags; no logging middleware exists in `app.ts`, and the development mailer's stdout line is confined to the dev mailer. Mail forwarding is inherent to a mailed link; rotation is the remedy and the admin can always rotate.
4. **Inference through filter, sort, group, stored filters, total.** Request keys and the admin's stored keys are both restricted to `owner_visible` columns in the view, `$or` branches included, `custom.*` refused; `total` is counted under the same restricted `WHERE`; links and lookups are not served.
5. **Rotation and revocation.** Version in an engine table (never undone, `writes.ts:475-476`), verified on every request, no cached verdict; a deleted record refuses; `disabled_at` on the link account is a second kill switch read on every request.
6. **A link actor widening to the general API.** `may()` by `kind`; proven by a test per route family that a link actor gets 403 with tables unchanged.
7. **The owner column leaking.** Not servable: `owner_visible` is refused on it at validation, and the projection strips it as `publicRows` does.
8. **The email request as an oracle or a spam lever.** Byte-identical answers (the existing auth test pattern, `test/auth.test.ts:43`), delivery after the response, the same two limits as sign-in, nothing written on the request path.
9. **Secret handling.** File only, permission-checked, required at startup when a domain declares `record_link`, absent from the database and from any log.
10. **Cross-site reads of the owner routes.** No `Access-Control-*`; the browser cannot read the JSON from another origin; the header is not ambient, so a third-party page cannot ride a victim's link.

## Tests

Engine, on the fixture domain (`project` with `owners: { owner: 'id' }`, `per_project` with `owners.owner = project_id`; add `record_link: { email: 'contact' }` and a `contact` column to `project`, and `owner_visible` on `name`, `day`, `aantal` of `per_project`).

- A link for project 1 verifies; copied twice it is the same; the test asserts the format `dataset.id.mac` and 128 characters at most.
- `GET /record-links/project/1`: administrator 200; editor 403; service account 403; unknown record, a dataset without `record_link`, a deleted record: 404, tables unchanged.
- Rotate: the old link is 401 on its next request, the new one answers; `record_link.version` is 1 then 2; undoing the batch of the rotate is refused (no domain entity in it).
- Malformed, wrong MAC, wrong dataset, right MAC with a bumped version, overlong, a deleted record: identical status and body; only `rate_limit` changes; 21 failures from one address in 15 minutes is 429.
- Startup: a domain with `record_link` and no `--link-secret-file` refuses; a secret under 32 bytes or world-readable refuses.
- First verified request creates one `account` row `{ kind: 'link', role: 'owner', subject }` with `email NULL`; a second request creates none; `/auth/request` for that account's absent email writes nothing.
- A link actor's `GET /schema`, `/rows/taak`, `/views`, `/history/taak`, `POST /rows/taak`, `POST /batches/:id/undo`: 403, tables unchanged. `/auth/me` answers `{ kind: 'link', role: 'owner', subject }`.
- `PUT /views/:id/for-owners`: dataset view `not_query`; a query without an owner column `no_owner_column`; a public view `already_public`; `visible_fields` holding `project_id` (the owner column) or a column not `owner_visible` is 400 naming it; a stored filter, sort or group on such a column is 400 naming it; a link key is 400; editor 403; service account 403; the view's `for_owners` is 1 and revised. A later PATCH by an editor is 403 `owner_view`; by an admin adding a non-visible column is 400.
- `GET /owner/views` as a link for project 1 and as an owner account with the same subject: the same list; an editor session is 403; a view on a source whose owner column does not point at the subject's dataset is absent.
- `GET /owner/views/:id/rows`: only project 1's rows; the brief's script as a test: for every `for_owners` view, every key of every row is in that view's `visible_fields` and `owner_visible`; no `id`, `title`, `lookups`, `custom`, `links`, `project_id`; `total` equals the scoped count; `from`/`to` narrow; `filter`, `sort`, `group` on a non-visible column, on a visible column outside the view, on `custom.x`, and inside `$or`: 400 naming the key; a `limit` above 5000 is 400 as on `/rows`.
- Headers: every `/owner/*` and `/record-links/*` response, 401 included, carries `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex` and no `Access-Control-*`; a foreign Host is 403; the 61st read in a minute is 429; a dropped `rate_limit` table is 429.
- Email request: a known, an unknown and a deleted record's address get byte-identical bodies and nothing is written before the response; one outbox mail per live record with that address, each holding a link that verifies; a record without an email gets none; 6th per email and 21st per address in 15 minutes is 429.
- `validateDomain`: `owner_visible` on a `json` column or on the owner column refuses; `record_link` on a dataset without `owners` refuses; `record_link.email` naming a non-text column refuses.
- Migration: an existing database gets `kind`, `name`, nullable `email` on `account` and the `record_link` table through `migrate`, revision untouched (the pattern of `test/auth.test.ts:261`).

Theatre: `mijn_producties` lists a production while a `bevestigd` Toewijzing exists and until `toegang_dagen` after its last activity; a `geweigerd`, `geannuleerd`, `uitgenodigd` or `open` row does not open it; the seeded "Mijn producties" view publishes for owners without a `column_not_owner_visible` refusal (every listed column is marked), and a view listing `notitie` or a rate is refused naming it.

Browser (the gate): the admin copies a person's link, opens it in a fresh context, sees that person's productions and nothing else; rotates; the old page's next load is refused; the request-by-email form gets the same answer for both addresses and the outbox holds one mail.

---

# F2: agent tokens, service accounts, OpenAPI from `/schema`

## What is missing today

- No credential but the session cookie exists (`auth.ts:173-187`); a token in a header is refused by design (`test/auth.test.ts:187`). Sessions come only from a consumed magic link (`auth.ts:156-171`), so an agent would need a mailbox.
- Every account needs a unique email (`auth-tables.ts:11,22`) and is created by `--create-admin` or `--create-account <email> --role <r>` (`serve.ts:285-297`, `auth.ts:73-85`).
- Role checks are `may(actor, surface)` over `ALLOWED` (`access.ts:21-37`): `views.share` and `sources.display` are administrator-only; nothing distinguishes a human administrator from any other.
- Writes record `actor.id` in Revision and in `batch` (`writes.ts:384-393`, `actions.ts:93`); undo is the batch owner's alone (`writes.ts:463-464`); history names the actor by `account.email` (`history.ts:122-124`) and would show `gone` for an id with no account row.
- Rate limits exist only on `/auth/*` and `/public/*` (`auth.ts:119-123,158`; `views.ts:366-367`); an authenticated caller is unlimited.
- `/schema` is one JSON object `{ sources: { name: { kind, label, icon, title, date, matrix, columns, creates, of, links, writable, deletable, actions, space, group_facts } }, space, sections }` (`app.ts:169-208`), filtered to the sources the actor can read. Column types are `text · integer · real · boolean · date · datetime · json` with `options`, `nullable`, `default`, `readonly`, `relation`, `writes` (`declare.ts:26-41`). There is no OpenAPI anywhere (grep: none) and no dependency for it (`packages/engine/package.json`: drizzle, hono, zod).

## Smallest design

**1. A service account is an account row** with `kind: 'service'`, a `name` (1 to 60 characters, unique among services, no control characters: the `labelOf` rule, `display.ts:23-29`), `email NULL`, role `editor` unless `--role administrator` is given, and `token_hash` (`sha256` of 32 random bytes, `auth.ts:39-40`). Same `account` table, so its id is a real actor everywhere (Revision, batch, history, undo) with no second id space. The same `account.kind` and nullable `email` that F1 introduces; F1 and F2 share that migration.

**2. CLI only**, as every account today (`docs/SPEC.md:81`): `--create-service <name> [--role editor|administrator]` prints the token once on stdout and nothing else stores it; `--disable-service <name>` sets `disabled_at` (the one revocation mechanism the middleware already honours, `auth.ts:176`); `--rotate-service <name>` stores a new hash and prints the new token (revoke-and-replace in one step). No route creates, lists or changes accounts, so "cannot manage accounts" is true by absence, and stays true because F1's only account-adjacent routes (`/record-links/*`) refuse `kind: service`.

**3. Bearer authentication.** `Authorization: Bearer <token>` (128-character cap, `sha256`, lookup by the indexed hash, then `timingSafeEqual` on the stored hash as `views.ts:336-339` does, `kind = 'service' AND disabled_at IS NULL`). When the header is present the cookie is ignored, so a browser session can never be mixed with a token. Failures are one `401 unauthenticated` body, 20 per address per 15 minutes failing closed. A session id offered as a Bearer is 401 (different table, different hash set). The actor is `{ id, role, subject: null, kind: 'service' }`. `/auth/me` answers `{ id, kind, name, role }`. A service account never gets a cookie and `/auth/request` cannot reach it (no email).

**4. What it may not do.** `may()` gets a kind rule: `kind: service` is never allowed `record_links.mint` (F1's admin routes), `views.share` and `views.for_owners` (making data public or owner-facing is a human administrator's act; the brief lists the first two exclusions, I add publishing, open question 9), and `sources.display` stays administrator-only as it is. Everything else follows its role: an editor service account writes what editors write, an administrator one also edits rates and parameters (`writers.ts:222-233`).

**5. Audit and undo.** Nothing to build: `runWrite` and `runAction` record its id; `undoBatch` lets it undo its own batches and refuses anyone else's (`writes.ts:463-464`), which is what "undo by batch works on them" means; `/history` shows `by: 'account'` with `actor` = its `name` (one line in `whose()`, `history.ts:122-124`: `COALESCE(email, name)`). After `--disable-service`, its next request is 401, so its batches can no longer be undone by it; a human administrator cannot undo them either (existing 403), which the gate line "refused after revoke" should mean precisely: the write is refused, and so is an undo by anyone.

**6. Rate limit.** One limit per service account id on every route, 600 requests per minute failing closed (the window must stay within the sweep's 15 minutes, `rate-limit.ts:121`). The number is a knob, not a design.

**7. The write guard stays.** An agent sends no `Sec-Fetch-Site` and no `Origin`, so the guard passes it; it must send `Content-Type: application/json` and a body under 64 KiB (`write-guard.ts:5,25-28`). A Bearer request carrying a cross-site `Origin` is still 403: a browser page cannot use a leaked token through a victim's browser without also passing CORS, and there is none.

**8. OpenAPI.** `GET /schema?format=openapi` (any signed-in actor or service account; a link actor gets 403 as for `/schema`) answers an OpenAPI 3.1 document generated from the same filtered source list `/schema` uses, so a caller never learns a path it cannot call. Hand-written generator, about 150 lines, no new dependency (`@hono/zod-openapi` would mean rewriting every route around zod schemas):
- `components.schemas.<source>`: an object with `id: integer` plus one property per column: `text → string`, `integer → integer`, `real → number`, `boolean → boolean`, `date → string, format: date`, `datetime → string, pattern`, `json → {}`; `options → enum`; `nullable → type: [T, 'null']`; `readonly → readOnly: true`; `relation` as `description`. A `<source>Row` adds `title`, `lookups`, `custom`, `links` as the engine serves them; a `<dataset>Write` holds only the non-readonly columns.
- `paths`: `/rows/{source}` GET with the parameters `parseRowsParams` accepts (`params.ts:78-87`); `/rows/{dataset}` POST and `/rows/{dataset}/{id}` PATCH, DELETE only where `writable`/`deletable` are true (`app.ts:199-200`); `/actions/{name}` per declared action with its `input` relations; `/batches/{id}/undo`; `/revisions/{dataset}/{id}`; `/history/{source}`; `/views`, `/auth/me`. Error responses as `{ code, message }`.
- `components.securitySchemes`: `bearer` (service accounts) and `cookie` (`wt_session`).
- `info.title` is the domain's name as given to `--domain`, `info.version` the engine's; `servers` is the bound address.

**9. Theatre.** Nothing: no domain word is involved. The gate uses one editor service account against the theatre engine.

## Threats and the answer to each

1. **Token theft or leakage.** Shown once, stored as `sha256`, never in a URL, no logging middleware; rotate and disable from the CLI take effect on the next request.
2. **Guessing.** 256 bits, hash lookup, constant-time compare, per-address failure limit.
3. **Escalation to a human-only act.** Minting record links, publishing (share token, for-owners) and account management are refused by `kind`, whatever the role; tested as 403 with tables unchanged.
4. **Escalation through the role.** The role is set only by the CLI; no route takes a role or kind from a body (the existing attack 8 line, `specs/step-0e-auth/plan.md`). An editor service account is refused the administrator surfaces exactly as a human editor is.
5. **Undoing a human's work.** Existing 403 on another account's batch; `history.undoable` already answers false for it (`history.ts:134-138`).
6. **Mixing credentials.** Header wins and the cookie is ignored; a token never yields a cookie; a session id is not a token.
7. **Runaway agent.** Per-account limit, failing closed; disable is one CLI call.
8. **OpenAPI as reconnaissance.** Generated under the caller's own `readable()` filter; an owner's document is as small as its `/schema`.

## Tests

- `--create-service bot` prints a token once; `account` holds `{ kind: 'service', name: 'bot', role: 'editor', email: NULL, token_hash: sha256 }`; a second `--create-service bot` refuses; `--create-service ops --role administrator` makes an administrator; `--role owner` refuses.
- Bearer: valid → `/auth/me` `{ kind: 'service', name, role }`; wrong, garbage, overlong, a session id, a disabled account: one 401 body, tables unchanged but `rate_limit`; the 21st failure from one address in 15 minutes is 429; a request with both a valid cookie and an invalid Bearer is 401 (the cookie is ignored).
- No cookie is ever set for a Bearer request; `POST /auth/request` with no email matching writes nothing.
- As `bot` (editor): `POST /rows/taak` 201 and `revision.actor_id`, `batch.actor_id` are its id; `/history/taak` shows `by: 'account'`, `actor: 'bot'`; `POST /batches/:id/undo` on its own batch 200; an editor's undo of that batch 403; after `--disable-service bot` the next write is 401 and the batch stays as it is.
- As `ops` (administrator): `GET /record-links/project/1` 403, `POST …/rotate` 403, `PUT /views/:id/share-token` 403, `PUT /views/:id/for-owners` 403, tables unchanged; `PUT /sources/taak/display` 200 (unless Stefan excludes it); a rate change on a fixture column reserved to administrators succeeds.
- Write guard on a Bearer request: missing JSON content type 415; `Origin` with `Sec-Fetch-Site: cross-site` 403.
- Rate limit: the 601st request in a minute is 429; a dropped `rate_limit` table is 429.
- OpenAPI: `GET /schema?format=openapi` as an editor is a 3.1 document whose `paths` hold `/rows/taak` with POST, PATCH, DELETE and `/rows/per_project` with GET only; `components.schemas.taak.properties.status.enum` equals the declared options; `prio` is `[integer, null]`; `afgerond` is boolean; a `readonly` column is `readOnly`; `/actions/<fixture action>` lists its input; as an owner with a subject the document names only the owner-readable sources; as a link actor it is 403; the same request without `format` still answers today's `/schema` byte for byte (snapshot).
- Migration: an existing `account` table gains `kind`, `name`, `token_hash` and a nullable `email` through `migrate`; existing rows are `kind = 'user'`.

Browser (the gate): a `curl` sequence Stefan runs, printed by the plan: create the service, POST a Toewijzing as it, see the actor in the grid's history, undo by batch as it, disable it, see the next write refused.

---

# Where the brief conflicts with `docs/SPEC.md` or with the code

1. **Public versus published.** Spec `docs/SPEC.md:55` and code (`views.ts:298-304,355`): a public view is unscoped and must hide the owner column. The brief's "published" view is scoped and requires the owner column. Resolved above by two names (`public` with a share token; `for_owners`) and mutual exclusion. The spec's Publication row and the step-4 "Publish" (`docs/SPEC.md:68,234`) keep "publish" for snapshots.
2. **Record token.** Spec `docs/SPEC.md:43,66` defines one shape: a token **column** plus a public projection, served at a tokened URL, and names "Laika's signed person link" as an instance. The brief splits it into two things: the stable person link (HMAC from a version, authenticates as an owner actor, reads owner views, no projection of its own) and the single-purpose action tokens (hashed, stored, consumed, with a minimal projection of one Toewijzing). F1 covers the first as `record_link`; the second is the lifecycle finding's and is the one that carries the spec's projection. The spec paragraph should be rewritten as two shapes, or step 2 builds a shape the spec does not describe.
3. **`link_versie` on Persoon** (brief) versus an engine table (my recommendation, F1 point 2), for the undo and vocabulary reasons given. If Stefan keeps the column: declare it `readonly: true`, add `link` to `scripts/vocabulary-allow.txt`, and record the rotate under a batch kind undo refuses (a new kind, which the growth rule in `~/.claude/CLAUDE.md` allows as a gate tier, not a plan field).
4. **Persoon columns.** Spec `docs/SPEC.md:160` lists `token` and `user_id`; the code never had them (`datasets.ts:126-151`) and neither design needs them (`account.subject_*` links the other way). Drop both lines from the spec.
5. **`POST /person-links/request`** names a domain word in an engine route (AGENTS.md: the engine never knows a domain word; `scripts/check-vocabulary.ts` would not catch "person", only `persoon`, but the rule is the rule). Proposed `POST /record-links/request`.
6. **Owner reads whole rows.** Spec `docs/SPEC.md:76` gives an owner account every column of its scoped rows; the brief makes rates, dietary and notes admin-only. Consistent only because the link actor is confined to owner views (F1 point 6). An owner account with a session still reads `notitie` and `dietary` on `/rows`. See open question 4.
7. **"Four actors"** (`docs/SPEC.md:70,277`; AGENTS.md). Neither finding adds a fifth: a service account is an account of kind `service` signing in by Bearer; a person link is an owner actor of kind `link`. The Access table's Owner row gains "or a record link", and the Administrator and Editor rows gain "or a service account of that role, by Bearer token, which may not publish or mint links".
8. **Toewijzing lifecycle text** (`docs/SPEC.md:170`) lacks `voorlopig`, `rol_id` and `aantal`, and the code's `state` defaults to `uitgenodigd` with no `open` slot semantics beyond the option (`datasets.ts:176-188`); the brief adds all four. Not F1/F2, listed because the spec edit comes first.
9. **The magic-link request logs the link** (`auth.ts:111`). Harmless with the outbox; it must not survive into the mailer interface's real implementation. Not a conflict with the spec, a line to carry into the Mailer contract.

# Open, for Stefan

1. **Names.** `owner_visible` and `for_owners` (engine words that match the role and the column), or the brief's `member_visible` and `published`? "Publish" would then mean three things in the spec.
2. **Where the link version lives.** Engine table `record_link` (recommended, F1 point 2) or `link_versie` on Persoon as the brief says?
3. **The secret's home.** `--link-secret-file <path>` with a permission check, or an environment variable? A file keeps it out of `ps` and shell history.
4. **Owner accounts and `owner_visible`.** Should an owner **account** on `/rows`, `?cells=1`, `/links`, `/history` and `/revisions` also be cut to `owner_visible` columns? Today it reads whole rows. Not in the brief; a real policy hole once Laika people get accounts. I recommend deciding now and building it in a later step, with the spec line changed in step 2 so it is not forgotten.
5. **Duplicate emails on Persoon.** The writer does not forbid them. One mail per matching live record (proposed), or refuse to send when the address is ambiguous?
6. **Inactive persons.** `actief = false` is a domain fact the engine cannot read. Should `record_link` take an optional `active: <boolean column>` so a deactivated person's link refuses without a manual rotate?
7. **The link actor's first request creates an account row** (needed for later writes, undo and history). Acceptable that a GET inserts once, or should the row be created when the admin first copies or mails the link? The email route must stay write-free either way.
8. **The owner-views surface for editors.** 403 (proposed), or should an editor be able to preview a `for_owners` view as a given subject? Preview is a larger feature; I propose not now.
9. **Service accounts and publishing.** The brief forbids minting links and managing accounts. I add `share-token` and `for-owners` to the forbidden list. Agree? And `sources/display`?
10. **Rate-limit numbers.** 600 per minute per service account; 60 per minute per address on `/owner/*`; 20 failed authentications per address per 15 minutes.
11. **OpenAPI entry.** `GET /schema?format=openapi` (proposed, one route, trivially tested) or content negotiation on `Accept`?
12. **`json` columns are never `owner_visible`** until Field (step 5). Agree?
13. **Who may undo a service account's batch.** Only itself (today's rule). The gate line "refused after revoke" reads as: its writes and its undos both stop. Agree?
14. **The page's headers.** The engine cannot set `Referrer-Policy` or `X-Robots-Tag` on the grid's HTML. Meta tags in `apps/grid/index.html` plus the headers on every JSON response: enough, or does the deployment need them on the static host too (a note for the cutover)?
