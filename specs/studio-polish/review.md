# Feature review: studio-polish

Reviewed: origin/feature/studio-polish at facdcd57c03b68b6f341266fe5e3ef539c259380, base d1d36135ae1f897c4f30280e2c922d7eb9bcb7c9 (origin/main).
Plan: specs/studio-polish/plan.md (Rulings, Threat model, Test map, Review Focus). Spec: specs/studio-polish/spec.md (R1–R19).
Level: full. Reviewers:
- the superpowers code reviewer (general-purpose, opus)
- security-sentinel (opus)

There is no ARCHITECTURE-INVARIANTS.md, so there was no invariant-auditor. The project is not WordPress.

- **Code reviewer:** ran column-writers plus packages/studio (140 pass) and the six changed grid vitest files (116 pass) in a scratch copy.
- **Security-sentinel:** ran `bun test packages/engine packages/studio` with its probes (1783 pass), through the real Hono app. The probes are in the sentinel's scratch copy (`sentinel-copy/packages/engine/test/sentinel-probes.test.ts`, `sentinel-copy/packages/studio/test/sentinel-studio.test.ts`).

Neither reviewer changed any tree.

## Blocking

None.

## Should fix

**S1. A board still offers each lane's "+" where the server refuses the preset.** Raised by the code reviewer (I-1).
- **Where:** apps/grid/src/ui/App.tsx:686 gates `onCreate` only on `writable && !model.query && !model.created_by`. Board.tsx:83 presets `{ [column]: lane.value }`, and QuickCreate sends it (dashboard/QuickCreate.tsx:97).
- **What a person sees:** "Opdrachten per status" (studio datasets.ts:78) shows "Nieuw in <lane>" on every lane. The actie writer refuses every lane but Aangevraagd ("Een opdracht begint als aangevraagd.", writers/actie.ts:77).
- **The same gap in general form:** a board grouped by a column that is read-only to the viewer answers 403 `service_only` on the lane preset.
- **Fix:** offer lane "+" only when the viewer may set the board's column: the `!readonly && !pressedOnly` test that `draggable` uses (App.tsx:746). `drag: false` alone keeps the "+". Add a case to offered.test.tsx.

## Note

From security-sentinel (none of them reachable in studio, theatre or fiche today):

**N1. An action update step with `id: null` becomes a create that skips `created_by`.**
- **Where:** actions.ts:129-133 passes the id through. writes.ts:663 turns null into "no current row", and :688 inserts. `checkServiceOnly` judges `created_by` only when `op === 'create'` (writes.ts:596-601).
- **Probe:** a forged `updates: [{id: null}]` step on a created_by dataset answered 201, and the row could not be undone (405).
- **Reach:** only domain code can produce a null id.
- **Fix:** in `applyWrite`, throw when `op !== 'create' && id === null`.

**N2. An owner-role person's create fills a `written_by` owner column.**
- **Where:** `forcedOwner` adds it after the check (writes.ts:620-622).
- **Impact:** the value is always the caller's own subject.
- **Fix:** `validateDomain` refuses `written_by` on `owners.owner`.

**N3. A lookup whose `own` column is `written_by` is enforced but served as editable.**
- **Where:** lookups.ts:43; app.ts:210 never applies `readonlyTo`.
- **Fix:** validate.ts:355 refuses `own.written_by`, next to `own.readonly`.

**N4. The three enforced values are not validated, and `deleted_by` fails open.**
- **Where:** attachments.ts:151 tests `=== 'person'`, so `deleted_by: 'persons'` validates and enforces nothing.
- **Fix:** validate each value whenever it is present.

**N5. A service that deletes the parent row hides `deleted_by: 'person'` files permanently.**
- **Where:** the delete branch at writes.ts:657 never looks at attachments.
- **Studio:** not reachable (site has no delete; `noServiceDeletes`).
- **Fix:** document the assumption, or refuse that delete.

- **Side observation:** the engine's `isPerson` counts a link as a person. Studio's writers treat a link as not a user (`(kind ?? 'user') === 'user'`). Nothing follows from it today.

From the code reviewer:

**M-1. R9 race on optimistic drawer edits.**
- **Where:** Sections.tsx:153 keys on painted fields. An inline drawer edit paints before it sends (store.ts:243-250), so the history GET can miss the person's own edit.
- **Not a regression.**
- **Fix:** key on confirmed content or `batch_id`.

**M-2. R19 may not be visibly stronger.**
- **Where:** theme.css:26, #e7eaee → #dfe3e9, about 1.21:1 → 1.29:1 against white.
- **Gap:** the e2e pins the hex, not visibility. Let the shake-out at 125% and 150% decide.

