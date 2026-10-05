# Step 0c — fiche proof, in-use refusal, theatre parity: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A second domain (`fiche`) runs on the unchanged engine and edits in the same grid; a referenced row cannot be soft-deleted (409 `in_use`); the theatre package reaches Laika parity (Organisatie, Persoon, Toewijzing without slots, Beschikbaarheid, `voorstellingen`); the grid clears a nullable select to null and deletes a row from its drawer.

**Architecture:** `packages/fiche` is a domain package like theatre — declarations, a writer, one SQL view, seeds — loaded by the engine CLI by name. Two engine changes, both after the fiche proof: `writes.ts`'s delete path counts, before the writer's `delete`, live rows of every domain dataset whose relation column targets this dataset and id (and `/schema` serves `deletable`); and `WriteContext` gains `exists(dataset, match, exceptId?)`, a live-rows equality lookup inside the write transaction, which the duplicate-assignment rule needs (spec finding F6, pending Stefan). Theatre adds four datasets, writers for Productie and Organisatie, relation declarations on Activiteit and Productie, and a public SQL view. The grid's adapter sends `null` for a cleared nullable select, and the row drawer gets a delete action wired to a new `store.remove`.
First working version: Task 1 — `bun packages/engine/src/serve.ts --domain @worktable/fiche --db /tmp/fiche.db --fresh` plus `ENGINE_URL=… bunx vite` shows the Fiches view in the grid, editable.

**Tech Stack:** Bun 1.3, Hono 4, drizzle-orm (bun-sqlite), React 19, Vite, Vitest, Playwright, Biome.

**Spec:** `specs/step-0c/spec.md` (parent: `docs/SPEC.md`).

**Simplest design:** For the in-use rule the simplest design is to let SQLite's foreign keys refuse — but deletes are soft, so the FK never fires; the engine has to look. The look is one `SELECT count(*)` per (dataset, relation column) pair that targets the deleted dataset, computed from declarations at call time — no index of reverse relations is built, because a domain has a handful of relations. For the fiche proof the simplest design is the one that tests the claim: build it with no engine edits and let `git diff --stat main -- packages/engine` after Task 1 be the evidence. The delete action reuses the drawer's existing `editor` slot and the store's existing error notice instead of a new confirm dialog.

## Decisions

- Fiche proof covers declared columns only; custom values are seeded and filterable, not shown or edited (Field is step 5). — Stefan, 2026-10-05.
- Toewijzing `state` uses the spec's options without `maybe`; free enum until step 2. — Stefan, 2026-10-05.
- Beschikbaarheid uses datetimes. — Stefan, 2026-10-05.
- New relations are declared; an existing database needs `--fresh` (ALTER stays the step 1–2 item). — Stefan, 2026-10-05.
- Last write wins (from 0b) stands.
- The 409 carries `by: [{label, count}]` beside an English fallback `message`; the grid builds the Dutch sentence from `by`. Verwijderen is two-step (Verwijderen → Zeker?). — Stefan, 2026-10-05.
- Weergavenaam (R4), the drawer delete (R10) and the Producties view are approved with the plan. — Stefan, 2026-10-05.
- Step 0e's entry condition: the table-rebuild migrator exists before the first real import. — Stefan, 2026-10-05.
- **Approved by Stefan, 2026-10-05 (spec finding F6):** a writer may ask `ctx.exists(dataset, match, exceptId?)` — whether a live row of `dataset` has every column in `match` equal to its value, excluding `exceptId`. Equality only, bound values, declared columns only (else the engine throws: a writer bug). Without it R5's "one assignment per person per activity" cannot be refused with its Dutch message (a UNIQUE index would answer 500). If Stefan rejects it, Task 2 drops `exists`, R5's duplicate rule is deferred, and the duplicate-assignment gate flow is struck.

## Global Constraints

- `packages/engine` never imports a domain package and holds no domain word. Task 1 changes nothing under `packages/engine/`.
- Domain rules (refusals, derived `weergavenaam`, plandag) live in domain writers; the in-use rule is generic and lives in the engine.
- Dutch names and refusal messages in domain packages; English in the engine.
- Fixtures are invented. No client data — field keys from the VAD fiche, no real fiche content.
- Writes keep the 0b guard (JSON, `Sec-Fetch-Site`, Host); no new route is added.
- Out: matrix, saved-view saving, auth, import, WordPress block, lifecycle, record tokens, slots, kandidaten, Rol, Speelreeks, Sjabloon, Taak, Field, custom-field render/edit, delete undo.
- `docs/SPEC.md` is never committed by this plan.
- Each task logs its start and end time in the Time log.

