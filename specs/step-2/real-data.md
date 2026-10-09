# Step 2: commands for Stefan (real data, not run by Claude)

Run these from `~/Sites/worktable` on `feature/step-2`. Everything works on a copy of `~/laika-export/engine.db`; the original is never opened for writing. Output is counts only. Rows with names go to `~/laika-export/shakeout/step2/` (mode 0600). Nothing here is run against real data by the build.

```bash
cd ~/Sites/worktable
mkdir -p ~/laika-export/shakeout/step2 && chmod 700 ~/laika-export/shakeout/step2

# 1. Copy the database
cp ~/laika-export/engine.db ~/laika-export/step2-copy.db && chmod 600 ~/laika-export/step2-copy.db
#    expected: the copy exists, mode 600. Never pass --fresh to any command below.

# 2. Migrate the copy by serving it. Theatre declares record links, so the engine needs a link secret (32+ bytes, mode 0600).
head -c 48 /dev/urandom | base64 > ~/laika-export/step2-link-secret && chmod 600 ~/laika-export/step2-link-secret
bun packages/engine/src/serve.ts --domain @worktable/theatre --db ~/laika-export/step2-copy.db \
  --port 4330 --link-secret-file ~/laika-export/step2-link-secret
#    expected: the migration log; "migrate: copied the database to ~/laika-export/step2-copy.db.pre-migrate before
#    rebuilding" (account is rebuilt: kind, name, token_hash, nullable email); then the server listening on 4330.
#    Stop it with ctrl-c. A refusal names the cause and writes nothing; report it as it stands.
#    Rol_id and aantal reach toewijzing by ALTER; record_link, action_token and saved_view.for_owners are added.

# 3. Seed what is missing (inserts config rows by missing title; needs no secret)
bun packages/engine/src/serve.ts --domain @worktable/theatre --db ~/laika-export/step2-copy.db --seed-missing
#    expected: lines per dataset with counts: the Rol rows and the slotted "speeldag op locatie (met plaatsen)"
#    are added when their titles are absent, and views are added. Run it twice: the second run reports 0 added.
#    The step-1 UNSLOTTED "speeldag op locatie" stays as it is (seed-missing never updates a row); the slotted
#    template is added beside it under its own title, so both are listed under Sjablonen.

# 4. Parity on the real export (counts only; the report goes outside the repo)
bun run parity ~/laika-export/<export>.json --out ~/laika-export/shakeout/step2/parity.md
#    expected: every check "pass" with "0 mismatched keys"; the three views pass; the only informational line is
#    the plandag shift. Any mismatch is reported with its check name; do not edit the export to hide it.

# 5. Value parity against Laika's tables on the migrated copy
bun scripts/shakeout/value-parity.ts --engine ~/laika-export/step2-copy.db --out-dir ~/laika-export/shakeout/step2
#    expected: 0 mismatches in every column; row detail only in value-parity.detail.json (0600).
#    Existing Toewijzingen have rol_id null and aantal 1 after the migration.
```

## Laika's `maybe`

The exporter and the parity rules map Laika's `maybe` to `uitgenodigd` with the note `Laika: maybe`, and step 5 expects that. Mapping it to `voorlopig` instead ("pencilled in, not asked yet") changes the exporter in the private repo and the rules in `scripts/shakeout/value-parity-rules.ts`, and with them the expected parity. It is your ruling; until you make it, `maybe` stays `uitgenodigd`.

Report back the migration result (steps 2 and 3), then parity and value parity (steps 4 and 5), as counts only.
