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
