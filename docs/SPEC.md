# Planning Engine — Architecture

One standalone engine, many domains. The theatre planning model as the first domain. Websites, including WordPress, are REST clients and nothing more.

Oct 4, 2026 · @Stefan

Revised Oct 5, 2026 after the Claude Code review: English engine names, lifecycle moved to step 2, queries may join queries and the generic tables, matrix declarations made generic. This file is the spec of record.

## What this is

An engine that knows *shapes* — datasets, queries, views, writers, publications — and domain packages that know *names*. Point it at the theatre declarations and it is Laika's planning tool; point it at a fiche declaration and it is a referral guide. The engine never learns a domain word.

The edge over Yesplan, Rentman and Propared is not a feature but the split itself: those products hardcode their entities and bolt registration on as a second module. Here the admin builds views on *computed* data, the person's plan and actual sit on one row, and a new client is a new declaration, not a new product.

Three sources feed this one: the [Laika Planning — Foundation](https://claude.ai/code/artifact/2bfb4337-ea13-4888-975e-dd11da3adf66) doc (the theatre model), a code review of the atelier, ntdst-core and ntdst-baseline repos, and a real Laika planning spreadsheet. This doc supersedes the Foundation doc where they differ. Decided on 4 October after the review: the engine is a standalone service with its own database, not a WordPress plugin. The review showed that building it inside WordPress would spend most of the foundation teaching WordPress's data model a second backend — work that serves no other client and no agent. The theatre data model, the shapes and the contract did not change with that decision; only Storage and step 0 did.

## The layers

Five layers, one direction of dependency: each layer knows the one below it and nothing above.

| Layer | Package | Knows | Never knows |
| --- | --- | --- | --- |
| Delivery | engine | Published views, recipients, share links, the recipient page, ical/pdf renderers | Which domain the rows came from |
| Views | engine | SavedView rows: a source (dataset or query), filters, sort, group, hidden columns, skin, scope | What a column means |
| Engine data | engine (TypeScript service) | Declared datasets and queries as shapes; Field, Revision, Publication, Attachment keyed on ((entity, record_id)); the table store and migrations | Any domain name |
| Domain | theatre package (or any client's) | Its datasets, its SQL views, its writers with the cross-field rules, templates, roles, conflict definitions | How the grid renders or publishes |
| Storage | the engine's own database | Tables for datasets, SQL views for queries, JSON columns for custom fields; SQLite first, Postgres when a client needs it | Nothing above it |

The contract between engine and domain is one registration call per shape — a dataset, a query, a writer — and nothing else. Everything the engine does with a declared shape (migrate its table, render its columns, route its writes, snapshot its rows) it does without reading the declaration's names.

[embedded content: layers: engine on the left, domain on the right, storage underneath; the two arrows are the whole contract]

Read left to right: the domain registers its shapes with the engine; the engine routes every write back to the domain's writers. Both sit on the engine's own database, and nothing in the engine column names a theatre concept. Websites are outside the picture: they call the engine's REST like any other client.

## The engine

The engine is a standalone TypeScript service on the Folio stack (Drizzle, SQLite) with its own REST API, plus the React grid that exists today pointed at that API instead of WordPress. Its TypeScript and React code is copied from ntdst-baseline's views app; no PHP is copied. The PHP behind the grid — `RowQuery`, `Lookups`, `Rollups`, `Writes` in ntdst-baseline — is replaced, not ported; the review showed it to be a thin wrapper over `WP_Query`. Baseline drops the views module and goes back to hardening. The same REST that serves the grid serves agents and any website that wants a view. `GET /rows/:source` returns at most 5000 rows by default; a requested limit above 5000 is refused with a 400; `offset` pages past it; `total` is an exact count from a separate query, never the length of the page. On the matrix's down source, `cells=1` returns each row with its live join rows; it needs a window of at most 92 days.

**What it knows.** Four shapes, each registered by a domain package:

| Shape | Declared as | Engine does with it |
| --- | --- | --- |
| Dataset | name, a title (a column, or `{ via, else }`: the related row's title, else a column, resolved on read so it never goes stale; a relation to a dataset with such a title is refused), columns (type, nullable, default, readonly), relations (to another dataset), indexes, `custom` JSON on/off, an owner column for the owner role (the column naming whom a row belongs to), an optional lifecycle (for a status column: allowed transitions, the roles that may make each, hooks), an optional record token (a token column plus the public subset of the row it exposes), one optional public-create action, domain actions (`actions: { name: { label, on, input, run } }`: from one record, with inputs that are relations, `run` returns creates; `POST /actions/:name` runs them as the caller, with the caller's scope and role checks, through the writers, in one transaction under one batch that one undo removes; `/schema` lists them per dataset), and `config: true` (its seeds are configuration: `--seed-missing` writes them into an existing database when its table is empty, through its writer as the system owner, under one `seed` batch that cannot be undone, and brings the system-owned seeded views up to their declaration, naming each view it updates and leaving a public one alone; a config dataset may not relate to one that is not config, and a config seed row refers to a row of another config dataset by that row's title (its natural key), never by id: `--seed-missing` resolves the key in the target table and refuses the row, naming dataset, row and key, when no live row has that title or more than one has) | Creates and migrates the table; exposes rows, schema and writes to the grid; keys Field, Revision and Attachment rows on it. A dataset may declare `owners: { owner: <column> }`, where the column is `id` or a relation column; an owner account reads and writes only rows whose owner column is its subject, and a source without one does not exist for it (404). Rows are scoped; lookups through a relation expose the title only: an owner reads the titles of the rows its own rows point at, never those rows themselves. A domain may not name a dataset or query after an engine table (`saved_view`, `revision`, `_migrations`, `account`, `magic_link`, `auth_session`, `rate_limit`); validation refuses it before anything is written. The list is the engine's own table declarations |
| Query | name, the SQL view (which exposes an `id` column), its owner column for the owner role, a column map: each column read-only or `writes: {dataset, field, key}` | Creates the view in a versioned migration; exposes it to the grid exactly like a dataset, with mapped columns editable and the rest not; a mapped column takes its target column's options and relation unless it declares its own. A query may declare `owners: { owner: <column> }` and is then scoped as a dataset is (rows scoped, lookups expose the title only, 404 without one); its name may not be an engine table's either |
| Writer | a callable per dataset: create / update / delete, free to refuse; inside the write it may read a row by id and ask whether a live row exists (`exists(dataset, match, exceptId)`: equality on declared columns, bound values, never null) | The only path a row takes into a table; a dataset without one is read-only; a mapped query column routes its write to the target dataset's writer with `row[key]`; every row write's reply carries `revision: { batch_id, changed }`, the columns the write actually changed (`batch_id` empty when nothing changed), so no column may be named `revision`; delete is soft, and a row that live rows of any dataset reference through a declared relation is not deleted: 409 `in_use` with `by: [{label, count}]` beside an English fallback message. A delete runs in this order: the owner scope, then the writer's own delete, which may refuse by role (403 `forbidden`), then the in-use check; the writer's delete runs inside the write's transaction, so a 409 rolls back whatever it wrote |
| Skin needs | which column is the title (the row's display name: the grid's first column, search, and the label of a relation pointing at it), which column is the date, the matrix, declared on its join dataset (`down` and `across` relations, an optional `label` column for a free-text entity, the `cell` options column, an optional `note` column, typed `keys` and `marks` per cell option, the `count` option the headcounts add up, and an optional `away { dataset, across, label, end }` whose dataset declares `date`; a match column for the open column comes with slots; `/schema` marks the down source with `matrix_join`), which status column the board groups on | Renders calendar, matrix and board without knowing the domain |

**Generic tables.** Five tables the engine owns because they are keyed on `((entity, record_id))` or on a view, never on a domain name:

| Table | Columns | Role |
| --- | --- | --- |
| Field | entity, key, label, type (text · number · date · choice · multichoice · yes/no · link), options, required, show_on_publication, position | Admin-defined custom fields per dataset; stored in that dataset's `custom` JSON; rendered, filtered and grouped like real columns |
| SavedView | name, source_type (dataset · query), source, skin (table · calendar · matrix · list · board), filters, sort, group_by, visible_fields, shared, owner_id, share_token, format (html · ical · pdf), public | A saved view is a row; `source_type = query` lets admins build views on computed data. Its owner is the actor who created it and only the owner changes, deletes or restores it; a viewer sees their own views and the shared ones. Delete is soft. Last write wins for views as for rows. Column widths and the matrix's picked columns stay per viewer in the browser. Known limit until Field (step 5): a saved view cannot keep a hidden column's position, nor custom columns. A seeded view is owned by the system owner `-1` (no account id is ever ≤ 0): read-only to everyone (PATCH, DELETE and restore answer 403 `read_only_view`), copied by a plain `POST /views`. At startup a view still owned by `0` moves to `-1` when its `(name, source)` matches a domain seed, else to the lowest administrator id; with no administrator it stays and startup logs the count. Each move is revised with actor `-1` |
| Revision | entity, record_id, field, old, new, actor_id, at, batch_id | Append-only audit and undo; `batch_id` groups one write's or one action's rows; `old` and `new` are stored as JSON text of the stored value and read back as values. A create also writes an `id` marker row (`old` empty, `new` the record's id), which `GET /revisions` lists. Every batch is recorded in the engine's `batch` table with its actor and kind (write · action · undo · import · seed). `POST /batches/:id/undo` undoes the caller's own write, action or undo batch in one transaction, through the writers and the caller's scope: a column is restored only while it still holds what the batch wrote, and a record the batch created is removed only while no column it left empty has been filled since; otherwise nothing changes and the answer is 409 `changed_since` naming the column. Redo is undoing the undo batch, under the same rule. Another account's batch is refused (403); an import or seed batch, a batch recorded before the table, a batch holding a delete, and an already undone batch are never undone |
| Publication | recipient_type (person · organisation), recipient_id, language, saved_view_id, period_start, period_end, rows (JSON), sent_at, channel, version | The rendered rows a recipient received, names not ids; the diff basis. An administrator publishes a view on a query with `PUT /views/:id/share-token`, which sets `public` and stores sha256 of a new 32-byte token, answering the token once; a second PUT rotates it and `DELETE` clears both. A view whose `visible_fields` holds the source's owner column is refused (400 `owner_column_visible`); a dataset view is 400 `not_query`. Deleting a public view revokes it: `public` and the token are cleared with the delete, so a restored view is private and its old link answers 404. While a view is public only an administrator may change it (403 `public_view`). `GET /public/views/:token` needs no session, takes only `from` and `to`, applies the stored filters and sort, and answers `{ columns, rows, total }`, each row projected to `visible_fields` and never the owner column; 60 calls per client address per minute, failing closed; no CORS header |
| Attachment | entity, record_id, file, name, kind, show_on_publication | One attachment mechanism for any row; inherits down a declared parent relation |

**Skins.** Table (the grid), matrix (one relation across, one down, cells are the join rows), calendar (grouped on the declared date column), list (the recipient page), board (cards grouped by a declared lifecycle column; moving a card is a lifecycle transition). Table, matrix, calendar and list exist or are specified today; board is specified from the cargovelo-core paper test and is built when a domain first needs it; none knows a domain word. Matrix rule for open slots: when the domain declares a match column, join rows whose across-relation is null are shown in one leading "open" column per row, as a count with their match-column labels; choosing an entity in an open cell fills one open row whose match column agrees before it creates a new one; drag and drop is not in v1. When the domain declares a label column, join rows with a free-text label instead of an entity get their own columns under an "extern" group.

**Lifecycle.** A dataset may declare a lifecycle on one status column: the allowed transitions, which actor roles may make each, and hooks that run in the same write (for example clearing the courier when a shipment returns to confirmed, or queueing a mail). The engine applies every transition as a conditional update on the current status; a lost race returns a conflict, so two people cannot both win. Every transition appends to Revision with from, to and actor. A lifecycle is opt-in: a status column without one stays a free enum. Grids hide the transitions a role cannot make, but the server is the authority.

**Record token and public create.** A dataset may declare a token column and a public projection, the subset of columns a token holder may read. The engine serves it at a tokened URL without an account: a shipment's track and trace, Laika's signed person link. A dataset may also declare one public-create action: an anonymous write that goes through the dataset's writer, rate-limited and with a honeypot field, and returns only the token. Nothing else is open to anonymous callers.

**Delivery.** A published SavedView renders per recipient, writes a Publication, and sends by channel. The same `share_token` serves html, ical and pdf through `format`. The recipient page shows the rows, the location block from any related dataset flagged for it, and — when the domain declares an actual side on a dataset — the confirm-and-correct controls for it.

**Access.** Four actors, no domain words. Administrators, editors and owners are engine accounts that sign in by magic link and hold one of three engine roles; recipients act through signed links and need no account. Signed person links for owners stay step 2.

| Actor | Mechanism | May |
| --- | --- | --- |
| Administrator | engine account with role `administrator` | Everything: Field, publish a query view with a share token, change a public view, and what writers reserve to administrators |
| Editor | engine account with role `editor` | Read and write every dataset and query that a writer does not restrict; own SavedView rows only; no publishing |
| Owner | engine account with role `owner`, linked to a row by `(subject_dataset, subject_id)` on the engine's own account table | Read only rows whose owner column is its subject, and see only the sources that declare one (any other source is 404); write only what the source's writer allows, scoped to its own rows; no SavedView writes (403 `forbidden`) |
| Recipient | `share_token` of a SavedView or Publication, a record token, or no token for a declared public-create action | Read-only rendering of that view or snapshot, in its `format` |

Laika's core team become editors. An owner account with no subject sees nothing. An owner column given any value other than the subject is 403 `forbidden`, on create and on update. Every request re-reads the account, so a changed role or a disabled account takes effect at once. The engine knows roles only as this table; who may write which dataset stays in domain writers.

Sign-in is a magic link: `<app-url>/#/auth/<token>`, the token in the URL fragment so it never reaches a log or a scanner's GET. The grid's confirm page shows one button, which POSTs `{ token }`; consume is a guarded write, single-use, valid 15 minutes. A request for a link answers the same `200 { ok: true }` whatever the email, and delivery happens after the response. Link tokens and session ids are stored only as sha256. Every sign-in mints a new session id (30 days; cookie `wt_session`, `HttpOnly; SameSite=Lax`). Rate limits: link requests 5 per email and 20 per client address per 15 minutes, consume 20 per client address per 15 minutes, answering 429 `rate_limited`; proxy headers are never trusted. In 0e accounts are managed by the engine CLI (`--create-admin`, `--create-account <email> --role <r> [--subject <dataset>:<id>]`, `--disable-account <email>`); there are no account routes. With no mailer, a link goes only to a development outbox (`--outbox <dir>`) and a non-loopback `--hostname` is refused at startup. Real mail delivery, `Secure` cookies and a trusted proxy are the cutover's.

The engine rejects any request whose Host is not its bound address; this check stays when auth lands. Writes require a JSON content type, and a browser request must be same-origin: `Sec-Fetch-Site` `same-site` or `cross-site` is refused, and so is a request that carries an `Origin` without `Sec-Fetch-Site`; this check also stays when auth lands. From step 0e on, the permission check runs before the in-use check, so an actor who may not delete gets a refusal without the in-use counts; a test proves the order. Behind a dev proxy that rewrites the Host (the grid's Vite server), the proxy's own host check stands in for the engine's, and it is pinned in configuration, never left to a default.

Scoping is declared, not coded: a dataset or query names an owner column for the owner role (person, customer, courier and so on), and the engine filters by it. Writers receive the actor and may refuse on it; `refuse()` rules stay domain. Action links (confirm, decline, register) are single-purpose signed tokens with an expiry.

**Custom fields.** Keys are addressed `entity.key`, never flattened. A query passes each joined dataset's `custom` through as its own column (`persoon_custom`, `activiteit_custom`); the grid flattens them using Field. Filters compile to `JSON_EXTRACT`; a hot key gets an expression index, not a schema change.

**The one refusal.** Admins create fields, views, templates and publications — never datasets. A dataset is code in a domain package. That line is what keeps this an engine for many clients rather than another NocoDB.

## The contract

A domain package implements exactly five things. If it needs a sixth, the engine is missing a shape, not the domain a feature.

1. **Datasets.** One declaration per table: columns, relations, indexes, an owner column for the owner role, an optional lifecycle, an optional record token with its public projection, whether it carries `custom`, and which parent relation Attachment and custom values inherit along.
2. **Queries.** One SQL file per view plus its column map. Every query exposes an `id` column, so each row has an identity. The SQL joins datasets, other queries and the engine's generic tables. Each column either reads or declares its write target.
3. **Writers.** One module per dataset with create, update and delete, free to refuse. The rules that live in atelier's PHP repositories today — one of person or name, one assignment per person per activity — move here as they are; the classes do not. Domain rules live here and nowhere else.
4. **Skin needs.** Which column is the title (or a title through a relation, `{ via, else }`), which column is the date for calendar, the matrix declaration on its join dataset, which status column the board groups on. One line each.
5. **Seeds and parameters.** Sjabloon rows, Rol rows, the organisation's day-line hour and working-time limits — all data seeded by the package, editable by the admin.

What a domain package does **not** contain: grid components, saved-view logic, publication, share links, audit, custom-field rendering. Those belong to the engine, once.

**The test.** The VAD Doorverwijsgids is a second domain: one `fiche` dataset with `custom`, two or three queries, one writer, no Publication. It has to run on the same engine with zero engine changes. If it needs one, the engine learned a name it should not know, and that change is reverted into a shape.

**Package layout.** One new repository, `worktable`, for the whole system: `packages/engine` (shapes, REST, views, publication, actors; imports no domain), `packages/theatre`, `packages/fiche` (the Doorverwijsgids, kept in the repo from the first week as the test that the engine knows no theatre word) and `apps/grid` (the React grid). A lint check in the gate fails any import of a domain package (`theatre`, `fiche`) from inside `engine`; domain packages import `engine` to register their shapes. A second check fails any domain word anywhere in `packages/engine`, in code, comments and tests. Its word list is built from the domain packages' dataset, query and column names, plus a fixed list of the spec's domain nouns. A committed allowlist, one word per line with its reason, names the generic English words a domain also uses (`status`, `type` …). A third check fails any term from the export's name list, kept on the owner's machine outside the repo, in the staged diff; without the list it is skipped. It starts clean, not inside Folio: Folio is an agent case tool of about 26,000 server lines, and only its filter compiler, its views and fields table shapes, and its magic-link sessions are worth copying in. Domain packages are TypeScript modules the engine loads: the theatre package holds its declarations, SQL views, writers and seeds. WordPress keeps its own atelier package for public content and gains one small client: one shortcode and YOOtheme element that render a public view by a site-side name: `[worktable_view view="<name>"]`. The site's configuration maps each name to the view's share token, so a token never reaches post content, revisions or WordPress's REST API, where YOOtheme's stored layout would publish it. The fetch is server-side, cached five minutes per engine, token and window, and stops for a minute when the engine is down or rate-limited. Nothing of the engine lives in PHP.

## Storage

The engine owns its data. One database per engine instance; nothing of the planning tool is stored in WordPress or read from it.

| Concern | Choice | Why |
| --- | --- | --- |
| Database | SQLite through Drizzle, as Folio does; Postgres behind the same schema when a client's size or hosting asks for it | Theatre-scale data is thousands of rows; SQLite handles it on one file, and both engines support the views and JSON functions the queries need |
| Datasets | Real tables with real columns, foreign keys between datasets, indexes per table: Activiteit `(plandag)`, Toewijzing `(persoon_id)` and `(activiteit_id)`, Attachment and Revision `((entity, record_id))`. persoon_dag joins across tables, so no index spans two | Every query is a join on a column; no pivot, no serialised id list |
| Migrations | Each dataset's DDL is recorded with its hash in `_migrations`. A changed hash is migrated: a new nullable or defaulted column and index changes by `ALTER`, anything else by SQLite's table rebuild, in one transaction with foreign keys off and `foreign_key_check` before commit. Ids and `sqlite_sequence` survive, Revision is never touched, and every query view is recreated after a change. Changes that would lose data are refused before anything is written, naming the dataset and column: a new NOT NULL column without a default on a table with rows, a lossy retype on a table with rows, and NOT NULL over a stored NULL. Before any rebuild, the database is copied to `<db>.pre-migrate`. | A declaration change never needs a hand-made schema, and a mistake costs one file copy back |
| Queries | SQL views created at startup from each query's `.sql` file in its domain package, each recorded with its SQL hash in `_migrations`; a changed hash drops and recreates the view, and every view is recreated after any dataset change | A view is the contract between a query and the grid; the grid reads it like a table |
| Custom fields | One `custom` JSON column per dataset, declared in Field, `json_extract` in filters, an expression index on a hot key | Real columns stay real; the admin never changes a table |
| Derived columns | `plandag` is the one that is stored, computed by the writer: from `start_at` and the organisation's day-line hour when the activity has a time, and equal to `datum` when it has none; it is declared readonly, so it is cut from write bodies and set only by the writer | Grouping and indexing on it is the whole grid; everything else stays computed in a view |
| Dates and times | `date` is `YYYY-MM-DD`; `datetime` is `YYYY-MM-DDTHH:mm` or `YYYY-MM-DDTHH:mm:ss`, the organisation's local wall-clock time with no zone; both must be real calendar values | The day line, the window and every comparison read these strings as they are |
| What was in WordPress | A one-off export from the private Laika repo to JSON, loaded by the engine's generic import command, with a `legacy_post_id` kept for one release; the table-rebuild migrator (built in step 0e) runs every declaration change, including the import's `legacy_post_id` | The existing Laika data moves once; after that the private CPTs are deleted |
| WordPress afterwards | A REST client. Atelier keeps the public content it has — productions, people, performances, credits, images — and gains one shortcode and YOOtheme element that render a public view by a site-side name (`[worktable_view view="<name>"]`); the site's configuration maps each name to the view's share token, so a token never reaches post content, revisions or WordPress's REST API. The fetch is server-side, cached five minutes per engine, token and window, and stops for a minute when the engine is down or rate-limited | The website shows the schedule; it does not own it |

**Rules.**

- The engine never calls WordPress. Direction of dependency is one way: websites call the engine.
- Tables and views are created by migrations the engine runs from the domain package's declarations; no hand-made schema.
- A row's id is the engine's; nothing in the engine assumes a post, a user or a WordPress capability. Actors are the engine's own (see Access).
- Backups are the database file plus the attachment store; one instance per client keeps them separable.

**Import format** (the contract with the Laika exporter):

```json
{ "worktable_export": 1,
  "source": "<free text, e.g. laika>",
  "datasets": { "<dataset>": [ { "legacy_id": 12, "<column>": "…", "<relation column>": <legacy id of target>, "custom": { } } ] },
  "checks": { "counts": { "<dataset>": 0 },
              "activities_per_week": { "2026-W41": { "<status>": 0 } },
              "assignments_per_person": { "<persoon legacy id> | \"naam\"": { "<state>": 0 } },
              "absences_per_person": { "<persoon legacy id>": 0 } } }
```

- Weeks are ISO weeks of the calendar date WordPress shows an activity on: its exported `datum`, which an activity without a time also has. They are counted per mapped status, so the comparison depends on no view's filter. The engine side counts the same way, by `datum` and `status` over live rows, and separately reports how many activities with a time the day line (`plandag`) moves to the previous day; an activity without a time is on its own `datum` and never counts as moved. That move is a known, intended difference, never a failure.
- Name-only assignments, with no persoon, count under the key `"naam"`. An absence counts once per row, not per day.
- Every dataset present must be a declared dataset, and every key a declared, non-readonly column, `legacy_id` or `custom`. Anything else is refused with its path.
- The exporter always emits `status`, so no row relies on a default.
- Value encodings: datetimes `YYYY-MM-DDTHH:mm`, local time, no zone or seconds; dates `YYYY-MM-DD`; booleans JSON `true`/`false`; legacy ids non-negative integers; a relation value is the target row's legacy id; `custom` is an object of flat values (text, number, boolean, null, or a list of those) whose keys match the filter pattern `^[A-Za-z0-9_]+$`. A row breaking the `custom` rule is refused and reported.
- **No export in git.** `bun run check` scans every file in the index, committed and staged, reading each from the index: an export's file name, a `.json` file with a top-level `worktable_export` key (or one that cannot be read as JSON), or any other non-source, non-docs file holding `"worktable_export"` fails. An invented fixture is exempt by its content, not its name: under `test/fixtures/`, named `invented-*.json`, parsing, with a `source` starting with "invented" and only `@example.test` addresses.

**Parity rule.** `bun run parity <export.json>` imports into a temporary database, signs an administrator in through the engine's own link flow, reads the engine's REST, and compares with `checks`. Its output (`specs/step-0e/parity.md`) holds, per check, pass or fail, the total compared and the number of mismatched keys, plus counts per dataset and the plandag shift: no ids, names or values. The parity gate runs only on the owner's machine and commits counts only.

## The theatre domain: datasets

The first domain package. Eleven datasets, all engine tables: three reference, six core, two config; the organisation's parameters are a column, not a table. Every table carries `id`, `custom`, `created_at`, `updated_at`, `deleted_at`, omitted below. The website keeps its own productions and people as public content; the two are linked by an id the website stores, never synced, because a planner schedules a freelance technician who never appears on the site, and the site lists a co-producer the planner never schedules.

**Reference datasets**

| Table | Columns | Notes |
| --- | --- | --- |
| Organisatie | naam, soort (eigen · partner · venue · agentschap · leverancier), adres, lat, lng, toegang (loading, parking, access notes), contact, parameters (JSON on the own organisation: day-line hour, working-time limits, confirmation deadline, warning horizon) | Your own company is a row too. It is also the location: the call sheet's location block reads from it. Child spaces are deferred |
| Persoon | voornaam, achternaam, email, telefoon, organisatie_id, contract_type (vast · freelance · dagcontract), dietary, token (signed person link), user_id (nullable engine user), actief, weergavenaam (readonly, derived by the writer from voornaam and achternaam; the title column); email and telefoon are optional | contract_type drives werktijd rules; the token is how a person acts without an account |
| Productie | titel, seizoen, status (ontwikkeling · actief · archief), organisatie_id, site_ref (nullable, the website's id for this production) | Root of the tree. site_ref is for the website's benefit; the engine never reads it |

**Core datasets (tables)**

| Table | Columns | Notes |
| --- | --- | --- |
| Persoon_rol | persoon_id, rol_id, dagtarief, uurtarief, voorkeur | Which roles a person can fill and at what rate per role. Feeds kandidaten and the cost default on Toewijzing |
| Speelreeks | productie_id, naam, locatie_id (→ Organisatie), start_datum, eind_datum, status (optie · bevestigd · geannuleerd) | Tour stop or block; children inherit locatie, custom values and attachments. The writer refuses an end before the start, and a span longer than the own organisation's `max_speelreeks_dagen` parameter (default 31, never above 366); a Speelreeks with live activities is not deleted (409 `in_use`) |
| Activiteit | productie_id, speelreeks_id (nullable), soort (voorstelling · repetitie · opbouw · afbouw · reis · overnachting · maaltijd · vergadering · andere), omschrijving, datum, start_at (nullable), eind_at (nullable), plandag, locatie_id (nullable → inherit), plaats, status (optie · bevestigd · geannuleerd), verrekening_default, bron (plan · registratie), notities | The dated leaf. `plandag` stored by the writer from the day line. `datum` is the calendar day the activity is on; `start_at` empty means it has no time (a meal, a hotel night, a whole day) and the grid shows the day without a time. When `start_at` is set, the writer keeps `datum` equal to its date; an `eind_at` needs a `start_at`. On a create, a set `start_at` decides `datum`; a disagreeing `datum` is refused only on an update. An activity needs a `datum` or a `start_at`; missing both is refused in Dutch. `bron = registratie` marks an activity created from an unplanned registration |
| Toewijzing | activiteit_id, rol_id, persoon_id (nullable), naam (external, nullable), aantal, state (open · uitgenodigd · bevestigd · geweigerd · geannuleerd), call_at, verrekening, bedrag_gepland — plan side; werkelijk_start, werkelijk_eind, pauze_min, bedrag_werkelijk, registratie_status (geen · ingediend · goedgekeurd · afgekeurd), notitie — actual side | Slot first: persoon_id null = open slot. One row carries the agreement and what the person registers afterwards. Verrekening falls back to the activity's default; bedrag_gepland from Persoon_rol, then Rol. `refuse()` keeps: one of persoon or naam, one row per person per activity. Matrix declaration: across persoon_id, down activiteit_id, match column rol_id, label column naam. Lifecycle on state: open → uitgenodigd → bevestigd or geweigerd, any → geannuleerd, geweigerd → uitgenodigd (re-invite); a person may only make uitgenodigd → bevestigd and uitgenodigd → geweigerd on their own slot |
| Beschikbaarheid | persoon_id or organisatie_id, start_at, eind_at, soort (afwezig · onzeker · beschikbaar · voorkeur), reden, bron (zelf · admin) | afwezig overlapping a Toewijzing is a conflict, onzeker a warning; an organisatie row covers all its people |
| Taak | titel, deadline, toegewezen_aan, gekoppeld_aan (productie · speelreeks · activiteit · organisatie) + record_id, status (open · gedaan), notitie | Human to-dos only; derived ones are never stored (see werklijst) |

**Shows for the website.** There is no Performance in the engine. A confirmed Activiteit of soort voorstelling *is* the show; the `voorstellingen` query exposes the public subset — productie, the calendar date (`datum`, not `plandag`: a 00:30 show is on its own day), time (empty when the show has none), venue name and address — and any website reads it by REST or renders it by view token. Atelier's Performance CPT keeps only what is public-only (ticket link, text, images) and stores the engine's `activiteit_id` to find its date. Nothing flows from the website into planning.

**Views the package seeds.** The theatre package seeds a SavedView for each dataset a planner edits or deletes (Producties, Organisaties, Personen, Toewijzingen, Afwezigheden) and for voorstellingen.

**Who may write what.** Writers refuse by actor role. In the theatre package a person writes only their own Beschikbaarheid, the actual side of their own Toewijzingen and the confirm and decline transitions on them; planners write everything except the rate columns (dagtarief, uurtarief, bedrag_gepland, bedrag_werkelijk), `registratie_status` and the organisation's `parameters`, which are administrator-only. An owner account writes only its own Beschikbaarheid (its Persoon is the owner column); every other write by an owner is refused with 403 `forbidden`, and a refused Persoon delete by an owner carries no in-use counts.

**Config datasets (seeded data, admin-editable)**

| Table | Columns | Notes |
| --- | --- | --- |
| Rol | naam, categorie (artistiek · techniek · productie · logistiek), standaard_verrekening, dagtarief, uurtarief, kleur | Catalogue for slots; rates are defaults Persoon_rol overrides |
| Sjabloon | naam, items (JSON: soort, omschrijving, offset_dag, start_tijd?, duur?, locatie_regel; at most 50 items, offset_dag at most 366) | Activity bundle for one day. Applied to a Speelreeks, it writes the activities of every day from start_datum to eind_datum in one batch; an item without start_tijd stays untimed; open slots per role come with step 2 |
| Organisatie parameters | day-line hour, max_dag_uren, max_week_uren, min_dagrust_uren, min_weekrust_uren, referteperiode_weken, confirmation deadline, warning horizon | Stored in the own Organisatie's parameters column, not its `custom`; read by the writer (plandag) and the werktijd and conflicten queries |

Resources (vehicles first) stay deferred: a Reis activity per vehicle with its own Toewijzingen covers who rides with whom. Child spaces of a venue (zaal, foyer) stay deferred until a client needs them.

[embedded content: entity map: planning tree down the left; every box is an engine table]

The tree runs Productie → Speelreeks → Activiteit → Toewijzing. Organisatie doubles as location; Persoon carries the signed link and the contract type; Attachment attaches to any row. All eleven are engine tables.

## The theatre domain: queries

Twelve SQL views, no rows of their own. Each joins datasets, other queries and the engine's generic tables, passes every joined dataset's `custom` through namespaced, and declares which columns write back. The last one exists for consumers outside the engine.

| Query | One row per | Built from | Writes back | Feeds |
| --- | --- | --- | --- | --- |
| persoon_dag | persoon × plandag × activiteit | Toewijzing ⋈ Activiteit ⋈ Organisatie (locatie resolved up the tree) ⋈ Beschikbaarheid; Attachment flagged for publication | state, call_at, verrekening → Toewijzing | Person calendar and week, call sheet, Publication rows |
| locatie_dag | locatie × plandag × activiteit | Activiteit with resolved locatie | status, start_at, eind_at → Activiteit | Venue calendar; location clashes |
| productie_dag | productie × plandag | Activiteit grouped, counts per soort and open slots | — | Company week across productions; season grid |
| conflicten | one conflict | persoon_dag self-join, Beschikbaarheid, Toewijzing state, locatie_dag, werktijd flags | — | Badge count on rows; the Monday-morning view |
| kandidaten | open slot × candidate | Toewijzing (persoon null) ⋈ Persoon_rol on rol ⋈ Beschikbaarheid, minus conflicten, ranked by voorkeur then tarief | persoon_id → Toewijzing | The "who can fill this" dropdown |
| werklijst | persoon × to-do | Taak (open) UNION derived: open slots inside the horizon, invitations unanswered past the deadline, registrations awaiting approval, activities still optie inside 14 days | status → Taak | One list per person of what needs a decision |
| werktijd | persoon × plandag, and × week | COALESCE(werkelijk, gepland) start and end minus pauze; contract_type; organisation parameters | — | Hours per day and week, rest since previous call, flags |
| dagtelling | persoon × productie × plandag, cumulative | Confirmed Toewijzingen on repetitie, voorstelling, opbouw; a registered day counts without a plan | — | Day count per person per production: dagcontract pay |
| plan_vs_werkelijk | toewijzing | gepland vs werkelijk time and bedrag, delta, registratie_status | registratie_status, werkelijk_*, bedrag_werkelijk → Toewijzing | The planner's approval view |
| verrekening_periode | persoon × maand × verrekening | bedrag_werkelijk where goedgekeurd, else bedrag_gepland; activity soort | — | Payroll and expense export, receipts via Attachment |
| wijzigingen_sinds_publicatie | recipient × row key | persoon_dag EXCEPT last Publication.rows, both directions | — | Send only what changed |
| voorstellingen | confirmed voorstelling | Activiteit (soort voorstelling, status bevestigd) ⋈ Productie ⋈ Organisatie as venue; public columns only | — | Any website's calendar and ICS feed, by REST or view token |

**Conflict types**

| Type | Rule |
| --- | --- |
| overlap | Same persoon, two confirmed Toewijzingen whose activities overlap |
| afwezig | Toewijzing on a day covered by Beschikbaarheid afwezig |
| onzeker | Same, soort onzeker — a warning, not a conflict |
| open_slot | persoon_id null and start inside the warning horizon |
| onbevestigd | state uitgenodigd past the confirmation deadline |
| locatie_dubbel | Two activities on the same resolved locatie, overlapping, from different speelreeksen |
| werktijd | Any werktijd flag: day hours, week hours, daily rest, weekly rest |

**Working-time defaults** for a Flemish company: [PC 304](https://public-search.werk.belgie.be/website-download-service/joint-work-convention/304/304-2016-009950.pdf) sets a 38-hour average week and an 8-hour normal day, averaged over up to a year; the Dutch [CAO Toneel en Dans](https://www.lawinsider.com/nl/contracts/lTQSHsYtf0w) adds an uninterrupted 36-hour weekly rest and a daily rest above 11 hours for dancers. Parameters, not code: another organisation sets its own.

## How it works

A planner's week touches every layer in a fixed order. Each step names what it writes and what it reads.

1. **Plan a block.** Create a Speelreeks under the Productie, locatie set once, and apply a Sjabloon. One batch writes the activities of every day with inherited locatie (and, from step 2, open Toewijzingen per role slot). Revision records the batch under one `batch_id`: one undo, kept in the browser tab's undo history of batch ids and undone on the server.
2. **Fill the slots.** In the Toewijzingen view (table or matrix) the kandidaten dropdown lists who can fill each open slot, available and conflict-free. Assigning sets state to `uitgenodigd` and sends the invite; the person confirms or declines from their signed link, no account needed. Activiteit.status stays about the booking, Toewijzing.state about the person.
3. **Clear conflicts.** conflicten runs on every grid render and badges affected rows. The planner works the Conflicten view to zero on Monday morning.
4. **Publish.** From any view on persoon_dag, Publish for a period renders each recipient's rows (names, call times, custom fields and attachments flagged for publication, the location block from Organisatie), writes a Publication row with those rendered rows, and sends by channel. A venue as recipient gets its block in its own language. The share token also serves the same view as ical and pdf.
5. **Handle change.** Shift the block by a day. Revision logs it; wijzigingen_sinds_publicatie returns, per recipient, the rows that differ from their last snapshot. The next Publish sends only the diff and writes a new snapshot.
6. **Register and approve.** After the day, the person opens their link and confirms or corrects actual times on their own Toewijzingen, adds what they spent with a receipt as Attachment. Unplanned work becomes an activity with `bron = registratie` and a Toewijzing on it. The planner works plan_vs_werkelijk: approve, reject with a note, or edit. From approval on, werktijd, dagtelling and verrekening_periode read actuals; before it, the plan.

**Day line.** A 20:30 show that strikes until 01:00 is one planning day. `plandag` = date of `start_at` shifted by the organisation's day-line hour (default 05:00); an activity without a time is on its own `datum`. Every query groups on `plandag`, never on the calendar date.

**Inheritance.** locatie, custom values and attachments resolve Activiteit → Speelreeks → Productie, first set value wins. The grid shows an inherited value greyed and an own value solid, so the planner sees which rows move with the block.

**Writes through a query.** A cell edited in a view on persoon_dag carries `writes: {dataset: toewijzing, field: state, key: toewijzing_id}`; the grid sends `PATCH rows/toewijzing/{row[key]}` and the engine routes it to the theatre package's Toewijzing writer, which applies its refuse rules. The query never writes; the writer always does. The returned row and the undo key refer to the target record, not the grid row.

## Principles and build order

Seven rules decide every design question. Everything above follows from them.

1. **Shapes in the engine, names in the domain.** The engine never learns a domain word; a second domain runs with zero engine changes.
2. **Datasets, queries, views.** Tables with rows; SQL views over them that store nothing; saved views over either.
3. **Slot first, person later.** A Toewijzing is a role on an activity; the person is filled in when known.
4. **Inherit down the tree.** Location, attachments and custom values set on a parent apply to children unless overridden.
5. **Plan and actual on one row.** No timesheet or expense table; the difference is a query; downstream numbers read the actual when it exists.
6. **Publish snapshots, not pointers.** Rendered rows with names, per recipient; the diff is current minus last snapshot.
7. **JSON plus registry for custom fields.** Real columns stay real; one `custom` JSON per table, declared in Field, passed through queries.

**Build order.** Each step is usable on its own and the next depends on it.

| Step | Scope | Changes the planner's day by |
| --- | --- | --- |
| 0. Engine service | TypeScript service on the Folio stack: dataset and query declarations, migrations from them, the four shapes, two of the five generic tables (SavedView and Revision; Attachment and Publication come with step 4, Field with step 5), the four actors, REST for rows, schema and writes (3–5 days); the React grid copied from ntdst-baseline's views app (TypeScript and React only, no PHP) and pointed at that REST, including `writes:` on columns (2–3 days); the theatre package at parity with Laika today, meaning Productie, Persoon, Organisatie, Activiteit, Toewijzing without slots and Beschikbaarheid, plus the voorstellingen view, with the writers' three rules (1–2 days); a generic import command that reads JSON (half a day), with the exporter that writes it living in the private Laika repo (half a day); the browser e2e harness and the step 0 gate (1 day); the WordPress view block in atelier (half a day); baseline drops its views module | Nothing visible beyond what runs today, now on the engine. 9–13 days, none of them inside WordPress |
| 1. Speelreeks + Sjabloon + Rol | The grouping level and the bundle | Four days of logistics in one apply |
| 2. Toewijzing slot-first + Beschikbaarheid + Persoon_rol | persoon nullable (today refused by person_or_name), rol_id on Toewijzing (absent today), state, plan-side cost, soort on availability, rates per role; the matrix open column needs both; the lifecycle on Toewijzing.state and the record token behind the invite link (1–2 days) | Kandidaten dropdown; conflicts become possible |
| 3. Queries + views on queries | persoon_dag, locatie_dag, productie_dag, conflicten, kandidaten, Taak + werklijst; `source_type = query` | The Conflicten view, the person calendar, the company week |
| 4. Publication + Attachment | Snapshot, send, diff; riders and venue sheets on the call sheet; ical and pdf | Replaces the weekly spreadsheet export |
| 5. Field | Custom fields through queries and onto call sheets | Dietary on the catering count without a developer |
| 6. Registration | Actual-side columns, the person's confirm-and-correct page, receipts, plan_vs_werkelijk | Hours and expenses come back from the people, approved in one view |
| 7. werktijd + dagtelling + verrekening_periode | Rules per organisation; payroll and expense export | Monthly settlement from the same rows |

Step 0 is 9–13 days of foundation and the only step with no new visible result. Unlike the earlier WordPress-internal version of this step, every one of those days produces engine code that every later domain uses.

## Scope lock

This is what gets built. Anything not in the "in" column is out until this document changes, and a change to it is a decision, not a drift.

| In (v1) | Out (named so nobody re-opens it) |
| --- | --- |
| Standalone engine service with the four shapes, five generic tables, four actors, its own database and REST; skins table, calendar, matrix and list; lifecycle and record token (built in step 2) | Admin-created datasets; public create and the board skin until a domain needs them (specified above, not built) |
| One-off JSON export from the private Laika repo and a generic import command; the private CPTs and the baseline views module deleted afterwards | Any engine code inside WordPress; any sync from the website into the engine; multi-tenant hosting |
| Theatre domain: 3 reference, 6 core, 2 config datasets, 12 queries, 7 conflict types | Resources (vehicles, equipment, inventory) |
| voorstellingen query for websites; a WordPress shortcode and YOOtheme element that render a public view by a site-side name | Run-of-show, cueing, minute-level blocks |
| Publication with person and organisation recipients, language, html/ical/pdf | Child spaces of a venue (zaal, foyer) |
| Plan and actual on Toewijzing, approval, receipts as Attachment | Hour balance and overtime owed (urensaldo) |
| Working-time parameters per organisation, defaults for PC 304 | Production-skeleton templates anchored to a première |
| Signed person links; optional engine account per person | Leave-request approval on Beschikbaarheid |

**Acceptance per build step.** Each step is done when its gate passes in a real browser (netdust-gates), not when the code exists. The gates run in worktable's own browser e2e harness, built in step 0 (one day, counted there); each later gate is about a day of e2e work inside its step; step 6 also needs a signed-link actor in the harness.

| Step | Done when |
| --- | --- |
| 0. Engine extracted | Laika's existing Planning, Toewijzingen and Afwezigheden views, redeclared in the theatre package, show the same rows and accept the same edits as today, on the imported data; a Doorverwijsgids fiche dataset declared as a second package renders in the same grid with zero engine changes; the website's performance calendar reads voorstellingen |
| 1. Speelreeks + Sjabloon + Rol | Applying "speeldag op locatie" to a four-day Speelreeks produces the Calais day pattern's rows on every day, with the inherited venue, in one batch; one undo removes them |
| 2. Slot-first + Beschikbaarheid + Persoon_rol | An open slot shows a kandidaten list that excludes anyone afwezig or already assigned; assigning sends an invite; the invite link confirms without login; a transition the declared lifecycle does not allow is refused, and two simultaneous confirmations of one slot give one success and one conflict |
| 3. Queries + views on queries | A planner saves a SavedView on persoon_dag, edits `state` in it, and the write lands in Toewijzing through `refuse()`; the Conflicten view lists all seven types from seeded data |
| 4. Publication + Attachment | Publishing a week to a person writes a snapshot; shifting the block and republishing sends only the diff; a venue receives its block in French; the ical feed updates |
| 5. Field | An admin adds `dieet` on Persoon without a developer; it appears in a persoon_dag view and on the call sheet |
| 6. Registration | A person corrects their hours and uploads a receipt from the link; the planner approves in plan_vs_werkelijk; werktijd switches to actuals for that row |
| 7. Settlement | verrekening_periode exports a month per person with receipts; dagtelling matches a hand count on the Glimworm data |

## Open decisions

Settled in this document, so they do not reopen:

- The engine is a standalone TypeScript service with its own database; WordPress is a REST client and holds no engine code.
- Day line: an organisation parameter, default 05:00.
- Conflicts are badges everywhere, `locatie_dubbel` included; nothing blocks a save except a writer's refuse.
- Invites and actions go by email carrying a signed link; no app, no account.
- The matrix skin's first use is Toewijzing scoped to one Speelreeks: people across, activities down.
- The engine and its domain packages live in one new repo named `worktable`; the earlier markdown-records repo of that name is renamed `worktable-v0` and archived. Folio stays what it is and may later be a client of the engine.
- No Performance in the engine; websites read the `voorstellingen` query.
- Lifecycles, record tokens, public create, owner columns and the board skin are engine shapes, added after a paper test of cargovelo-core against this spec. A `cargo` package for cargovelo-core is a candidate third domain and is not built in v1. Lifecycle and record token are built in step 2; public create and the board skin when a domain first needs them.
- Engine names are English (Field, SavedView, Revision, Publication, Attachment; skins table, calendar, matrix, list, board); the theatre package keeps Dutch names; UI labels are localised.
- This file, `docs/SPEC.md` in the worktable repo, is the spec of record; the Claude Doc it was written in is a snapshot.
- One engine instance per client, one database file each; multi-tenant hosting is out.
- Child spaces, resources, run-of-show: out, see Scope lock.
- Laika's core team get engine accounts with the editor role (step 0e); signed person links for owners come with step 2.
