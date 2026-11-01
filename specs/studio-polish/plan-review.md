# Plan review (round 3): studio-polish
Reviewed-plan: bf3cd9438a6ec799707054db2bfa5e28ca43095a specs/studio-polish/plan.md

The blob sha matches the file on disk, and main is at d1d3613. Round 2's B1 and S1–S4 are resolved in source. N1–N6 are applied. The one new piece of design, R18 (`deletable: false`), brings three Should-fix findings. All three are in the engine's delete path. Nothing is Blocking.

## Blocking
None.

## Should fix

**S1. R18's engine refusal has no home, and the plan's "one place" never sees a delete.**
- **Plan:** line 13 says the enforced rules are judged in `answeredOf`, "which every row write reaches". Line 106 (the writes.ts row) gives R18 only "the 403 for a DELETE on a `deletable: false` dataset". Ruling line 41 says the engine refuses a DELETE "for every actor".
- **Source:** a delete never reaches `answeredOf`. There are two delete paths:
  - **REST DELETE:** `app.ts:77` → `runWrite` → `applyWrite` → `storedOf`. The delete branches off at `writes.ts:641` and goes to `writer.delete` at `:645`.
  - **Undo of a create:** `planUndo` (`writes.ts:825`) → `restore`, which calls `writer.delete` directly (`:853-856`). This path never touches `storedOf`.
- **The risk:** a builder who puts the check in `storedOf`, the natural reading of "a DELETE", leaves the undo-of-a-create path open for any generic dataset.
- **Where the two paths meet:** `writableOf(…, 'delete', …)` at `writes.ts:71-76`, called from `app.ts:77` and `writes.ts:825`.
- **Smallest change:**
  - Name `writableOf` with `op === 'delete'` as R18's single home in the writes.ts row.
  - Add a Task 1 test: "the undo of a create on a deletable false dataset is refused, and the row stays".
  - Add a threat-model line: a person or service deletes a `deletable: false` row by DELETE or by undoing a create → `writableOf`. Today R18 is an access refusal with no attack and no mitigation entry (lines 52-59).

**S2. R18 turns more studio tests red, and the plan does not name them. One line of the plan is now false.**
- `expectRefused` asserts `code: 'forbidden'` and the writer's message (`packages/studio/test/ownership.test.ts:41-45`). If the R18 check runs before the writer, these fail:
  - `ownership.test.ts:103`: admin `DELETE /rows/site/5` expects `FROM_REGISTRY`.
  - `ownership.test.ts:164`: **both** passes of `DELETE /rows/onderhoud/:id` expect `LOG_FIXED`.
  - `ownership.test.ts:195-197`: worker `DELETE /rows/site/1` expects `NO_DELETE`.
- **The false line:** plan line 187 says "The worker pass of `:163` still gets the writer's `LOG_FIXED`". That holds for the PATCH at `:163` but not for the DELETE at `:164`, which runs in the same loop.
- **Change:** add `:103`, `:164` (both passes) and `:195-197` to Task 2's "Existing tests that change".

**S3. The docs commit leaves out R18 and R17's served fact.**
- **Plan:**
  - Lines 8 and 105 say "eight declarations".
  - Line 28 (the docs commit) lists those eight, `service_only`, the trusted flag and `primary`.
- **What is missing:** `DatasetDecl.deletable` (Interfaces line 130) is a ninth declaration. `lifecycle.buttons` (line 143) is a new served shape. Neither reaches `docs/SPEC.md` under line 28.
- **Change:** say "nine declarations", and add `deletable` and `lifecycle.buttons` to line 28.

## Note

**N1. A simpler R18 already exists in the engine: drop `delete` from studio's two writers.**
- **What already happens without a writer `delete`:**
  - `/schema` serves `deletable` as `Boolean(writerOf(...)?.delete)` (`app.ts:325`). The drawer's only Verwijderen gate is `model.deletable` (`Grid.tsx:404`). `Grid.test.tsx:1177` already pins it.
  - Without a writer `delete`, `writableOf` answers 405 `read_only` on both delete paths (`writes.ts:74`, reached from `app.ts:77` and `:825`).
- **Studio fits:**
  - `noServiceDeletes` passes a writer without `delete` through unchanged (`packages/studio/src/writers/index.ts:11`).
  - `writable` reads only `update` (`app.ts:38`).
- **Precedent:** the engine fixtures already use this shape: `writes.test.ts:210` and `batches.test.ts:11` ("plat writable but not deletable").
- **What it saves:** no new declaration, no docs entry, no threat-model line. S1 and S3's R18 part disappear. S2 still applies, with status 405 and code `read_only`.
- **A second reason:** as planned, the code `service_only` refuses services too, so its name would mislead.
- **Change:** if kept, the ruling should say why a second way to state "not deletable" is wanted.

