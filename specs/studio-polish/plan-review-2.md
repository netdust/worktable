# Plan review (round 2): studio-polish
Reviewed-plan: 8bdc22e97774e34fd1f3639ab1d02fbaca38075d specs/studio-polish/plan.md

The blob sha matches the file on disk. Main is at d1d3613. All three Blocking findings from round 1 are fixed in source. The rewrite adds one new Blocking finding: R17 has no data to work from.

## Blocking

**B1. R17's grid hooks have nothing to read. The grid cannot tell that a lifecycle column has button transitions.**
- **Plan:** Ruling R17 (line 37) and the Files rows (lines 112-113: `columns.ts`, `ui/App.tsx:680`) hide the inline select and the drag "on a lifecycle column with buttons". Task 2's test (line 172) and the first working version (line 94) depend on this.
- **Source:** `/schema` serves a lifecycle as `{ column, live }` only (`packages/engine/src/app.ts:307-309`). The grid keeps only `lifecycle: column` and `live` (`apps/grid/src/engine.ts:85, 216-217`; `types.ts:99-101`). Nothing served says whether a transition declares `button`.
- **Why per-row data does not work:** `available` is present when any action has a `when`, too (`available.ts:29-33`). Its `buttons` is empty in a terminal state or on an empty table. So the grid cannot infer the fact from rows.
- **The gap:** Task 1's Interfaces (lines 136-143) list every other served shape but not this one. It is the same kind of gap as round 1's B2.
- **Smallest change:** in Task 1, serve the fact. Two ways:
  - Serve `lifecycle.buttons: true` when any transition declares `button`, at `app.ts:307-309`. Add it to the Interfaces, `types.ts` and `engine.ts` (e.g. `Model.lifecycle_buttons`), with one `/schema` test.
  - Or serve that column `readonly: true` in `servedColumn`, as `written_by` already does. Then `columns.ts:179` and `App.tsx:680` need no new code, the same as round 1's N1.

## Should fix

**S1. The import and seed-missing do not call `answeredOf`; they call `valuesOf`.**
- **Plan:** lines 13, 30, 104 and 134 say they "call `answeredOf` with `{ trusted: true }`".
- **Source:** `answeredOf` is private (`writes.ts:599`). Both callers reach it through the exported `valuesOf`: `import.ts:163` and `seed-missing.ts:57`, via `writes.ts:582-591`.
- **Why it is not Blocking:** the design holds; it needs one more parameter.
- **Change:** give `valuesOf` the `options` parameter and have it pass it on to `answeredOf`. Name both in the Interfaces and the writes.ts row. Note that `restore` also calls `valuesOf` (`writes.ts:859`) and must not pass it.

**S2. Threat 2 (line 52) names a path that does not exist and a check that does not apply to it.**
- **Plan:** "an undo of a delete → the same check in answeredOf's create path".
- **Source:** an undo of a delete is refused before any write: `touchedBy` throws on a `deleted_at` revision (`writes.ts:799-804`). `restore` never takes the create path; it calls `valuesOf(…'update'…)` or `writer.delete` (`writes.ts:853-859`).
- **Change:** say "an undo of a delete is refused 422 (`writes.ts:804`); undo never creates". Security-sentinel will read this line.

**S3. A fifth existing ownership test turns red and is not named.**
- **Plan:** Task 2 declares every onderhoud column `written_by: 'service'` (line 162) and names `ownership.test.ts:68, 102, 124, 168` (line 180).
- **Source:** `packages/studio/test/ownership.test.ts:163` loops over `[admin, worker]` and expects `LOG_FIXED` with code `forbidden` (`:41-46`). The admin's `PATCH /rows/onderhoud/:id { samenvatting }` will now get the engine's 403 `service_only` instead.
- **Change:** add line 163 (the admin pass only) to the list. The worker pass still gets `LOG_FIXED` from the writer.

**S4. Ruling R10 (line 39) still leaves the round-1 N3 question open, and as written it contradicts spec R10.**
- **Plan:** "one pill per toned option present, worst tone first, at most two".
- **Source:** "toned option" also covers `ok`, `sky`, `amber` and the rest (`declare.ts:24`).
- **The contradiction:** theatre's Toewijzing has two `bad` options (`geweigerd`, `geannuleerd`) and one `warn` (`uitgenodigd`) (`packages/theatre/src/datasets.ts:268`). When all three are present, the ruling shows two red pills and drops Uitgenodigd, today's pill. The spec says "Both show when both are present" (spec line 42).
- **Change:** rule one pill per tone, `bad` then `warn`, and say which option or count each pill shows when a tone has several options. Test (line 195) the Toewijzing case.

## Note

