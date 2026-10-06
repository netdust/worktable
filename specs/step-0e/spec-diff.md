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

**Datasets and Queries rows** gain: "may declare `owners: { owner: <column> }`, where the column is `id` or a relation column; an owner account reads and writes only rows whose owner column is its subject, and a source without one does not exist for it (404)".

## U2, the system owner and the public view route

**Saved views row** gains: "A seeded view is owned by the system owner `-1` (no account id is ever ≤ 0): read-only to everyone (PATCH, DELETE and restore answer 403 `read_only_view`), copied by a plain `POST /views`. At startup a view still owned by `0` moves to `-1` when its `(name, source)` matches a domain seed, else to the lowest administrator id; with no administrator it stays and startup logs the count. Each move is revised with actor `-1`."

**Publication row** gains: "An administrator publishes a view on a query with `PUT /views/:id/share-token`, which sets `public` and stores sha256 of a new 32-byte token, answering the token once; a second PUT rotates it and `DELETE` clears both. A view whose `visible_fields` holds the source's owner column is refused (400 `owner_column_visible`); a dataset view is 400 `not_query`. While a view is public only an administrator may change it (403 `public_view`). `GET /public/views/:token` needs no session, takes only `from` and `to`, applies the stored filters and sort, and answers `{ columns, rows, total }`, each row projected to `visible_fields` and never the owner column; 60 calls per client address per minute, failing closed; no CORS header."

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
