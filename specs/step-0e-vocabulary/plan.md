# Step 0e U3: the vocabulary check in the gate, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `bun run check` fails when a domain word appears anywhere in `packages/engine`, in its source, comments or tests.

**Architecture:**
- **Where it lives:** a new `scripts/check-vocabulary.ts`, run by `bun run check` after the boundary check.
- **The word list:** built at run time from the domain packages' declarations, so it grows with every dataset a domain adds. It covers what the spec names (dataset, query and column names), each split on `_`, plus a fixed list. Option keys and saved-view names are left out: they would add words like `plan` and `open` and gain nothing the column names miss (plan review S5). Words of two letters or fewer are dropped, and so is every word in a committed allowlist of generic English words that a domain also happens to use (`status`, `type`, `start`, `default`, …).
- **How a file is read:** each file in `packages/engine` is split into words on non-letters and camelCase boundaries, case-insensitively. Each hit is reported with its file and line.
- **The test fixtures:** the engine's own tests use Dutch fixture words today (`naam`, `omschrijving`, `dag`, `persoon`, `notitie`…). They are renamed to English first.
- **First working version:** Task 1. `bun scripts/check-vocabulary.ts` lists today's hits.

**Tech Stack:** Bun 1.3, TypeScript, `bun test`.

**Spec:** `specs/step-0e/spec.md`, U3 (parent: `docs/SPEC.md`, "The one refusal" and the package layout's lint check).

**Branch:** `feature/step-0e-vocabulary`, from `main` after the migrator merges and before auth. It renames the engine's test fixtures, which auth then rewrites, so it lands first to avoid a conflict over every test file.

**Simplest design:**
- **A fixed, hand-written list** (persoon, activiteit, productie, fiche…) is simplest. But it silently misses the next domain's words, and the spec's rule is "no domain word", not "none of these words". Deriving the list from the declarations costs one import of each domain package, which the script may do: `scripts/` is not `packages/engine`.
- **The allowlist** exists because domains reuse generic English names (`status`, `type`). Without it the engine could not say `status` in an HTTP reply.

## Decisions
- **Scope.** It covers every file under `packages/engine` except `node_modules`: source, tests and `package.json`. That includes comments (spec U3: "Comments and tests are checked too").
- **The fixed list** adds the spec's domain nouns the declarations might not yet carry: `activiteit`, `toewijzing`, `beschikbaarheid`, `productie`, `persoon`, `organisatie`, `voorstelling`, `fiche`, `speelreeks`, `sjabloon`.
- **The allowlist** is `scripts/vocabulary-allow.txt`, one word per line, each with a reason after `#`. Adding a word to it is a reviewed change. The later 0e plans each add their own words with reasons: `email` (auth: the account's address; fiche declares an `email` column) and `legacy`, `post` (import: `legacy_post_id`; `app.post(` is Hono's).
- **Engine test fixtures become English:** `project`/`task` with `name`, `description`, `day`, `note`; the matrix fixture becomes `person`→`member`, `reason`, …. The renaming is mechanical, and every assertion keeps its meaning. Test-side hits that are generic English (`open`, `state`, `start`, `parameters`, `per`) are allowlisted with a reason where they are used as English, and renamed where they are a domain word (plan review N4).

## Global Constraints
- No behaviour change in `packages/engine/src`. Its words are already clean apart from allowlisted generic English: the hits in `src` were `default`, `site`, `status`, `type` and `per` on 2026-10-06, and the migrator plan adds `plan` (in `planChange`), which only appears in option keys, so the spec-scoped list does not include it.
- The fiche and theatre packages are not touched.
- `docs/SPEC.md` is never committed; the rule's wording goes into `specs/step-0e/spec-diff.md`.
- Each task logs its start and end time in the Time log.

## Threat model
Not a security surface.

## Test map

| Unit | Seam | Tests: tier · file · command | E2E flows |
|---|---|---|---|
| Vocabulary check | `bun scripts/check-vocabulary.ts [--root <dir>]` exit code and output | integration · `scripts/check-vocabulary.test.ts` · `bun test scripts` | none |
| Engine fixtures in English | the existing engine suite | the existing `bun test packages/engine`, which must stay at the same test count | none |

## Review Focus
1. A domain word inside an identifier is caught: `persoonId` and `persoon_id` both hit → the planted-word tests.
2. A comment hit is caught → a planted comment.
3. An allowlisted word passes, and a word added to a domain's declarations is caught without editing the script → a test with a temporary domain module passed by `--domain`.
4. The engine suite keeps its count after renaming. Quote the before and after counts.

## Time log

| Task | Start | End |
|---|---|---|

---

### Task 1: The check, with its own test

**Files:**
- Create: `scripts/check-vocabulary.ts`, `scripts/vocabulary-allow.txt`, `scripts/check-vocabulary.test.ts`.
- Modify: `package.json` (`check` runs it after `check-boundaries.ts`; `test` and `gate` both become `bun test packages scripts`, since `gate` calls `bun test packages` directly, plan review S6).

**Interfaces:**
- Produces: `bun scripts/check-vocabulary.ts [--root <dir>] [--domain <module>…]`.
  - `--root` defaults to `packages/engine`.
  - `--domain` defaults to `@worktable/theatre` and `@worktable/fiche`.
  - Exit 0 prints `vocabulary: packages/engine holds no domain word`.
  - Exit 1 prints one `path:line  word` line per hit.

- [ ] **Step 1: Tests.** Each case uses a temporary directory as `--root`:
  - `const persoonId = 1` → exit 1 naming `persoon`;
  - `// the toewijzing case` → exit 1;
  - `status` → exit 0;
  - a temporary domain module declaring dataset `zending` plus a file holding `zending` → exit 1;
  - an empty directory → exit 0.

  Run → FAIL.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** it against the real tree and record the hit list in the task report. It is expected red: the engine tests' Dutch fixtures.
- [ ] **Step 4: Commit,** with `check` not yet wired. `feat(scripts): the vocabulary check, derived from the domain declarations`.

### Task 2: English engine fixtures, then wire the check into the gate

**Files:**
- Modify: `packages/engine/test/*.ts`, every file the Task 1 report lists; `package.json`.

- [ ] **Step 1:** Record `bun test packages/engine`'s test count.
- [ ] **Step 2:** Rename the fixture words to English across the engine tests (Decisions). Change no assertion's meaning.
- [ ] **Step 3: Run** `bun test packages/engine`: the same count, all passing. `bun scripts/check-vocabulary.ts` → exit 0.
- [ ] **Step 4:** Wire it into `check`. Run `rm -rf e2e/.tmp && bun run gate` → PASS, and quote the counts.
- [ ] **Step 5:** Append the rule's wording to `specs/step-0e/spec-diff.md`. Commit: `test(engine): English fixtures; the vocabulary check joins the gate`.
