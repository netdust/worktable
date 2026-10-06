# Step 0e: proposed `docs/SPEC.md` lines

Collected per plan, proposed at the end of 0e and committed only after Stefan sees the diff.

## U1, the migrator

**Storage table, a new row after "Datasets":**

| Migrations | Each dataset's DDL is recorded with its hash in `_migrations`. A changed hash is migrated: a new nullable or defaulted column and index changes by `ALTER`, anything else by SQLite's table rebuild, in one transaction with foreign keys off and `foreign_key_check` before commit. Ids and `sqlite_sequence` survive, Revision is never touched, and every query view is recreated after a change. Changes that would lose data are refused before anything is written, naming the dataset and column: a new NOT NULL column without a default on a table with rows, a lossy retype on a table with rows, and NOT NULL over a stored NULL. Before any rebuild, the database is copied to `<db>.pre-migrate`. | A declaration change never needs a hand-made schema, and a mistake costs one file copy back |

**Queries row:** "a changed hash drops and recreates the view" gains: "and every view is recreated after any dataset change".

**"What was in WordPress" row:** the clause "the table-rebuild migrator (ALTER and SQLite's table rebuild) exists before the first real import" becomes "the table-rebuild migrator (built in step 0e) runs every declaration change, including the import's `legacy_post_id`".

## U3, the vocabulary check

**Package layout paragraph**, after "A lint check in the gate fails any import of a domain package (`theatre`, `fiche`) from inside `engine`":
"A second check fails any domain word anywhere in `packages/engine`, in code, comments and tests. Its word list is built from the domain packages' dataset, query and column names, plus a fixed list of the spec's domain nouns. A committed allowlist, one word per line with its reason, names the generic English words a domain also uses (`status`, `type` …)."

## U2, access and owner scope

**Writer row:** "checked before the writer's own delete" becomes "checked after the writer's own delete, which may refuse by role (403 `forbidden`) first; the writer's delete runs inside the write's transaction, so a 409 rolls back whatever it wrote". The engine's owner-scope check runs before both.

**Datasets and Queries rows** gain: "may declare `owners: { owner: <column> }`, where the column is `id` or a relation column; an owner account reads and writes only rows whose owner column is its subject, and a source without one does not exist for it (404). Rows are scoped; lookups and titles through a relation are not: an owner reads the titles of the rows its own rows point at, never those rows themselves".

**Datasets and Queries rows** also gain: "A domain may not name a dataset or query after an engine table (`saved_view`, `revision`, `_migrations`, `account`, `magic_link`, `auth_session`, `rate_limit`); validation refuses it before anything is written. The list is the engine's own table declarations."

## U2, the system owner and the public view route

**Saved views row** gains: "A seeded view is owned by the system owner `-1` (no account id is ever ≤ 0): read-only to everyone (PATCH, DELETE and restore answer 403 `read_only_view`), copied by a plain `POST /views`. At startup a view still owned by `0` moves to `-1` when its `(name, source)` matches a domain seed, else to the lowest administrator id; with no administrator it stays and startup logs the count. Each move is revised with actor `-1`."

**Publication row** gains: "An administrator publishes a view on a query with `PUT /views/:id/share-token`, which sets `public` and stores sha256 of a new 32-byte token, answering the token once; a second PUT rotates it and `DELETE` clears both. A view whose `visible_fields` holds the source's owner column is refused (400 `owner_column_visible`); a dataset view is 400 `not_query`. Deleting a public view revokes it: `public` and the token are cleared with the delete, so a restored view is private and its old link answers 404. While a view is public only an administrator may change it (403 `public_view`). `GET /public/views/:token` needs no session, takes only `from` and `to`, applies the stored filters and sort, and answers `{ columns, rows, total }`, each row projected to `visible_fields` and never the owner column; 60 calls per client address per minute, failing closed; no CORS header."

## U2, accounts and access

**Access paragraph:** "Four actors, no domain words. Planners and administrators are engine accounts that sign in by magic link and hold engine capabilities; owners and recipients act through signed links and need no account." becomes "Four actors, no domain words. Administrators, editors and owners are engine accounts that sign in by magic link and hold one of three engine roles; recipients act through signed links and need no account. Signed person links for owners stay step 2."

**Actors table:** the Planner row becomes Editor, and the capabilities `views_admin` and `views_plan` give way to a role table:

