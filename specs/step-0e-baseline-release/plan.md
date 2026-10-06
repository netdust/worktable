# Step 0e U7: a baseline release without views, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- ntdst-baseline's `main` reaches its own release v2.15.1, which already carries no views module.
- One changelog note says that 2.13 and 2.14 were views-only and that the module moved to Worktable. It ships as v2.15.2.
- The views branches are archived as tags.
- Nothing is pushed before Stefan confirms.

**Architecture:** This is git and one README edit; there is no code.
- Verified 2026-10-06: `origin/main` (3ced762) is an ancestor of v2.15.1 (ba44a50), 10 commits back, all of them duplicate-module work.
- `git ls-tree v2.15.1 services/` has no `views`.
- `origin/main..v2.14.0` is 58 commits, every one views work.

**Tech Stack:** git, Composer, PHPUnit (baseline's `composer gate`).

**Spec:** `specs/step-0e/spec.md` U7 in the worktable repo. On execution, this plan is copied to baseline's `specs/drop-views/plan.md` in the changelog commit.

**Repository and branch:** `/home/ntdst/Sites/ntdst-baseline` (a library repo with no `site.yml`, so no devops verbs). It is checked out on `feature/seo-archives-og`, and that checkout is left alone. The work happens in a new worktree, `/home/ntdst/Sites/worktrees/ntdst-baseline-drop-views`, on `feature/drop-views` from v2.15.1.

**Simplest design:** Do nothing in baseline: v2.15.1 already is the release without views. Rejected, because Stefan's brief asks for the views module's removal to be explicit. `main` lagging its own release and live views branches leave the next person to guess. The plan adds exactly one note and moves refs; no code changes.

## Decisions
- **No v2.16.0.** The spec's U7 was rescoped on 2026-10-06 when the repo turned out to hold the release already. A docs-only change ships as patch v2.15.2.
- **Archived as tags,** not deleted: `archive/views` (`feature/views`), `archive/views-saved` and `archive/views-matrix`. Deleting the branches and the worktrees `/home/ntdst/Sites/worktrees/ntdst-baseline-views` and `-saved` is left to Stefan. A worktree holds its branch, and a deletion is his call.
- **What the changelog note says:**
  - 2.13.0 and 2.14.0 are views-only releases cut from the `feature/views*` line.
  - 2.15.x does not contain `services/views`.
  - The planning views moved to Worktable.
  - A site still using them stays on `~2.14.0` until its cutover.
- **Laika's constraint is not touched.** Its `^2.13` already admits 2.15.x, and so would drop views on a `composer update`. That trap is reported to Stefan, not fixed here: the constraint moves at the cutover.

## Global Constraints
- Nothing is pushed (branch, `main`, tags) until Stefan types his confirmation in the session: it reaches every consumer through composer.
- `main` moves only by fast-forward. If it is no longer an ancestor of v2.15.1 when the plan runs, stop.
- No `git stash`. Each step runs in the worktree.
- Each task logs its start and end time in the copied plan's Time log.

## Threat model
Not a security surface.

## Test map

| Unit | Seam | Tests: tier · file · command | E2E flows |
|---|---|---|---|
| The release tree | baseline's suite on `feature/drop-views` | unit · baseline `tests/` · `composer gate` in the worktree | none |
| No views in the release | `git ls-tree -r --name-only HEAD services \| grep -c '^services/views/'` → `0` | check · quoted in the task report | none |

## Review Focus
1. `main` moves by fast-forward only: quote `git merge-base --is-ancestor origin/main v2.15.1` → 0.
2. The tag points at the changelog commit, not v2.15.1: quote `git rev-parse v2.15.2^{commit}`.
3. Each archive tag names its branch's exact tip: quote the three `rev-parse` pairs.

---

### Task 1: The note, the tags, and the stop
- [ ] **Step 1: Verify the premises.**
  - `git fetch`;
  - `git merge-base --is-ancestor origin/main v2.15.1`;
  - `git ls-tree v2.15.1 services/`.

  Quote all three. Stop if any differs from Architecture.
- [ ] **Step 2: Create the worktree** on `feature/drop-views` from v2.15.1. Run `composer install` and `composer gate`, and quote the result.
- [ ] **Step 3: Write the changelog note** (Decisions) at the top of README's `## Changelog` as the 2.15.2 entry, with the version bumped where 2.15.1 bumped it (`git show v2.15.1 --stat` names the files). Copy this plan into `specs/drop-views/plan.md`. Run `composer gate` and commit: `docs: 2.15.2 — the views module left for Worktable`.
- [ ] **Step 4: Create locally:**
  - the tag `v2.15.2` on that commit;
  - `archive/views*` tags on the three branch tips;
  - a local `main` fast-forwarded to `feature/drop-views`, made inside the worktree with `git branch -f main feature/drop-views`. That is safe because `main` is not checked out anywhere; verify with `git worktree list` first.
- [ ] **Step 5: Stop.** Show Stefan:
  - `git log --oneline origin/main..main`;
  - the four new tags;
  - the push command: `git push origin main feature/drop-views v2.15.2 archive/views archive/views-saved archive/views-matrix`.

  Push only on his typed confirmation.
