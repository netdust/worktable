# Feature review: virtual-columns (step 2b)

Branch `feature/virtual-columns`, d834274..9436889 (20 commits, including the parked one-planning commits). Two reviewers: superpowers' whole-branch review on the most capable model, and `security-sentinel` (the write path parses input and the plan carries a threat model). Gate at 9436889: `bun run gate` exit 0, Playwright 176/176.

## Verdicts
- Whole-branch: **ready to merge with fixes**. Correct, matches spec and plan, threat mitigations hold.
- Security: **no Blocking**. All five threat-model rows hold in the code.

## Fix pass (one wave)

| # | From | Finding | Disposition |
|---|---|---|---|
| S1 | security, Should fix | `expectFromService` runs on the raw body before `ownBody` (`writes.ts:556` vs `:469`): a service could write a lifecycle column through an inherited lookup without `expect`. `checkLookups` does not stop `own` being the lifecycle column. | fix: rename before `expectFromService`; `checkLookups` refuses an `own` that is readonly, the lifecycle column, the record_link email column, or not nullable; RED test |
| S2 | security, Should fix | import's legacy-id remap reads `dataset.columns[key]` only (`import.ts:136-143`). | fix: prove import refuses a lookup key (test); refuse it if not |
| I1 | whole-branch, Important | `real-data.md`: step 5's start command lacks `--link-secret-file`/`--app-url`/`--outbox`; step 4 omits the removals of "Per productie per dag" and "Optie of bevestigd" a main-era copy will print. | fix |
| I2 | whole-branch, Important | Step 2b's browser gate (spec "Done when" 1-3) is not yet driven. | `/shakeout` after this fix pass (house process) |
| m1 | whole-branch | readonly or NOT NULL `own` accepted | fix (with S1) |
| m-dup | ledger T4, both reviewers | two inherited lookups sharing one `own` | fix: refused at declaration |
| m2 | whole-branch | an inherited lookup without `from` is never greyed | fix: `from` required when `own` is set |
| m3 | whole-branch | optimistic paint keeps a stale `row.inherited` (`grid/store.ts:183`) | fix |
| m5 | whole-branch | SPEC does not name the boolean refusal | fix: one clause |
| m7 | whole-branch | stale dagplanning names in e2e helpers and test names | fix |
| M1 | security | lookups trust "only owners are restricted" | fix: `servedLookups` filtered by `readable` on the target; no `lookupSelect` when scope is not `all` |
| M2 | security, T4 | `ownBody` assigns `out[key]` | fix: `Object.fromEntries` |
| M4 | security | `publicRows` does not re-check the source is a query | fix: one-line kind check |
| m4 | whole-branch | a draft showing both Locatie and Eigen locatie can collect both → 400 | parked: the seeded Planning shows only `locatie`; a view showing both is a user's own choice and the 400 names the conflict |
| m6 | whole-branch | OpenAPI lists no lookups | parked: the spec does not require it (plan review M9) |
| M5, M6 | security | subquery cost; orphan view names in the operator report | noted, no change |

Deferred minors fine to leave (whole-branch triage): subquery evaluated twice, via message wording, `targetOf` typing, the `never` cast, GridBar and react-aria flakes, `orderOf` guard, `expectedOf` on a lifecycle lookup (closed by S1's refusal), revision assertion, RED not captured, stale dagplanning SQL view, matrix biome warning, smoke retarget, redundant rail-tree count.

## Ledger rulings, judged sound by the whole-branch reviewer
Matrix/link/history rows carry no lookups; one red commit T2→T3; lower-case "via tourstop"; `visible_fields` capped at the source's field count; no SPEC edit for the cap; import refuses lookup keys; Planning cannot be published (Stefan to hear this explicitly); orphaned user views hidden but kept; `owner-has-no-dagplanning` keeps its name.