## Threat model

**Assets.** Referential integrity of the planning data (a venue or production deleted under live activities); the audit trail.

**Attacks.**
1. **Orphaning live rows by deleting what they reference** — `DELETE /api/rows/organisatie/<venue>` while activities point at it → **`inUse()` in `writes.ts` counts live referencing rows across every domain dataset's relation columns inside the write transaction; 409 `in_use`, nothing written, no Revision row.**
2. **A race between the check and the delete** — a reference created between count and soft-delete → **the count and the soft-delete run in the same synchronous SQLite transaction; bun:sqlite serialises it.**
3. **Leaking data through the in-use message** — the message names datasets and counts only, never referencing row contents or ids.
4. **A domain writer bypassing in-use** — a writer's `delete` runs only after `inUse()` passed; a writer cannot skip the engine check.
5. **`exists()` as a query vector** — a writer passing user input as `match` keys → **`exists()` accepts only the target dataset's declared column names as keys (else throws, a writer bug → 500) and binds every value.**

**Mitigations — where they live.** `inUse()` and its call in `runWrite`'s delete branch, and `exists()` in the write context, `packages/engine/src/writes.ts` (1, 2, 3, 4, 5).

**Deferrals.** Rows that point at an already soft-deleted target (from before this rule) are not repaired. Relation columns not declared as relations (`speelreeks_id`) are not checked. No auth (from 0b).
- **Auth (step 0, security M1):** the authorization decision must run before `inUse()`, and `by` must be filtered to datasets the actor may read. A refused actor gets 403 with no `by`.
- **Self-reference:** a dataset with a relation to itself would block its own delete through its own pointer. No such dataset exists yet.
- **Relations in custom fields:** relations stored in `custom` fields (Field, step 5) are not seen by `inUse()`.
- **Legacy rows at import (0e):** the theatre writers judge the cross-field rules on every write, while Laika judged only writes that touched those fields. An imported Laika row holding both persoon and naam, or a duplicate pair, must be cleaned at import, or a later edit of its `notitie` will be refused.
- **A site `error.in_use` string** would override the sentence built from `by`. When site strings arrive, prefer `inUse(by)`.

## Test map

| Unit | Seam | Tests: tier · file · command | E2E flows |
|---|---|---|---|
| Fiche domain | `@worktable/fiche` through the engine routes | integration · `packages/fiche/test/fiche.test.ts` · `bun test packages/fiche` — refusals first | fiche-edits |
| In-use rule + `ctx.exists` (engine) | `DELETE /api/rows/:dataset/:id`, a fixture writer calling `ctx.exists` | integration · `packages/engine/test/writes.test.ts` · `bun test packages/engine` — denial first: 409, table and revision unchanged; a soft-deleted referrer and a generic table do not count | referenced-delete-refused |
| Theatre parity (datasets, writers, voorstellingen, relations, seeds) | `@worktable/theatre` through the engine routes | integration · `packages/theatre/test/parity.test.ts` · `bun test packages/theatre` — refusals first | duplicate-assignment-refused, voorstellingen-public, referenced-delete-refused |
| Grid: select clear + row delete | the app against `/api` | unit · `apps/grid/src/api.test.ts`, `apps/grid/src/grid/store.test.ts`, `apps/grid/src/grid/Grid.test.tsx` · `bun run --filter @worktable/grid test` | select-clear-null, referenced-delete-refused |
| Gate | `bun run gate` | e2e · `e2e/step-0c.spec.ts` · `bun run e2e` | all |

E2E flows: **fiche-edits** — on the fiche grid (second engine `--domain @worktable/fiche` on 4312, Vite on 5175), open "Fiches", edit a fiche's `gemeente`, reload, it persists; enter a postcode `12` and see the writer's Dutch refusal. **referenced-delete-refused** — on theatre: open "Organisaties", open a venue that live activiteiten use, press Verwijderen then Zeker?: the response is 409 with `code: 'in_use'` and `by` holding the seeded counts, the notice shows the Dutch in-use sentence, the row stays, `GET /api/rows/organisatie` still holds it, `GET /api/revisions/organisatie/<id>` is unchanged; the same in "Producties" for a Productie with activiteiten. **duplicate-assignment-refused** — in "Toewijzingen", set a row's persoon to a person already assigned to the same activiteit: the cell shows the refusal, `GET` unchanged. **voorstellingen-public** — `GET /api/rows/voorstellingen` returns only rows whose activiteit is a bevestigde voorstelling (count matches the seed), each row has exactly the keys `id, productie, plandag, start, venue, adres` plus the engine's `custom`/`lookups` envelope, and the "Voorstellingen" view renders them. **select-clear-null** — clear a nullable select (Persoon `contract_type`), reload, the cell is empty and `GET` shows `null`; clearing a non-nullable select (Toewijzing `state`) shows the writer's refusal.

