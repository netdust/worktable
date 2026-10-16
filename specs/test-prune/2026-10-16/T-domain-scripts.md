## Audit of slice T: theatre, fiche and the scripts' tests

I ran no tests and no builds. Everything below comes from reading the source and grepping it at 9320fba in the read-only worktree. The only thing I executed was a small brace-counting script on the scratchpad, used to measure test spans.

**Path prefixes.** All under R = `/home/ntdst/Sites/worktable-prune`:
- T/ = `R/packages/theatre/test/`
- F/ = `R/packages/fiche/test/`
- E/ = `R/packages/engine/test/`
- S/ = `R/scripts/`

### Totals
- **Tests examined:** 408 test declarations in 34 test files, plus 2 fixtures. That is about 470 cases once `test.each` and the loops are expanded.
- **Rows:** 115 suspects.

| Disposition | Rows | Lines out of the slice |
|---|---|---|
| DELETE | 65 | ~620 (521 test lines plus ~100 of headers and dead helpers) |
| REWRITE | 15 | ~140 (~90 of them move into engine tests) |
| DELETE-CONFLICT | 25 | ~440 more, if you approve them |
| KEEP | 10 | — |

If DELETE and REWRITE are applied, about 760 of the 6,229 lines go. With the conflicts too, about 1,200.

**Two findings carry most of the DELETEs:**
- `migrate()` calls `validateDomain()` first (`R/packages/engine/src/migrate.ts:96`), and every theatre and fiche test's setup calls `migrate`. So the five "passes validateDomain" tests cannot fail on their own.
- A large share of the theatre tests re-test engine behaviour that E/ already pins, using theatre data and adding nothing domain-specific.

### Scanned
- **Read in full:** all 34 test files in the slice. Also every engine test, writer and SQL file I cite as "covered by".
- **Skimmed:**
  - `T/fixtures/step-1.sql`: a 632-line database dump; I checked only its tables and who uses it.
  - `T/fixtures/invented-export.json`: checked its keys, legacy ids and `source`.
  - The scripts' implementation files: read only where a test calls them.

### Table

