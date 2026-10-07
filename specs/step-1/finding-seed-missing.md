# Finding: `--seed-missing`, seeds for an existing database

Stefan, 2026-10-07: "Write a spec finding and then build --seed-missing: an existing database gets the config seeds (Rol, Sjabloon) and the seeded views when their tables are empty, through the writers, idempotent and logged; show me the finding first."

## What is missing today
- `seedDomain` (packages/engine/src/migrate.ts:141) runs only with `--fresh`, which deletes the file first (serve.ts:69).
- It inserts raw rows and skips the writers.
- It inserts **every** seed, the domain's invented demo rows included: organisaties, producties, activiteiten, personen, toewijzingen, beschikbaarheden (packages/theatre/src/seed.ts:157-165).

So a migrated real database has empty `rol` and `sjabloon` tables and none of step 1's seeded views, and no planner can apply a template there. Running today's `seed()` against it would mix invented people and activities into real data. That is why the engine needs a shape that marks which seeds are configuration.

## Smallest design
1. **A dataset declares `config: true`.** Its seed rows are configuration (catalogues and templates), not demo data. This is a new optional `DatasetDecl` key, generic and domain-free. Theatre marks `rol` and `sjabloon`. Validation refuses a config dataset with a relation to a dataset that is not config, so a config seed never points at demo rows.
2. **`serve.ts --seed-missing`** is an operator command. It runs `migrate`, writes what is missing, logs it, and exits 0 without serving, like `--create-admin`. It never deletes or changes an existing row.
   - **Config rows.** For each config dataset whose table holds no rows (deleted ones included), it runs the domain's `seed()` with an `insert` that writes only into those datasets. A dataset that is not config, or a config table with any rows, is skipped.
   - **Through the writers.** Each row goes through `writableOf(…, 'create', actor)`, `valuesOf` and `create`. The actor is the system owner `-1` with the role `administrator`, so admin-only columns such as the Rol rates are accepted. The writer's validation runs, for example `validateItems` on a Sjabloon. Revision is written as for any create, under one batch of a new kind `seed`, which can never be undone (`not_undoable`, like `import`).
   - **Seeded views.** A seeded view whose `(name, source)` has no live view yet is inserted, owned by `-1`, shared and read-only, as `--fresh` does. An existing view with that name and source is left alone.
   - **One transaction.** Any writer refusal rolls everything back, and the command exits 1 naming the dataset and the seed row's position.
   - **Idempotent.** A second run finds the tables filled and the views present, writes nothing, records no batch, and logs only "skipped".
   - **Logged**, per dataset and for the views, counts only. For example: `seed-missing: rol 4 rows`, `seed-missing: sjabloon 1 row`, `seed-missing: persoon skipped (not config)`, `seed-missing: views 3 added, 9 present`.
3. **Tests** (engine fixture domain plus theatre):
   - an existing database gets the config rows and the missing views, and its other tables are byte-identical;
   - the rows went through the writer: a fixture writer that refuses a seed row makes the command exit 1 with nothing written;
   - Revision holds one `seed` batch, and undoing it gets 422;
   - a second run writes nothing;
   - a config table with one row is skipped;
   - a demo dataset is never seeded;
   - validation refuses a config dataset whose relation points at a dataset that is not config.

## Open, for Stefan
- **Dagplanning on the real database stays as it was.** The view exists, so `--seed-missing` leaves it alone, and it will not show the step-1 columns `locatie_id` and `locatie_bron`. Options:
  - **(a)** Leave it. Add the two columns in the grid, which, as a seeded read-only view, means copying it.
  - **(b)** Let `--seed-missing` also bring a view owned by `-1` up to its current declaration. Nobody else can change those views, so nothing a person did is overwritten.

  I recommend (b), logged as `views 1 updated`. It is not built until you say so.
- **The `docs/SPEC.md` line** (with the rest of step 1's diff): Datasets row: "may declare `config: true`: its seeds are configuration, written into an existing database by `--seed-missing` when its table is empty, through its writer, under a `seed` batch that cannot be undone".

Approved by Stefan 2026-10-07 with option (b)

## After the review (Stefan, 2026-10-07)
- A system-owned seeded view that is public is left alone and named in the log; publishing it was a person's act.
- Every system view `--seed-missing` updates is named in the log.
- Only a live view with the seeded name and source that is system-owned or shared counts as present; a user's private view no longer blocks the seeded view, and stays untouched.
- Undo checks the batch's owner first, exempting only the system owner, so another account's import batch answers 403 and a seed batch 422.
- Config seeds between config datasets refer by natural key (the target's title), in the proposed `docs/SPEC.md` lines; not built while no config dataset relates to another.