## Review Focus

1. Deleting a venue used by live activiteiten must answer 409 and write nothing (attack 1) → engine in-use tests + referenced-delete-refused.
2. The fiche must need no engine change → `git diff --stat main -- packages/engine` empty after Task 1; Task 1's report quotes it.
3. `voorstellingen` must not leak non-public columns (notities, status, omschrijving, ids other than `id`) → parity test asserts the exact column set.
4. A duplicate assignment on update must exclude the record itself (editing a row's notitie must not refuse) → parity test.
5. A soft-deleted referrer must not block a delete → engine test.

---

## Time log

| Task | Start | End |
|---|---|---|
| 1 | 2026-10-05 22:04 | 22:05 |
| 2 | 2026-10-05 22:09 | 22:14 |
| 3 | 2026-10-05 22:14 | 22:21 |
| 4 | 2026-10-05 22:22 | 22:31 |
| 5 | 2026-10-05 22:32 | 22:42 |

Final review and security audit 22:43–22:49; final fix wave 22:49–22:57. Agent wall-clock, not human days.

---

### Task 1: The fiche domain, with zero engine changes

**Files:**
- Create: `packages/fiche/src/datasets.ts`, `packages/fiche/src/writers.ts`, `packages/fiche/src/queries.ts`, `packages/fiche/src/queries/zichtbare_fiches.sql`, `packages/fiche/src/seed.ts`, `packages/fiche/test/fiche.test.ts`
- Modify: `packages/fiche/src/index.ts` (default export `Domain`), `packages/fiche/package.json` (`@worktable/engine` workspace dep, `test` script), root `package.json` (devDependency `@worktable/fiche`, as theatre has)
- Do not modify anything under `packages/engine/`.

**Interfaces:**
- Consumes: `@worktable/engine` (`defineDataset`, `defineQuery`, `Domain`, `Writer`, `refuse`) as theatre uses them.
- Produces: `@worktable/fiche` default export — dataset `fiche` per R1, writer `ficheWriter` (create/update/delete), query `zichtbare_fiches` (title `titel`, read-only), seeds incl. custom values (`talen` array, `crisisopvang` boolean) on some fiches, SavedViews "Fiches" (on `fiche`, sort `titel`) and "Zichtbare fiches".

- [ ] **Step 1: Refusal tests first** (through `createEngine` routes on a fresh db, each asserting 422, the Dutch message, `fiche` + `revision` unchanged): missing titel `"Titel is verplicht."`; type outside options `"Ongeldig type."`; postcode `12` `"Postcode moet vier cijfers hebben."`. Run → FAIL.
- [ ] **Step 2: Behaviour tests** — a PATCH of `gemeente` persists and is revised; `zichtbare_fiches` excludes `verborgen` fiches and orders by prioriteit desc then titel; `GET /api/rows/fiche?filter={"custom.crisisopvang":true}` returns only the seeded crisis fiches; `/schema` serves `fiche` writable and `zichtbare_fiches` read-only; `validateDomain` passes.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `bun install` first (new workspace dependencies; commit `bun.lock`), then `bun test packages` + `bun run check`; serve the fiche domain and paste `curl -s 127.0.0.1:4310/api/schema -H 'Host: 127.0.0.1:4310' | head -c 400`; paste `git diff --stat main -- packages/engine` (must be empty). If any engine change is needed, STOP: report BLOCKED with the change and why — the controller reports it to Stefan as a spec finding.
- [ ] **Step 5: Commit** — `feat(fiche): the Doorverwijsgids fiche as a second domain, on the unchanged engine`.

### Task 2: The in-use rule

**Files:**
- Modify: `packages/engine/src/writes.ts` (`inUse()` and its call in the delete branch; `exists()` in the write context), `packages/engine/src/declare.ts` (`WriteContext.exists`), `packages/engine/src/params.ts` (`ApiError` status union gains 409), `packages/engine/src/app.ts` (`/schema` gains `deletable: boolean` per source — a dataset whose writer has `delete`), `packages/engine/test/fixture.ts` (give `project` — the dataset `taak` and `notitie` reference — a writer with only `delete`, so it stays non-writable in `/schema`; its `delete` records that it ran; `notitie`'s writer refuses a duplicate `(project_id, tekst)` via `ctx.exists` with `exceptId` = the record — the existing no-op PATCH re-sending `tekst: 'eerste'` then doubles as the exclusion regression; a test-only writer path passes an undeclared key, copying the 500/internal pattern at `writes.test.ts:129`), `packages/engine/test/writes.test.ts`

**Interfaces:**
- Produces: 409 body `{ code: 'in_use', message, by: { label: string; count: number }[] }` — `message` an English fallback; `WriteContext.exists(dataset: string, match: Record<string, unknown>, exceptId?: number): boolean` — `dataset` must be a domain dataset (the guard `finder` uses; else throws), each `match` key a declared column (else throws), each value passed through `encode(column, value)` and bound, a `null` value refused (throws: a writer bug), live rows only, `id <> exceptId` when given; `/schema` `deletable` per source; `DELETE /api/rows/:dataset/:id` → 409 `{ code: 'in_use', message: 'Still referenced by <Label> (<n>)[, <Label> (<n>)]' }` when live referrers exist; `ApiError` status union gains 409.

- [ ] **Step 1: Denial tests first** — `delete of project 1 is 409 in_use with by = [{label:'Taken',count:2},{label:'Notities',count:1}] and the English fallback message; table and revision unchanged`; `on a 409 the referenced dataset's writer delete did not run`; `ctx.exists with an undeclared match key, or an unknown dataset (revision, saved_view), throws (500 internal), nothing written`. Run → FAIL.
- [ ] **Step 2: Behaviour tests** — `/schema marks a dataset whose writer has delete as deletable, others not`; `a soft-deleted referrer does not block`; `an unreferenced project, and one referenced only from a query, is deletable`; `Revision rows that name a project's id (entity/record_id) do not count as references`; `ctx.exists finds a live match, ignores soft-deleted rows and the excepted id`; `after the referrer is deleted, the delete succeeds and is revised`.
- [ ] **Step 3: Implement**, **Step 4: Run** `bun test packages` + `bun run check`, **Step 5: Commit** — `feat(engine): a referenced row cannot be soft-deleted (409 in_use); writers can ask whether a live row exists`.

### Task 3: Theatre parity

**Files:**
- Modify: `packages/theatre/src/datasets.ts` (organisatie, persoon, toewijzing, beschikbaarheid; `locatie_id` and `organisatie_id` as relations), `packages/theatre/src/writers.ts` (productie, organisatie, persoon, toewijzing, beschikbaarheid), `packages/theatre/src/queries.ts` + `packages/theatre/src/queries/voorstellingen.sql`, `packages/theatre/src/seed.ts` (insert order under foreign keys: organisatie → productie → activiteit → persoon → toewijzing, beschikbaarheid; `weergavenaam` written into persoon seeds, since seeds bypass writers; toewijzing seeds avoid activiteit 1 and no activiteit is added for productie 1 on 2026-10-12, so `writer.test.ts` and `theatre.test.ts` keep their expectations; new activiteit `omschrijving`s stay unique), `packages/theatre/src/index.ts`
- Create: `packages/theatre/test/parity.test.ts`
- Modify: existing theatre tests only where a new relation changes an expectation (state which)

**Interfaces:**
- Consumes: Task 2's in-use rule (delete of a venue or productie in use → 409) and `ctx.exists` (the toewijzing duplicate rule).
- Produces: datasets and writers per R3–R6, R8; `voorstellingen` per R7 — `SELECT a.id, p.titel AS productie, a.plandag, substr(a.start_at, 12, 5) AS start, o.naam AS venue, o.adres FROM activiteit a JOIN productie p ON p.id = a.productie_id AND p.deleted_at IS NULL LEFT JOIN organisatie o ON o.id = a.locatie_id AND o.deleted_at IS NULL WHERE a.deleted_at IS NULL AND a.soort = 'voorstelling' AND a.status = 'bevestigd'`, title `productie`, date `plandag`, read-only; SavedViews per R8 plus "Producties" (invented, pending Stefan: the gate's Productie delete needs a view to open it from). Toewijzing declares indexes `[['persoon_id'], ['activiteit_id']]` (`docs/SPEC.md` Storage). Writers with `delete`: productie, organisatie, persoon, toewijzing, beschikbaarheid. The duplicate rule merges `{ ...ctx.current, ...values }` (never `??`: an explicit `persoon_id: null` switches to name-only) and calls `ctx.exists('toewijzing', { persoon_id, activiteit_id }, ctx.current?.id)` only when `persoon_id` is set. Messages: `"Kies een persoon of een naam, niet allebei."`, `"Deze persoon is al toegewezen aan deze activiteit."`, `"Ongeldige status."` (reuse for state), `"Naam is verplicht."`, `"Ongeldige soort."`, `"Voornaam en achternaam zijn verplicht."`, `"Ongeldig e-mailadres."`, `"Einde ligt voor de start."`, `"Titel is verplicht."`, `"Organisatie bestaat niet."`, `"Persoon bestaat niet."`, `"Activiteit bestaat niet."`.

- [ ] **Step 1: Refusal tests first** (through the routes; 422 + message + tables and revision unchanged): toewijzing with both persoon and naam, with neither; duplicate persoon on the same activiteit (create; update moving persoon onto a taken one; update moving activiteit_id onto an activiteit where that persoon is already assigned); state outside options; beschikbaarheid end before start; persoon missing achternaam, bad email; organisatie missing naam, bad soort; productie missing titel. Run → FAIL.
- [ ] **Step 2: Behaviour tests** — updating a toewijzing's notitie does not trip the duplicate rule; two name-only rows on one activiteit are allowed; persoon `weergavenaam` is derived and readonly; deleting an organisatie used as a venue is 409 and one used by nobody succeeds; deleting a productie with activiteiten is 409; `voorstellingen` holds only bevestigde voorstellingen and exactly the columns `id, productie, plandag, start, venue, adres`; a show without venue is listed with null venue; `validateDomain` passes with the new relations.
- [ ] **Step 3: Implement**, **Step 4: Run** `bun test packages` + `bun run check`, **Step 5: Commit** — `feat(theatre): Organisatie, Persoon, Toewijzing, Beschikbaarheid and voorstellingen at Laika parity`.

### Task 4: Grid — clearing a select, deleting a row

**Files:**
- Modify: `apps/grid/src/engine.ts` (`wireValue`: `''` → `null` for a nullable text column with options), `apps/grid/src/grid/store.ts` (`remove(id)`: calls `api.remove`; success drops the row; a refusal sets `state.error` with the engine's message, row kept), `apps/grid/src/grid/hooks.ts` (pass `api.remove`), `apps/grid/src/grid/Grid.tsx` (the drawer's `editor` slot gets a "Verwijderen" button when `model.deletable`), `apps/grid/src/engine.ts` + `types.ts` (read `/schema`'s `deletable` into the model), `apps/grid/src/i18n.ts` (`delete` = "Verwijderen", `deleteConfirm` = "Zeker?", and an `inUse` sentence built from `by`, e.g. "Nog in gebruik door Activiteiten (3) en Personen (1)."), tests
- Modify: `specs/step-0a/wp-assumptions.md` — add a 0c block: any row this task pays or reaches (e.g. the store's write rules, `remove()` from `api.ts:…`), with numstat lines.

**Interfaces:**
- Consumes: Task 2's 409 `{code:'in_use', message}`, `/schema` `deletable`.
- Produces: `Store.remove(id: number): Promise<void>`; `StoreApi.remove` is optional (existing store-test mocks stay valid). After a removal the store drops undo entries for that row (an undo would PATCH a soft-deleted id).

- [ ] **Step 1: Tests first** — `api.test.ts`: clearing a nullable select sends `null`; clearing a non-nullable select still sends `''`. `store.test.ts`: `remove` drops the row and its undo entries on 200; on 409 keeps the row and sets the error to the Dutch `inUse` sentence built from `by`; on 422 to the writer's message. `Grid.test.tsx`: the drawer shows Verwijderen only when the model is deletable; the first press turns it into "Zeker?" and sends nothing; the second press calls remove; leaving the drawer resets it. Run → FAIL.
- [ ] **Step 2: Implement**, **Step 3: Ledger**, **Step 4: Run** `bun run --filter @worktable/grid test` + `bun run check`, **Step 5: Commit** — `feat(grid): clearing a nullable select sends null; delete a row from its drawer`.

### Task 5: The browser gate

**Files:**
- Create: `e2e/step-0c.spec.ts`
- Modify: `playwright.config.ts` (two more webServers: engine `--domain @worktable/fiche --db e2e/.tmp/fiche.db --port 4312 --fresh` and Vite on 5175 with `ENGINE_URL=http://127.0.0.1:4312`), `e2e/step-0a.spec.ts` / `e2e/step-0b.spec.ts` only if new seeds change an earlier assertion (state which)

- [ ] **Step 1: Write the five flows** named in the Test map; each uses its own rows; no sleeps.
- [ ] **Step 2: Run** `rm -rf e2e/.tmp && bun run e2e` → all pass (0a + 0b + 0c); `bun run gate` → 0.
- [ ] **Step 3: Commit** — `test(e2e): step 0c gate in a real browser`.

Then stop: the Close (whole-branch review + security-sentinel, one fix wave) and the report.