| path::test | disposition | reason |
|---|---|---|
| F/fiche.test.ts:82 PATCH of gemeente persists and is revised | DELETE | Engine behaviour: E/writes.test.ts:342 pins revisions on update. Nothing here is fiche-specific. |
| F/fiche.test.ts:102 custom filter | REWRITE | Engine filter behaviour. A boolean custom value is pinned nowhere in E/; move it there. |
| F/fiche.test.ts:118 passes validateDomain | DELETE | Cannot fail on its own: setup at F/fiche.test.ts:14 runs `migrate`, which validates. |
| F/fiche.test.ts:124 seeded views | REWRITE | Line 127 repeats E/views.test.ts:338. |
| T/access.test.ts:54 X does not exist for an owner (×3) | DELETE | E/access.test.ts:100 pins the 404. The theatre's set of owner sources is pinned by T/grid-ux.test.ts:98. |
| T/access.test.ts:64 another person's Toewijzing is 404 | DELETE | Same as E/access.test.ts:90 (`/revisions` of another subject's row). |
| T/access.test.ts:84 absence for another persoon | DELETE | All four refusals are engine behaviour: E/access.test.ts:141, :154 and :136. |
| T/access.test.ts:91 a Toewijzing takes only a declared transition | DELETE-CONFLICT | Duplicates T/toewijzing.test.ts:206 and :212. The step-2 plan names it by line. |
| T/access.test.ts:111 an Activiteit is not there to write | DELETE | E/access.test.ts:161, plus grid-ux:98. |
| T/apply.test.ts:173 every one inherits the venue | DELETE | apply:155 (`locatie_id` null) plus writer.test.ts:277 (the inheritance) already prove it. |
| T/apply.test.ts:182 one batch for all 28 and 8 | DELETE | apply:212 (one undo removes all 36) plus E/actions.test.ts:283 (one batch, kind `action`). |
| T/apply.test.ts:270 an owner is refused | DELETE-CONFLICT | E/actions.test.ts:191 covers it. The step-1 plan threat model requires it. |
| T/attachments.test.ts:35 /schema serves the attachments | KEEP | The spec decides these values. |
| T/attachments.test.ts:44 a rider uploaded is listed | DELETE | E/attachments.test.ts:120. The `rider` kind is already pinned by :35. |
| T/grid-ux.test.ts:30 passes validateDomain | DELETE | Cannot fail on its own: `schemaAs` calls `migrate` (line 14). |
| T/grid-ux.test.ts:32, :52, :92, :124, :152, :157, :173, :179, :185 | DELETE-CONFLICT | Read-backs of declarations: space and scoped list, sections, facts, icons, tones, kleur, hidden columns, eind_at. Each changes only when the declaration changes. The grid-ux plan names this file for them. |
| T/grid-ux.test.ts:76 every query is its own node | DELETE | Duplicate of T/seed-missing.test.ts:296. |
| T/grid-ux.test.ts:190 Planning visible_fields | DELETE | Duplicate of T/seed-missing.test.ts:297-306, which compares the whole Planning seed. |
| T/grid-ux.test.ts:204 Planning starts on this week | DELETE | Duplicate of T/seed-missing.test.ts:302 (`filters: WEEK`). |
| T/grid-ux.test.ts:98 owner: no space, only its sections | KEEP | The single theatre pin for what an owner can read. |
| T/grid-ux.test.ts:208 owner sees no activiteit | DELETE | Covered by :98 (sections) and :124 (the persoon icon). |
| T/history.test.ts:10 (whole file) | DELETE | E/history.test.ts:240 (a query without `creates` has no entries) and :92 (entries for a dataset). |
| T/import-cli.test.ts:42 refusing import leaks nothing | KEEP | Guards the theatre writers' own messages. |
| T/import-cli.test.ts:84, :93, :107 | REWRITE | Engine CLI behaviour (`serve.ts`), pinned nowhere in E/. Move them there. |
| T/import.test.ts:73 a plandag in the export is refused | DELETE | E/import.test.ts:73 ("a readonly column the writer derives"). |
| T/import.test.ts:80 both persoon and naam, nothing committed | DELETE | E/import.test.ts:161, plus the message in T/parity.test.ts:66. |
| T/import.test.ts:91 duplicate pair, --accept-report | DELETE | E/import.test.ts:195 and :295, plus the message in T/parity.test.ts:78. |
| T/invite.test.ts:245 an editor may not change the email | DELETE | E/record-link.test.ts:377-383. |
| T/invite.test.ts:252, :262, :267 | REWRITE | Engine record-link rules (spec line 83) that only the theatre tests: service accounts, an unchanged echo, token revocation. |
| T/legacy-post-id.test.ts:6, :13 (whole file) | DELETE | Declaration read-back. Covered by T/import.test.ts:41-57 and E/import.test.ts:280; one assertion moves. |
| T/lookups.test.ts:29 venue through the tourstop | DELETE-CONFLICT | Copy of T/writer.test.ts:277 (and step1:378, apply:173). The virtual-columns plan names this file. |
| T/lookups.test.ts:55 overriding the venue leaves the tourstop | DELETE-CONFLICT | Same as :29. One unique assertion moves first. |
| T/lookups.test.ts:84 mensen is a link | DELETE | Weaker copy of T/writer.test.ts:221. |
| T/lookups.test.ts:92 a view may show every field | REWRITE | Engine `fieldCount` (views.ts:167-170) counts links, and no engine test checks that. |
| T/lookups.test.ts:108 toewijzing carries the activity | REWRITE | The owner half is engine behaviour, and validation already guarantees it. |
| T/matrix.test.ts:49 a body that sets both | DELETE | Weaker copy of T/parity.test.ts:75 (same row, same message; parity also snapshots the tables). |
| T/matrix.test.ts:55 clearing the person without a name | DELETE | Identical to T/parity.test.ts:72. |
| T/matrix.test.ts:61 switching onto a person already on it | DELETE | matrix:37 (the name is cleared) plus parity:81 (duplicate). Same code, writers.ts:160 then :153. |
| T/matrix.test.ts:76 renaming a persoon changes titles | DELETE | E/rows.test.ts:456, plus T/parity.test.ts:174 (weergavenaam re-derived). |
| T/matrix.test.ts:82 afwezigheid titled by persoon | DELETE | Read-back of the title declaration. E/rows.test.ts:449 pins via/else titles. |
| T/matrix.test.ts:89 /views serves the matrix seed | DELETE | Read-back of a seed. Each seed's validity is pinned by T/theatre.test.ts:24. |
| T/matrix.test.ts:95 away window seeded across a Monday | DELETE | Snapshot of seed data. |
| T/matrix.test.ts:104 matrix_join on activiteit | DELETE | Declaration read-back. E/matrix.test.ts:277 pins `matrix_join`. |
| T/migrate.test.ts:20 new nullable column by ALTER | DELETE | E/migrate.test.ts:222 (ALTER), :281 (query reads the same rows), :352 (`.pre-migrate` only on a rebuild). |
| T/migrate.test.ts:53 step-1 DB migrates to step 2 | REWRITE | Real upgrade guard, but its `added` map changes with every new column. |
| T/migrate.test.ts:94 imported Toewijzingen keep a null role | DELETE | E/migrate.test.ts:222 and :232. The real-data path is T/import.test.ts:43. |
| T/migrate.test.ts:108 migrated DB serves rows, runs Task 10 query | DELETE | Its assertion at line 116 cannot fail, and `migrate` in :53 already recreates every view. |
| T/migrate.test.ts:119 soort added by ALTER | DELETE | E/migrate.test.ts:232, plus T/step3-data.test.ts:86 (default afwezig). |
| T/parity.test.ts:185 weergavenaam readonly in /schema | DELETE | Read-back. The behaviour is proven by parity:174. |
| T/parity.test.ts:245 voorstellingen is read-only | DELETE | E/writes.test.ts:438 pins `writable` for a query without writes. |
| T/parity.test.ts:252 passes validateDomain | DELETE | Cannot fail on its own: setup at line 29 runs `migrate`. |
| T/person-pages.test.ts:190 hidden productie_id/persoon_id refused (×2) | DELETE | E/owner-views.test.ts:125. person-pages:165 pins the exact keys an owner reads. |
| T/person-pages.test.ts:204 stored view naming a missing column | REWRITE | Engine for-owners check; this edge has no engine row. |
| T/seed-missing.test.ts:136 rol and sjabloon are config | KEEP | Stops demo people being seeded into a real database. |
| T/seed-missing.test.ts:141 existing DB gets Rol, Sjabloon, views | DELETE | Every assertion is in E/seed-missing.test.ts (:43, :61, :109, :131, :351, :364). Its view counts change with every new seed. |
| T/seed-missing.test.ts:211, :249, :282, :293 | DELETE-CONFLICT | One-time dagplanning→Planning upgrade (now done), an absence check, and a read-back. Engine covers the mechanics. The virtual-columns plan names them. |
| T/seed-missing.test.ts:314 Rol rows and another Sjabloon | DELETE | E/seed-missing.test.ts:61 and :131. The slots content is in :336. |
| T/seed-missing.test.ts:336 unslotted stays, slotted beside | KEEP | Spec line 239 decides it. |
| T/seed-missing.test.ts:355 planner-deleted speeldag counts as present | DELETE | E/seed-missing.test.ts:61 ("live or deleted, is kept"). |
| T/seed-missing.test.ts:365 renamed Rol re-added | DELETE | E/seed-missing.test.ts:61 (added by missing title). |
| T/shift.test.ts:70 served as "Tourstop verschuiven" | DELETE | Label read-back plus a check that the old name is gone. The e2e drives the label (`R/e2e/action-inputs.spec.ts:11`). |
| T/step1.test.ts:230 owner does not see speelreeks/rol/sjabloon (×3) | DELETE | E/access.test.ts:100 and :161, plus grid-ux:98. The step-1 plan's "Task 3" means the engine's actions.test.ts. |
| T/step1.test.ts:235 forbidden by each writer called directly | KEEP | Only test of a writer guard that HTTP cannot reach. |
| T/step1.test.ts:253 speelreeks_id is a relation | DELETE | Read-back. The behaviour is proven by step1:211 (409 in_use) and writer:277. |
| T/step1.test.ts:378, :382, :387 the inherited locatie | DELETE | writer:277, plus E/lookups.test.ts:55, :71 and :74 (inherits, own wins, null). |
| T/step1.test.ts:400 Planning shows locatie (R10) | DELETE | Duplicate of T/seed-missing.test.ts:305. |
| T/step3-data.test.ts:79 voorkeur defaults to false | DELETE | Read-back of a default the spec never decided (spec line 221). |
| T/step3-data.test.ts:105 owner cannot read persoon_rol, taak | DELETE | E/access.test.ts:100, plus grid-ux:98. |
| T/step3-data.test.ts:119 taak is created open | DELETE | T/step3-queries.test.ts:501-506: a taak created without status appears in werklijst, which keeps only open rows (werklijst.sql:26). |
| T/step3-data.test.ts:128, :137, :150, :163 the step 3 seeds | DELETE-CONFLICT | Snapshots of seed data. The tests that depend on the seed fail anyway if it changes. The step-3 plan names them. |
| T/step3-queries.test.ts:435 owners read none of them | DELETE-CONFLICT (lines 436-442 only) | The 404s are engine behaviour plus grid-ux:98. The flags assertion at 443-444 is unique and stays. |
| T/step3-queries.test.ts:448 every seeded view saves | DELETE | Duplicate of T/theatre.test.ts:24. |
| T/step3c.test.ts:32, :43 | DELETE-CONFLICT | Read-back of the skin needs, and a check of seeded tiles that `seedDomain` already enforces (dashboard.ts:194 throws on an unknown view). The step-3c plan names them. |
| T/step3c.test.ts:56 an owner lists no dashboard | DELETE | E/dashboard.test.ts:157. |
| T/theatre.test.ts:7 productie_dag | KEEP | Only test of the productie_dag query. |
| T/theatre.test.ts:19 the theatre domain validates | DELETE | Cannot fail on its own: theatre:9 calls `migrate`. |
| T/theatre.test.ts:24 seeded views pass the saved-view rules | REWRITE | Line 38 repeats E/views.test.ts:338. |
| T/theatre.test.ts:73 a 00:30 show keeps its calendar datum | DELETE | T/parity.test.ts:225 (datum 14, start 00:30) plus theatre:15-16 (plandag 13 on the same row). |
| T/toewijzing.test.ts:67 without a role it is refused | DELETE | Identical to T/parity.test.ts:69, which also snapshots every table. |
| T/toewijzing.test.ts:169 two PATCHes, same expect | DELETE | E/lifecycle.test.ts:259. The transitions are pinned by toewijzing:153. |
| T/writer.test.ts:100 a sent plandag is dropped | DELETE | E/writes.test.ts:68 (readonly dropped), plus writer:82. |
| T/writer.test.ts:107 delete is soft | DELETE | E/writes.test.ts:396. |
| T/writer.test.ts:199 an empty start_at is refused by the engine | DELETE | E/writes.test.ts:89: same `fits` branch (writes.ts:116), checked before the writer (writes.ts:130). |
| T/writer.test.ts:221 serves the people as links.mensen | DELETE-CONFLICT | Read-back of the declaration. The dagplanning plan names this describe. |
| T/writer.test.ts:249 passes validateDomain | DELETE | Cannot fail on its own: setup at line 14 runs `migrate`. |
| T/writer.test.ts:265 a changed start_at shows the recomputed plandag | DELETE | Same as writer:87. E/writes.test.ts:305 pins reply equals stored row. |
| T/writer.test.ts:271 omschrijving, soort, locatie write the activity | DELETE | writer:277, plus E/lookups.test.ts:332 (an inherited write lands on `own`). |
| T/writer.test.ts:277 clearing locatie falls back | KEEP | Takes one assertion from lookups:81. |
| S/check-staged-export.test.ts:105 this repository's tracked tree passes | DELETE | Re-runs the gate's own `bun run check` step (`R/package.json:14`), and depends on the working tree. |
| S/parity.test.ts:72 view rows differ from the export count | REWRITE | Same input as :121; each run spawns the script. Merge into :121. |
| S/parity.test.ts:139 output holds no fixture name | REWRITE | Same clean input as :57. Merge into :57. |
| S/grid-icons.test.ts:6 icon map covers every engine icon | KEEP | A source scan, but the only cross-package check. |

