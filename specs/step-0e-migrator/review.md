# Review: step-0e U1, the migrator

Branch `feature/step-0e-migrator`, range ec7206e..10add8b before the fix pass. One fresh reviewer, on the most capable model, read the whole branch on 2026-10-06 after the three tasks passed. The executor wrote no part of this review.

## Verdict: ready with fixes
**Strengths:**
- Refusals are planned before the backup and before any write. The byte comparison really tests that a refused change leaves the file untouched.
- `sqlite_sequence` is restored after a rebuild, and the mutation runs prove the tests catch a broken restore.
- `foreign_keys` is turned off outside the transaction and restored in a `finally`, and a failure rolls back.
- A parent table that another table references survives a rebuild.
- `VACUUM INTO` gives a correct copy under WAL and with a relative path.
- One `columnSpecs` describes a table for both the DDL and the planner.

## Important, each fixed RED→GREEN in 3937a38
- **I1.** A nullable column turned NOT NULL *with a default* was not refused while a stored row held NULL. The rebuild then failed with a raw SQLite error after the backup was written. **Now refused.** Test: "nullable to NOT NULL with a default while a NULL is stored is refused untouched".
- **I2.** A view left over from a removed or renamed query broke every later rebuild of a table it read (the RENAME re-reads every view). **Every view in `sqlite_master` is now dropped before a change, and the declared ones are recreated.** Test: "a view left from a removed query does not break a later rebuild, and is dropped".
- **I3.** `foreign_key_check` ran on every start and over the whole database, so an orphan already stored stopped the server with a false "broken by the migration". **It now runs only when a table changed, and refuses only violations the migration introduced.** Test: "an orphan already stored neither stops a no-op start nor a rebuild".

Gate after the fix pass: 454 package tests, 552 grid tests and 33 e2e flows, all green.

## Minor, deferred
- **M1.** No test rebuilds a table that another table references, and the check for a query view after a rebuild reads SQL, not `GET /rows`. Both work; the reviewer verified them.
- **M2.** ALTER appends new columns after the stamp columns, so a migrated table's column order differs from a fresh one's. Nothing depends on that order.
- **M3.** A refusal now happens before `migrate()` sets `foreign_keys`. `app.ts` sets it ON anyway.

## Declined to judge (reviewer), with the executor's ruling
- **DDL byte-identity:** already verified for all nine tables. It stands.
- **A changed hash with no real difference:** a no-op `alter` that only records the new hash. It stands.
- **Storage-class retypes:** they produce the same DDL and never reach the planner. It stands.
- **`integer`→`real`:** loses precision above 2^53, which is irrelevant at theatre scale. It stands.
- **Dropping a column deletes its data:** by Decision, and `.pre-migrate` covers it. It stands.
- **Identifiers in SQL:** only declared names reach it. It stands.
- **A dataset named `new_<t>`:** theoretical. It stands.
