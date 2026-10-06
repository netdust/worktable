# Review: step 1, Speelreeks + Sjabloon + Rol

Branch `feature/step-1`, range 091e875..026f6f5. Executed subagent-driven on 2026-10-06 and 2026-10-07: Tasks 0–6 of `specs/step-1/plan.md`, each with its own review. Then two reviews of the whole branch: one by a fresh reviewer on the most capable model, one by `security-sentinel` against the plan's threat model. After those came one fix wave and one scoped re-review. Task 7 uses real data and is Stefan's; the commands are in `specs/step-1/task-7.md`.

## Verdicts
- **Whole-branch review:** ready after fixes, with 2 Important findings.
- **Security:** no IDOR, scope bypass or privilege escalation, 2 Medium findings, 3 Low.
- **Re-review of the fix wave:** every finding addressed, with no new Critical or Important breakage.

## Fixed in the fix wave (ab6f80b, 02053fc, 5426abb, 7f9bc31, 026f6f5)
- **M1. Undoing a create could delete another account's later edit.** An undo now refuses with 409 `changed_since`, naming the column, when a column the create left empty now holds a value. This is a state check rather than a count of revisions, so create → edit → undo → undo still works.
- **M2. Any editor could raise the cap on how much one apply creates.** `organisatie.parameters` is now writable by administrators only. The cap has a hard ceiling of 366 days, a Sjabloon holds at most 50 items, and `offset_dag` is at most 366.
- **L1. A huge `offset_dag` gave a 500.** It now gets a Dutch refusal.
- **L2. Missing denial tests.** Added: an owner undoing on a record now outside its scope gets 404, and a demoted administrator undoing a rate change gets 403.
- **L3.** The undo route is now in the cross-site write-guard tests.
- **I1. One refused undo jammed the tab's undo history for good.** The entry is now dropped on any refusal except `in_use`.
- **I2.** `in_use` on an undo now shows the Dutch sentence.
- **Minor fixes:**
  - The span check runs only when dates or productie change.
  - The action notice's Undo acts only while the action is the newest step.
  - The e2e flow awaits the Locatie PATCH.
  - The spec and plan doc lines are updated.
  - The edit-session script skips datasets with no rows and undoes by batch. It is code only and was not run.

## Gate
`bun run gate` was green 3 of 3 times after the fix wave: bun 945, grid 601, Playwright 49. The step 1 flows in `e2e/step-1.spec.ts` are:
- `apply-template`: 28 rows on 4 days at the template's times, Overnachting untimed, the venue inherited; one Ctrl+Z removes all 28, a reload confirms it, and all 28 share the action's batch;
- `apply-twice`;
- `speelreeks-delete-in-use`;
- `speelreeks-end-before-start`;
- `undo-changed-since`, with two browser contexts.

## Rulings made by the executor
1. Stefan's addition (1), the two undo tests, lives in Task 4, where the theatre writers exist. Cost if wrong: none.
2. The Speelreeks cap reads `parameters.max_speelreeks_dagen` of the productie's organisation when that is the own organisation, else 31, because a writer cannot look up the own organisation. Cost if wrong: a productie owned by a partner always gets 31, and a direct lookup needs one engine query in context later.
3. The rate rule refuses an editor who *changes* a rate, not one who resends the stored value, because undo, redo and full-row writes resend values. Cost if wrong: harmless.
4. The matrix keeps its own client-side undo in step 1. It re-creates deleted join records, and undoing a delete is out of scope. Cost if wrong: two undo mechanisms until a later step.
5. The grid's history drops an entry on any refusal except `in_use`. The plan's "keeps the entry" wedged the tab. Cost if wrong: a transport failure (code `unknown`) also drops the step. The re-reviewer recommends keeping it on `unknown`; this is open for Stefan.
6. The M2 limits (366 days, 50 items, `offset_dag` 366) are invented. Cost if wrong: a value to change.
7. The edit-session script change from Task 7 landed in the fix wave as code only. Cost if wrong: none.

## Deferred minors (not fixed)
- The cap is reached only through the productie's organisation (ruling 2).
- Rol `categorie` has no Dutch required message.
- The seeded Rol test calls the writer directly.
- `restore` duplicates `storedOf`.
- Saved-view revisions record no batch row. Views are not undoable, which is the intended reading.
- No test covers a batch key generated before a no-op return.
- `/schema` lists actions an owner cannot complete; an owner cannot see the Speelreeks dataset in step 1.
- An unknown action and an unseen source give different codes (`unknown_action` vs `unknown_source`).
- `ActionDecl.run` gets an unscoped `ctx.find`. Its docs should warn about that.
- An action that creates nothing records an empty batch.
- `ACTION_NAME` duplicates `IDENTIFIER`.
- There is no month-end apply test. The arithmetic is UTC and correct.
- An undo refusal shows under the English "Not saved:" prefix.
- A repaint can flicker over an edit still in flight.
- `StoreApi.undo` and `noUndo` remain only for stores without a shared history.
- After `changed_since`, the cell keeps its local value until a reload.
- Redo after undoing an apply is offered, then refused with 422.
- The Sjablonen view shows `items` as a count.
- The step 1 gate does not check `soort` or `eind_at` of the 28 rows; the integration tier covers them.
- An echoed `parameters` object with its keys in another order counts as a change.
- `checkSpan` assumes the client sends only the fields that changed.
- `custom` JSON is not part of the M1 check. It is not writable through REST in step 1.
- A transport failure drops an undo step (ruling 5).
- Task 5 was not strictly test-first. Its new store, history, Drawer and App tests were never seen failing.

## For Stefan
- **Approve or change the invented values:**
  - the M2 limits;
  - the Speelreeks statuses (optie · bevestigd · geannuleerd);
  - `locatie_regel` = `speelreeks`;
  - `kleur` as `#rrggbb`;
  - the seeded "Rollen" and "Sjablonen" views, and the 4 Rol rows;
  - three Dutch strings: "Dit kan niet ongedaan gemaakt worden.", "{label}: dit record is intussen verwijderd; ongedaan maken kan niet.", "{action}: gedaan.".
- **On the migrated real database** (seeds only reach a fresh database):
  - there are no Speelreeksen, Rollen or Sjablonen views and no Sjabloon;
  - the existing Dagplanning view does not show the new location columns;
  - no planner can apply a template there until one is seeded or imported.
- After an action or a cross-view undo, the view reloads: the drawer closes and the spinner shows.
- Not decided by the spec:
  - an activity's Speelreeks may belong to another productie;
  - applying to a cancelled Speelreeks is allowed.
- The greyed display of an inherited value needs a declared engine hint. It is a finding and was not built.