**N2. Stale or thin lines.**
- Line 21 says the spec is "R1–R16" and that the plan adds R17. The spec now carries R17 and R18 (spec lines 46-47).
- Test map row 2 (line 68) and Review Focus 2 (line 83) do not list R18 or Verwijderen.
- Task 2's grid test "a deletable false model offers no Verwijderen" (line 179) duplicates `Grid.test.tsx:1177`. R18 needs no grid code.

## Round-2 findings, checked in source
- **B1:** resolved.
  - `/schema` serves `lifecycle` at `app.ts:307-308`.
  - `LifecycleDecl.transitions[].button` exists (`declare.ts:294-299`), so `transitions.some(t => t.button)` is computable there.
  - The grid has room for it: `engine.ts:85` (type), `:216-217` (mapping to the Model), and `columns.ts:179` and `App.tsx:680` (the hooks).
  - Plan lines 110, 112, 114-115, 143, 152 and 178 carry it.
- **S1:** resolved.
  - `valuesOf` is exported (`writes.ts:582-591`) and is the only public route to the private `answeredOf` (`:599`).
  - Its callers are `import.ts:163`, `seed-missing.ts:57` and `restore` at `writes.ts:859`. No other caller exists.
  - Plan lines 30, 106 and 136 add `options` and pass it on; `restore` does not pass it.
- **S2:** resolved. `touchedBy` throws `notUndoable` (422, `writes.ts:779`, `:804`) on a `deleted_at` revision. Line 54's wording is accurate.
- **S3:** resolved for the `:163` PATCH (line 187). See the new S2 for `:164`.
- **S4:** resolved.
  - Ruling line 39: one pill per tone, `bad` then `warn`.
  - Line 202 tests the Toewijzing case.
  - Theatre's tones (`theatre/src/datasets.ts:268`): geweigerd and geannuleerd are `bad`, uitgenodigd is `warn`. The labels match the expected strings.
- **N1–N6:** applied.
  - N1: lines 115-116 and 129.
  - N2: line 125.
  - N3: line 40.
  - N4: became R18.
  - N5: lines 70 and 188.
  - N6: line 212.

## Premises checked
- `valuesOf` is exported and can take an `options` parameter → `writes.ts:582` → holds
- `restore` calls `valuesOf` without trusted → `writes.ts:859` → holds
- Every row write reaches `answeredOf` → `writes.ts:641-647` and `:853-856` → holds for create and update; does not hold for delete (S1)
- `lifecycle` served at `app.ts:307-309` → `app.ts:307-308` → holds; `buttons` can be added there
- `deletable` follows the writer's `delete` → `app.ts:325` → holds (round 2 cited `:322`)
- "Writers already refuse every delete" on site and onderhoud → `writers/site.ts:56-58` with the `noServiceDeletes` wrapper at `writers/index.ts:9-18`; `writers/onderhoud.ts:18-20` → holds
- The undo of a delete is refused 422 before any write → `writes.ts:779`, `:804` → holds
- The shake-out's refused Verwijderen → `specs/studio-domain/shakeout.md:62` → holds (it names site's drawer)

## Verdict
**ready with fixes.** S1–S3 are a few lines of plan each, and all of them come from R18. If N1 is taken, S1 and S3's R18 part go away.

## Applied after this review
- **N1 taken**, so R18 needs no engine shape. Studio's site and onderhoud writers drop their `delete`. The engine already serves `deletable: false` and answers 405 `read_only` on REST DELETE and on the undo of a create. The `deletable` declaration, its 403 and its grid test are gone; R18's Ruling (line 41) says why; spec R18 is reworded.
- **S1 and S3's R18 part:** gone with N1. **S3's rest:** the docs commit (line 28) now names the served `lifecycle.buttons`; "eight declarations" is right again.
- **S2:** Task 2 names `ownership.test.ts:103`, `:164` (both passes) and `:195-197`, now 405 `read_only`, and adds the studio test "the undo of the sync's site create answers 405 read_only, and the row stays". The false line about `:163`/`:164` is fixed.
- **N2:** line 21 reads R1–R19; Review Focus 2 lists Verwijderen; the Test map's studio row carries R18 and the grid-fixes row R19.
- **R19** (Stefan's row lines) was added after the reviewed blob, in the grid-fixes Files row, Task 3 and the Global Constraints line on theatre and fiche.

Final: plan 93a2de24654e9d04c438eac7ac6b6bce5856f134, spec 83ca2a30b626ca19aebbc378c976f809fc488641.