### KEEP: the bar, point by point
1. **T/theatre.test.ts:7**
   - Decided: spec line 256 (productie_dag counts per soort per plandag).
   - Can disagree: 5 and 1 come from the seed rows, not the SQL.
   - Outcome: the rows of the view.
   - Seam: the SQL view the rows route serves.
   - Can fail: yes, on a broken GROUP BY.
   - Lowest seam, no duplicate: no other test reads productie_dag values. Lines 15-16 become the only check that the seed applies the day line (`seed.ts:108`).
2. **T/attachments.test.ts:35**
   - Decided: `specs/attachments/spec.md:34`.
   - Can disagree: the expected values come from the spec.
   - Outcome: the `/schema` contract the drawer reads.
   - Seam: GET /api/schema.
   - Can fail: if a kind is dropped or productie gains attachments.
   - Lowest seam, no duplicate: the e2e covers only drawers (CHECKS.md:160-163); attachments plan T3 names this file.
3. **T/grid-ux.test.ts:98**
   - Decided: spec lines 93 and 232 (who reads what) and line 54 (space only for a reader of productie).
   - Can disagree: yes.
   - Outcome: the sources and space an owner can read.
   - Seam: an owner's GET /api/schema.
   - Can fail: if `owners` is added to or removed from a dataset.
   - Lowest seam, no duplicate: replaces the nine per-source owner-404 tests.