| Actor | Mechanism | May |
| --- | --- | --- |
| Administrator | engine account with role `administrator` | Everything: Field, publish a query view with a share token, change a public view, and what writers reserve to administrators |
| Editor | engine account with role `editor` | Read and write every dataset and query that a writer does not restrict; own SavedView rows only; no publishing |
| Owner | engine account with role `owner`, linked to a row by `(subject_dataset, subject_id)` on the engine's own account table | Read only rows whose owner column is its subject, and see only the sources that declare one (any other source is 404); write only what the source's writer allows, scoped to its own rows; no SavedView writes (403 `forbidden`) |

Laika's core team become editors. An owner account with no subject sees nothing. An owner column given any value other than the subject is 403 `forbidden`, on create and on update. Every request re-reads the account, so a changed role or a disabled account takes effect at once. The engine knows roles only as this table; who may write which dataset stays in domain writers.

**Sign-in, a new paragraph after the Access paragraph:** "Sign-in is a magic link: `<app-url>/#/auth/<token>`, the token in the URL fragment so it never reaches a log or a scanner's GET. The grid's confirm page shows one button, which POSTs `{ token }`; consume is a guarded write, single-use, valid 15 minutes. A request for a link answers the same `200 { ok: true }` whatever the email, and delivery happens after the response. Link tokens and session ids are stored only as sha256. Every sign-in mints a new session id (30 days; cookie `wt_session`, `HttpOnly; SameSite=Lax`). Rate limits: link requests 5 per email and 20 per client address per 15 minutes, consume 20 per client address per 15 minutes, answering 429 `rate_limited`; proxy headers are never trusted. In 0e accounts are managed by the engine CLI (`--create-admin`, `--create-account <email> --role <r> [--subject <dataset>:<id>]`, `--disable-account <email>`); there are no account routes. With no mailer, a link goes only to a development outbox (`--outbox <dir>`) and a non-loopback `--hostname` is refused at startup. Real mail delivery, `Secure` cookies and a trusted proxy are the cutover's."

**Scoping paragraph:** "a dataset or query names an owner column per actor role" becomes "a dataset or query names an owner column for the owner role", and "the owner link itself only reads" is dropped until step 2 brings signed person links.

## U2, the theatre domain

**Theatre writers gain:** "An owner account writes only its own Beschikbaarheid (its Persoon is the owner column); every other write by an owner is refused with 403 `forbidden`, and a refused Persoon delete by an owner carries no in-use counts."

## U4, the import format and the parity rule

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

**Parity rule:** `bun run parity <export.json>` imports into a temporary database, signs an administrator in through the engine's own link flow, reads the engine's REST, and compares with `checks`. Its output (`specs/step-0e/parity.md`) holds, per check, pass or fail, the total compared and the number of mismatched keys, plus counts per dataset and the plandag shift: no ids, names or values. The parity gate runs only on the owner's machine and commits counts only.

## U6, the WordPress view shortcode (Stefan, 2026-10-06, after the security audit)

**"WordPress afterwards" row and the package layout paragraph:** "one block that renders a view by its token" becomes "one shortcode and YOOtheme element that render a public view by a site-side name: `[worktable_view view="<name>"]`. The site's configuration maps each name to the view's share token, so a token never reaches post content, revisions or WordPress's REST API, where YOOtheme's stored layout would publish it. The fetch is server-side, cached five minutes per engine, token and window, and stops for a minute when the engine is down or rate-limited."

## Activities without a time (approved by Stefan, 2026-10-06)

**Activiteit row:** the columns become "… omschrijving, datum, start_at (nullable), eind_at (nullable), plandag, …", and the note gains: "`datum` is the calendar day the activity is on; `start_at` empty means it has no time (a meal, a hotel night, a whole day) and the grid shows the day without a time. When `start_at` is set, the writer keeps `datum` equal to its date; an `eind_at` needs a `start_at`."

**Derived columns row:** "`plandag` … computed by the writer from `start_at` and the organisation's day-line hour" becomes "… computed by the writer: from `start_at` and the organisation's day-line hour when the activity has a time, and equal to `datum` when it has none".

**Day line paragraph:** gains "; an activity without a time is on its own `datum`" after the day-line sentence.

**Shows for the website:** "the calendar date (not `plandag` …)" becomes "the calendar date (`datum`, not `plandag` …)", and "time" becomes "time (empty when the show has none)".

**`specs/step-0e/spec.md`, "After the plan review":** the T05:00 rule and the `custom.laika_geen_start` flag are replaced by "An activity with no start exports with `start_at` empty and its `datum`. One with an end but no start drops the end and is listed in the export report under `eind_zonder_start` (Stefan, 2026-10-06)."
