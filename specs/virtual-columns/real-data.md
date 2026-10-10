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

4. Read its view lines. Expected, on the step-2 shape:
   - `view "Planning" (activiteit) updated`: the system Planning keeps its id and takes Dagplanning's week filter, sort, day groups and columns (Locatie through the tourstop, Mensen).
   - `view "Dagplanning" (dagplanning) removed, no longer declared`.
   - `view "<name>" (dagplanning) has no source any more, left alone`: one line per person's own view on the old Dagplanning. It is kept in the database, untouched, but no list shows it while its source is gone; they remake it on Activiteiten.
   - `view "<name>" (...) is public, left alone`: a published system view; it is never changed.

   On a database whose system Planning was on dagplanning instead, the line is `view "Planning" (dagplanning) removed, no longer declared` plus `views 1 added`: Planning on activiteit is a new view with a new id, so a bookmark to the old Planning's id no longer opens it.

5. Start :4341 again on the new code, with the same flags as before.

   ```sh
   bun packages/engine/src/serve.ts --domain @worktable/theatre --db ~/laika-export/step2-copy.db --port 4341
   ```

To go back: stop :4341, copy `step2-copy.db.before-one-planning` over `step2-copy.db`, start :4341 on the old code.
