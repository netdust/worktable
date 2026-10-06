# Review: step-0d

Branch `feature/step-0d`, range c2f5ee0..21d3a26 before the fix wave. Two reviewers ran on the most capable model on 2026-10-06, after all eight tasks passed their task reviews: the whole-branch review (superpowers code-reviewer) and `security-sentinel` (the plan carries a threat model). Both were read-only, and neither wrote the code.

## Whole-branch review: "Ready to promote: with fixes"
- **Strengths:** the engine/domain boundary is clean; the saved-view routes match the threat model; the matrix path holds from end to end; titles through a relation resolve on read; fixed filters are merged per key in one place.
- **Important 1: datetime columns sorted and exported on their formatted text.** `useTable` `sortValue` had no datetime case, and the export wrote "Wed 14/10 00:30" with no year. This broke R7, and ledger row 42's claim was false.
  - **The ruling it reversed:** the controller's Task 6 ruling had fixed the e2e test instead of this product bug. The reviewer challenged that ruling, and it was reopened.
  - **Fixed:** sort and export use the stored value, with RED→GREEN unit tests, and row 42 was corrected (57 production lines).
- **Important 2: a test helper that didn't wait.** The e2e `columnIndex` read the header once without waiting after a reload. This was the most likely source of the intermittent gate failure. **Fixed:** `columnIndex` and `open`/`pick` now wait for the target view's own content.
- **Minors:**
  - A misplaced docblock. **Fixed.**
  - Hidden custom columns are not stored. **Documented.**
  - The relation-beyond-page assertion was exact. **Loosened** to coverage.
  - Datetime grouping is not offered. **Deferred.**
- **Rulings challenged:** the Task 6 ruling, above. The controller's flake ruling (traces, a 120 s server start, no retries) stands; its premise was weaker than the `columnIndex` race.

## Security audit: no Critical, no High
- **M1: an over-long or duplicated sort list.** It saved with a 201, then made every later read of that view a 500. **Fixed:** a 16-key cap with no duplicates in `parseSort` and `viewBody`, for `sort` and `visible_fields`.
- **L1: the `?cells=1` window had no width limit.** **Fixed:** 400 `window_too_wide` over 92 days.
- **L2: a non-finite filter value.** It was validated, then stored as null. **Fixed:** a filter that changes on a JSON round trip is refused.
- **L3: restore revealed which deleted views exist.** **Fixed:** a deleted view that is not the caller's answers 404.
- **L4: control and bidi characters in view names.** **Fixed:** refused.
- **L5: views from a pre-0d database have no owner, and actor 0 owns everything until auth.** **Deferred** to the auth step, and recorded in the plan.
- **Info:**
  - `readDb` took raw SQL. **Fixed:** it takes bound parameters.
  - Browser layout keys are not namespaced per database. **Deferred.**
- **Mitigations 1–7:** verified. Attack 3's gap is closed by M1.

## Fix wave and re-review
- **Commits:** 9196aca (engine), f926775 (grid), 08d3f80 (e2e), 9965317 (docs).
- **Testing:** each code fix went RED→GREEN.
- **Re-review:** a scoped re-review on the most capable model found all 13 items addressed and no new breakage.
- **The plan's threat-model text** was updated afterwards (attack 1's deleted-view 404; the key, finite-number, name-character and window caps).
- **Gate:** the controller ran `rm -rf e2e/.tmp && bun run gate` three times. All three were green: 435 package tests, 552 grid tests, 33 e2e flows.

## Residual minors
- The 16-key cap on `visible_fields` would stop a future source with more than 16 columns from being saved from the grid.
- `-0` in a filter is refused, with an inexact message.
- A name containing a ZWJ emoji is refused (`\p{Cf}`).
- `header()` builds a RegExp from the label without escaping it.
- A hand-edited hash with a matrix window over 92 days gets a 400.
