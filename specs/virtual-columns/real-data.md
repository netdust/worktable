# Real data: one Planning on the copy

Stefan's commands for `~/laika-export/step2-copy.db`, after `feature/virtual-columns` is merged. Run from the repo root on the merged code. No agent runs these.

1. Stop the engine on :4341 (the grid on :5181 may keep running).

   ```sh
   kill "$(lsof -ti tcp:4341)"
   ```

2. Back up the copy, readable by you only.

   ```sh
   cp ~/laika-export/step2-copy.db ~/laika-export/step2-copy.db.before-one-planning
   chmod 600 ~/laika-export/step2-copy.db.before-one-planning
   ```

3. Seed what is missing.

   ```sh
   bun packages/engine/src/serve.ts --domain @worktable/theatre --db ~/laika-export/step2-copy.db --seed-missing
   ```

4. Read its view lines. Expected on a copy seeded from main (d834274), after the dataset lines and in this order:

   ```
   seed-missing: view "Planning" (activiteit) updated
   seed-missing: view "Per productie per dag" (productie_dag) removed, no longer declared
   seed-missing: view "Dagplanning" (dagplanning) removed, no longer declared
   seed-missing: view "Optie of bevestigd" (activiteit) removed, no longer declared
   seed-missing: view "<name>" (dagplanning) has no source any more, left alone
   seed-missing: views 0 added, 1 updated, 11 present
   ```

   - Planning is updated in place: it keeps its id and takes Dagplanning's week filter, sort, day groups and columns (Locatie through the tourstop, Mensen).
   - Dagplanning, "Per productie per dag" and "Optie of bevestigd" are system views no seed declares any more, so they are removed.
   - One `has no source any more` line per person's own view on the old Dagplanning, named. It is kept in the database, untouched, but no list shows it while its source is gone; they remake it on Activiteiten. A person's own view on `productie_dag` or on Activiteiten is not named: its source still exists.
   - "Per productie per dag" (`productie_dag`) still sits under Overzichten in the rail, with no view until someone makes one.
   - If a removed view was published, its line reads `view "<name>" (...) is public, left alone` instead and it stays. A published view on dagplanning answers 404 after the run: its source is gone.

   On a database whose system Planning was on dagplanning instead, the line is `view "Planning" (dagplanning) removed, no longer declared` plus `views 1 added`: Planning on activiteit is a new view with a new id, so a bookmark to the old Planning's id no longer opens it.

5. Start :4341 again on the new code.

   ```sh
   bun packages/engine/src/serve.ts --domain @worktable/theatre --db ~/laika-export/step2-copy.db --port 4341 --link-secret-file ~/laika-export/step2-link-secret --outbox ~/laika-export/step2-outbox --app-url http://127.0.0.1:5181
   ```

To go back: stop :4341, copy `step2-copy.db.before-one-planning` over `step2-copy.db`, start :4341 on the old code.
