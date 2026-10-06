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