- **N1. `sums()` cannot see `footer`.** It takes grid `Column`s (`group.ts:160`), and `Column` has no `footer` (`grid/columns.ts:9-47`). `fieldColumn` (`columns.ts:174-185`) must copy it, so add R5 to the `columns.ts` row (line 113). Also say "integer or real" for "number columns" (line 109): the engine has no `number` type (`declare.ts:27`).
- **N2. "Extend `selection-domain.ts` with each shape" (line 123) can break green tests.** This fixture backs `drawer-actions.test.ts`, `selection-actions.test.ts` and the selection e2e instance (`e2e/drawer-actions.spec.ts`, `e2e/selection.spec.ts`). A `created_by` or `written_by` on an existing dataset would turn those red. Add new datasets and columns only, or use a fixture of their own.
- **N3. Onderhoud's "every column `written_by`" (line 162) goes beyond R16**, which lists only `created_by` for onderhoud. It fixes round 1's N5, but unlike R17 it is not recorded as a ruling. Record it in the Rulings, so Stefan sees it.
- **N4. One more refused control stays: Verwijderen in a site's and an onderhoud's drawer.**
  - `deletable` follows from the writer having a `delete` (`app.ts:322`; `Grid.tsx:404`), and both writers refuse a person (`writers/site.ts:56-58`, `writers/onderhoud.ts:19-21`).
  - The shake-out lists it (`specs/studio-domain/shakeout.md:62`).
  - It is outside R1–R17; Stefan rules whether it waits.
- **N5. Two homes in the Test map are thin.**
  - `seed.test.ts:117-120` (line 181) is a `/schema` test, so "assert there is no create control" can only mean asserting `created_by: 'service'` on site and onderhoud. Say so; its `new_label` assertion otherwise stays green and stale.
  - Row 4's `tick-on-a-query-view` (line 68) has no file or `--grep` command.
- **N6. R12's candidates (line 205) can be named now.**
  - `step-1.spec.ts:194`, `step-2.spec.ts:208` and `ui-fit.spec.ts:414` find the action by `getByRole('group', …)`. `action-inputs.spec.ts:276-277` measures the alert against the action's own button.
  - All four look like they stay green after the move.

## Round-1 findings, checked in source
- **B1:** the trusted flag gives import and seed-missing a way past the check; `answeredOf` covers REST (`app.ts:57,69` → `runWrite` → `applyWrite`), `createAs` (`writes.ts:489-491`), `updateAs` (`actions.ts:129-133`), the action token (`action-token.ts:182`) and undo (`writes.ts:859`) → resolved, apart from the naming slip in S1.
- **B2:** `available.ts` is in the Files table, `buttonsOf` (`available.ts:35-45`) emits `primary`, and it is typed as `Available.buttons[].primary` → resolved.
- **B3:** both refusal sites are named: `remove` (`attachments.ts:298-305`) and `undoAttachments` (`:406-431`). These are the only `setDeleted` callers (`:305`, `:431`) → resolved.
- **S2:** `ENGINE_CODES` (`i18n.ts:433-438`) gets `service_only` → resolved. The named tests exist at the lines given: `ownership.test.ts:68,102,124,168`, `seed.test.ts:117-120`, `e2e/studio.spec.ts:414-444, 543-566`, `CHECKS.md:202,205`.
- **S3:** `Dashboard.tsx:96` and `Composer.tsx:153` are covered, and so is the board "+" at `App.tsx:681` → resolved.
- **S4:** `sums()` (`group.ts:160`) feeds the foot (`Grid.tsx:393`), the bands (`GridBody.tsx:100`) and the Excel total (`xlsx.ts:81`) → resolved (see N1).
- **S5:** `Links.tsx:38-49` is covered → resolved.
- **S6:** the code stays `unknown` (`api.ts:30`, `:157`) → resolved.
- **S1 test lines hold:**
  - R8: `useLiveHost.test.tsx:39,44`; `drawer-actions.spec.ts:89,95,151`; `studio.spec.ts:205`.
  - R10: `insight.test.ts:15-21`.
  - R13: `api.test.ts:85-87`.
  - R14: `App.test.tsx:1649-1655`.
- **R17 hooks:** `columns.ts:179` and `App.tsx:680` exist and honour `readonly` → the hooks hold, but they get no data (B1).
- **New validation pairs:**
  - Each has a natural home: `checkOwnerWritable` (`validate.ts:204`), `checkLifecycle` (`:483`), `checkWrites` (`:357`) and `checkCreates` (`:148`).
  - Studio's own declarations trip none of them. Actie's status is not `written_by`, and onderhoud has no lifecycle.
- **Theatre and fiche declare no `button`:** confirmed by grep, so the cost in R17's ruling holds.

## Verdict
**not ready.** B1 is one served field in Task 1. Fix it, and fix S1–S4 (a few lines of plan each), and the plan is ready.