4. **T/seed-missing.test.ts:136**
   - Decided: spec lines 207 and 234 (Rol and Sjabloon are the config datasets).
   - Can disagree: yes.
   - Outcome: which tables `--seed-missing` writes on a live database (spec line 51).
   - Seam: the `config` flag the engine reads.
   - Can fail: if persoon becomes config, invented people would be seeded into real data.
   - Lowest seam, no duplicate: no other test checks that no demo dataset is config.
5. **T/seed-missing.test.ts:336**
   - Decided: spec line 239 (the slotted template's own title lets it go in beside the step-1 one).
   - Can disagree: yes.
   - Outcome: sjabloon rows after the command.
   - Seam: the operator's CLI.
   - Can fail: if the title is renamed.
   - Lowest seam, no duplicate: once :141 and :314 go, the only proof that the theatre's config seeds pass their writers with slot titles resolving. An in-process `seedMissing()` call would be faster (optional).
6. **T/step1.test.ts:235**
   - Decided: spec line 232 (writers refuse by role).
   - Can disagree: yes.
   - Outcome: a 403.
   - Seam: the Writer contract the engine calls (spec line 53).
   - Can fail: if `forPlanners` is removed (writers.ts:72-89).
   - Lowest seam, no duplicate: HTTP never reaches this guard (E/access.test.ts:100 answers 404 first), so this is its only test.
7. **T/writer.test.ts:277**
   - Decided: spec lines 297 and 352 (the step 2b gate).
   - Can disagree: yes.
   - Outcome: row values, and the speelreeks row unchanged.
   - Seam: PATCH and GET /api/rows/activiteit.
   - Can fail: if the lookup's `via` or `own` is wrong.
   - Lowest seam, no duplicate: becomes the single theatre test of the inherited venue.
8. **T/import-cli.test.ts:42**
   - Decided: spec line 203 and the step-0e-import plan (output is counts only).
   - Can disagree: yes.
   - Outcome: the text of stdout, stderr and the report.
   - Seam: the CLI.
   - Can fail: if a theatre writer message ever quotes a value.
   - Lowest seam, no duplicate: E/import.test.ts:352 covers only the engine's own messages.
9. **F/fiche.test.ts:108**
   - Decided: grid-ux plan threat 3 (fiche renders as before: no switcher, one section).
   - Can disagree: yes.
   - Outcome: the schema's keys.
   - Seam: GET /api/schema.
   - Can fail: if the engine serves space or sections to a domain that declares none.
   - Lowest seam, no duplicate: `Object.keys(body) == ['sources']` is unique. The writable list repeats E/writes.test.ts:438 and could be trimmed.
10. **S/grid-icons.test.ts:6**
    - Decided: spec line 54 (one icon from the engine's fixed set, drawn by the grid).
    - Can disagree: yes; the two lists are maintained apart.
    - Outcome: the drawn names.
    - Seam: the grid's map, read as text, because AGENTS.md says the grid talks to the engine by REST only.
    - Can fail: yes.
    - Lowest seam, no duplicate: nothing else cross-checks the two lists. Importing `R/apps/grid/src/ui/icons.ts` instead of the regex would be sturdier if lucide-react resolves under bun test; I could not verify that without running it.

### REWRITE: the bar, and the replacement
For each one, the points the test passes are on one line, the point it fails on the next, then the replacement.

- **F/fiche.test.ts:102**
  - Passes: decided (spec line 104), can disagree, outcome, seam, can fail.
  - Fails: not at the lowest seam; boolean custom equality is engine behaviour. E/filter.test.ts:47-54 tests only string and list values.
  - Replacement: add a `{ 'custom.<bool>': true }` case to E/filter.test.ts:47 (with a boolean custom value in its fixture), then delete fiche:102.
- **F/fiche.test.ts:124 and T/theatre.test.ts:24**
  - Passes: seeds go in around the views route (migrate.ts:146-159), so re-posting each through POST /api/views is real.
  - Fails: duplicates; line 127 and line 38 repeat E/views.test.ts:338.
  - Replacement: delete that one line in each; keep the length check and the POST loop.
- **T/import-cli.test.ts:84, :93, :107**
  - Passes: decided by the step-0e-import plan; file mode, report JSON and exit code can disagree and fail.
  - Fails: `serve.ts --import` is engine code, and the theatre adds only the input file. E/import.test.ts:317-420 has no test for mode 0600, a replaced report, or combined flags.
  - Replacement: move all three into E/import.test.ts's `serve.ts --import` describe, using its `exportOf(VALID)` and `cli()`, with the assertions unchanged.
- **T/invite.test.ts:252, :262, :267**
  - Passes: decided by spec line 83 ("a service account included"; "revokes the outstanding action tokens of its subject") and step-2 review B1.
  - Fails: engine behaviour. E/record-link.test.ts:377 covers only the editor cookie and the rotation.
  - Replacement: in E/record-link.test.ts:376, add:
    - `createService` with editor and with administrator, PATCH the inbox column → 403, tables unchanged;
    - an editor PATCH with the inbox unchanged plus another column → 200;
    - mint an action token (E/action-token.test.ts has a hook fixture), administrator changes the inbox → POST /act with the old token → 401 `bad_token`.
  - Then delete these three and :245.
- **T/lookups.test.ts:92**
  - Passes: decided by the comment at `R/packages/engine/src/views.ts:166`; outcome is the POST status.
  - Fails: engine behaviour. `fieldCount` counts links (views.ts:167-170), but E/lookups.test.ts:299 tests the cap with lookups only.
  - Replacement: in E/links.test.ts, POST /views with every column and the link of a linked source → 201; one more key → 400 "takes at most".
- **T/lookups.test.ts:108**
  - Passes: the editor half (lines 108-119) is decided by `specs/step-3/plan.md:275`.
  - Fails: the owner half (lines 121-134) is engine behaviour, covered by E/lookups-privacy.test.ts:156-214. Validation also forbids `owner_visible` on a lookup that does not go through the owner column (spec line 51).
  - Replacement: delete lines 121-134.
- **T/migrate.test.ts:53**
  - Passes: decided by spec line 169, the step-0e-migrator Test map and step-2 row 12. It is the only test against a database the real step-1 code wrote.
  - Fails: it is a change detector. The `added` map (lines 75-81) and the column checks (63, 68-72) need an edit for every column added later.
  - Replacement: project each migrated row onto its pre-migration keys and compare with `before`; keep the `.pre-migrate` check, `foreign_key_check` empty and `integrity_check` ok; drop the map and the column-existence lines.
- **T/person-pages.test.ts:204**
  - Passes: decided by spec line 63 (a key that is not owner-visible is refused, naming it).
  - Fails: engine behaviour; E/owner-views.test.ts:125 has no row for a key the source lacks.
  - Replacement: add a raw-inserted view with `visible_fields ['name','nope']` to that table → 400 `column_not_owner_visible`, key `nope`.
- **S/parity.test.ts:72 and :139**
  - Passes: decided by spec line 203.
  - Fails: each repeats another test's input and spawns the script again.
  - Replacement: move :78 into :121 and lines 141-145 into :57, then delete both.

### DELETE-CONFLICT: the governing lines
- **T/access.test.ts:91**: `specs/step-2/plan.md:127`: "unit · `packages/theatre/test/toewijzing.test.ts`, `access.test.ts:91`, `parity.test.ts`". Also :277: "`access.test.ts:91` rewritten".
- **T/apply.test.ts:270**: `specs/step-1/plan.md:44`: "Task 4, where an owner gets 404 on `sjabloon_toepassen`."
- **T/grid-ux.test.ts:32, :52, :92, :124, :152, :157, :173, :179, :185**: `specs/grid-ux/plan.md:39`: "| Theatre declarations | `GET /api/schema` | integration · `packages/theatre/test/grid-ux.test.ts` …".
- **T/lookups.test.ts:29, :55**: `specs/virtual-columns/plan.md:263`: "| T2 theatre | `GET /rows/activiteit` | theatre integration | `packages/theatre/test/lookups.test.ts` |".
- **T/seed-missing.test.ts:211, :249, :282, :293**: `specs/virtual-columns/plan.md:266`: "| T5 one Planning | `--seed-missing`, `validateDomain`, `/schema` | … | `seed-missing.test.ts`, `validate.test.ts` | … | no Dagplanning; Overzichten |". :282 checks that dagplanning is absent; with an `ARCHITECTURE-INVARIANTS.md` it would become a grep there, and there is none yet.
- **T/step3-data.test.ts:128, :137, :150, :163**: `specs/step-3/plan.md:72`: "| T1 | Theatre data: Persoon_rol, Taak, Beschikbaarheid.soort, parameters, seeds | … `step3-data.test.ts`".
- **T/step3-queries.test.ts:435 (lines 436-442)**: `specs/step-3/plan.md:59`: "T2 asserts the 404 for each." Also :260: "an owner gets 404 on all five `/rows/<query>`".
- **T/step3c.test.ts:32, :43**: `specs/step-3c/plan.md:65`: "| T3 | Theatre needs and seeds | `GET /schema`, `GET /views`, the seeded dashboard | … `step3c.test.ts`". If both go, the whole file goes.
- **T/writer.test.ts:221**: `specs/dagplanning/plan.md:54`: "| Theatre Dagplanning declarations | … `writer.test.ts` (`describe('dagplanning')`, :220) |".

If you approve a conflict, check its plain-DELETE twins:
- grid-ux:76, :190 and :204 and step1:400 lean on seed-missing:293. If that goes too, these behaviours rest only on e2e: CHECKS.md:56 (dagplanning-is-gone), :49 (inherited-venue), :60 (period-is-a-filter).
- lookups:84 leans on writer:221. If both go, writer.test.ts:238 and E/links.test.ts remain.

### Assertions to move before deleting
- T/lookups.test.ts:81 (the sibling activity still inherits after another is overridden) → T/writer.test.ts:277. Attach activity 2 to the same speelreeks and assert it still reads locatie 3, inherited.
- T/legacy-post-id.test.ts:6, the beschikbaarheid part → T/import.test.ts:47: `SELECT legacy_post_id FROM beschikbaarheid` gives 601 and 602.
- T/access.test.ts:97 (the POST refusal message): optional `.body.message` check on T/toewijzing.test.ts:217. It is the same code path (writers.ts:72-89) as :215.
- T/writer.test.ts:274 (stored `locatie_id` is 2): optional, into writer:277.
- T/step3-queries.test.ts:443-444 (no flags for an owner): keep it if lines 436-442 go.
- The REWRITE moves into E/ are listed above.

### Support code that goes dead if every DELETE is applied
- **Whole files:** T/history.test.ts and T/legacy-post-id.test.ts.
- **`validateDomain` imports:** T/theatre.test.ts:3, T/grid-ux.test.ts:3, T/parity.test.ts:3, T/writer.test.ts:3, F/fiche.test.ts:3.
- **T/import.test.ts:** `copy` (line 24) and the `acceptReport` parameter of `run` (line 23).
- **T/migrate.test.ts:** `extra`, `withExtra` and `tables` (lines 10-18); the imports `defineDataset`, `Domain`, `seedDomain`, `signIn`, `testEngine`; and `hasTable` once :53 is rewritten.
- **T/seed-missing.test.ts:** after :141 goes, `existingDb` only needs migrate plus one organisatie. That makes `STEP_3`, `STEP_3C`, `ADDED`, `RENAMED`, `OLD_ACTIVITEIT` and `PRE_STEP_ONE_DAGPLANNING` dead (lines 14-38 and 43-82). If the conflicts go too: `planningDb`, `DAGPLANNING_VIEW`, `ORPHAN`, `planningViews`, `count`, `WEEK`, `PLANNING`, `insertViews`, and the `createAccount`, `signIn` and `testEngine` imports.
- **T/step1.test.ts:** the `owner` requester (lines 17 and 39).
- **T/invite.test.ts, after the moves:** `createService`, `recordLinkFor` and `TEST_LINK_SECRET` (lines 7-9), and `bram`, `asLink` and `bearer` (lines 229-243). That is the whole B1 describe.
- **T/import-cli.test.ts, after the moves:** `importInto` (lines 76-82) and the `chmodSync`, `statSync` and `writeFileSync` imports.
- **Only if the conflicts are applied:**
  - T/apply.test.ts: `owner` and `LOTTE`.
  - T/grid-ux.test.ts: `FACTS`, `SOORT_TONES` and `STATUS_TONES`.
- **Fixtures:** none goes dead. `invented-export.json` is still used by T/import, T/import-cli, S/parity and S/check-staged-export; `step-1.sql` by the rewritten migrate:53.

### Findings outside the brief
- **A test that cannot fail:** T/migrate.test.ts:116, `expect(sqlite.query('SELECT count(*) FROM mijn_producties').get()).toBeDefined()`. An aggregate always returns a row, so only a throw can fail it. The five validateDomain tests cannot fail on their own either (migrate.ts:96).
- **A misleading name:** T/step3-queries.test.ts:343 "persoon_dag writes state through refuse()" never writes through persoon_dag; it PATCHes `/rows/toewijzing` directly (line 346). The plan specified it that way (`specs/step-3/plan.md:251-254`). The mapped write from persoon_dag `state` to toewijzing has no theatre test, only the engine's generic one.
- **Change detectors that tie to seed size:**
  - T/seed-missing.test.ts:150 and :171 hard-code "views 23 added … 31 present", from lists kept by hand.
  - T/access.test.ts:61 lists the editor's ids 1-11.
  - T/step3c.test.ts:52 expects 8 tile references.
- **A hedge on reply shape:** T/matrix.test.ts:122 and :126 accept either `res.body.row?.state` or a database read, which hides which reply shape is real.
- **Stale governing lines:**
  - `specs/dagplanning/plan.md:54` still names `PATCH /api/rows/dagplanning/:id` and `describe('dagplanning')`. That source is gone; the describe is now 'the Planning on activiteit'.
  - `specs/step-2/plan.md:127` and `:277` cite tests by line number (`access.test.ts:91`, `parity.test.ts:61-77`), which drifts.
  - `specs/step-0e-auth/plan.md:137` says "→ `access.test.ts`" without saying the engine's or the theatre's file.
- **Naming:** T/parity.test.ts tests the writers; S/parity.test.ts is the real parity test.