**M-3. Theatre changed in one place the plan did not name.**
- **Where:** hints.ts:12 + App.tsx:708.
- **What changed:** any board that does not drag loses the drag hints. That includes a viewer without write access and a read-only column. It also drops "⌘Z ongedaan maken".
- **Fix:** name the change, and keep the undo hint.

**M-4. Misplaced comment.** validate.ts:100: `checkCalendar`'s comment sits above `checkFooter`.

**M-5. A test name promises an undo it never does.** column-writers.test.ts:366, "a person deletes the file, and undoes that".

**M-6. Any TypeError reads as a connection error.**
- **Where:** api.ts:33 maps every `TypeError` in `request`/`uploadAttachment` to "Geen verbinding met de server", including programming errors (api.ts:163).
- **Fix:** limit the mapping to the `fetch` call.

**M-7. A refused create reads as a refused edit.** i18n.ts:395 shows "…kan je niet zelf wijzigen." for a refused create, too. It shows only on a stale grid.

**M-8. Docs housekeeping.**
- SPEC.md:92 and :94 still describe the old lifecycle and buttons shapes.
- CHECKS.md:205 still says "slepen naar een stap van de worker".
- studio's `new_label` 'Nieuwe site' and 'Nieuwe logregel' (datasets.ts:41, :202) are now dead for people.

**Rulings judged sound by the code reviewer:**
- SYSTEM and link count as persons, with trusted the only bypass.
- actie keeps `delete`: an acceptable deferral. The follow-up is a per-row `deletable` in `available`.
- R17 covers the drawer Status field.
- R15 `conditional`.
- The order of `checkServiceOnly`.
- `undoAttachments` refuses a service both ways.
- R9 keyed on content.
- The R11 CSS approach.
- `Model.selectable` holds a key.
- drawer-actions.test.ts:242 is the engine's selection fixture, not theatre.
- The theatre `dashboard-title-pill` flake is very unlikely to come from this branch: App.tsx:452 suppresses R10 pills on dashboards.

Findings: 0 Blocking · 1 Should fix · 15 Note

## Applied in the fix pass

Each fix has its own test, through the seam where the finding showed. Review ran on facdcd5.

| Finding | Commit | Test |
|---|---|---|
| S1 a lane's "+" only where the column may be set | f1e4a30 | `offered.test.tsx` "offers no lane + where the person may not set the board's column, and keeps it where drag is only switched off" (RED first); e2e `no-new-where-not-allowed` asserts no lane "+" on "Opdrachten per status" |
| M-3 a board that does not drag keeps "⌘Z ongedaan maken" and "↵ openen", loses the drag and Spatie hints | f1e4a30 | `offered.test.tsx` "says how to drag only where it drags" |
| M-2 `--color-border-row` `#d0d6dd` light, `#33363c` dark | 6bdf80a | e2e `row-lines-at-150` pins the computed colour; the shake-out looks at 1.25 and 1.5 scale |
| M-6 only the `fetch` call reads as "Geen verbinding" | 2eacb5e | `api.test.ts` "does not call a failure after the reply a lost connection" (RED first); the fetch-rejection case was already tested |
| N1 an update or delete step without a record is refused 422 `invalid_update` | 92ab15d | `column-writers.test.ts` "an update step without a record" (RED first) |
| N4 `written_by`, `created_by`, `deleted_by` validated whenever present | bec55b3 | `column-writers.test.ts` "written_by, created_by and deleted_by must say service, service and person" (RED first) |
| N2 no `written_by` on the owner column | bec55b3 | "no written_by on the owner column" (RED first) |
| N3 no `written_by` on a lookup's `own` column | bec55b3 | "no written_by on a lookup's own column" (RED first) |
| M-4 `checkCalendar`'s comment back above it | bec55b3 | none (hygiene) |
| M-5 the test now undoes the person's delete | 1494c5d | `column-writers.test.ts` "a person deletes the file, and undoes that" |
| M-8 SPEC.md lifecycle and buttons shapes aligned; studio's dead `new_label`s removed | 1494c5d | none (nothing read them) |
| N5 SPEC.md names the assumption that a service cannot delete the row that owns `deleted_by: 'person'` files | 1494c5d | none (documented) |
| M-8 CHECKS.md:205 reworded | with /shakeout | `bin/shakeout-check.py` |

**Theatre-visible change (M-3).** A board that does not drag (a viewer without write access, a read-only column, or `drag: false`) no longer shows "Sleep een kaart om haar te verplaatsen" and "Spatie oppakken en neerzetten" in the footer. It keeps "↑↓←→ bewegen", "↵ openen" and "⌘Z ongedaan maken". Boards that drag are unchanged.

**Not in this pass, for Stefan's list:** M-1 (R9 race on an optimistic drawer edit; not a regression), M-7 (a refused create reads "wijzigen"; stale grid only), N5's refusal variant, and a per-row `deletable` in `available` for opdrachten (the opdracht drawer's Verwijderen stays).
