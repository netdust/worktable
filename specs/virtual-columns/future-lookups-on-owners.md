# Future finding: lookups on datasets with owners

Status: not built, not planned. Recorded 2026-10-10 at Stefan's request ("Add the lookups-on-owner-datasets limit as a future finding"), from the read-only lookup report before the step 2b merge.

## The limit today
- Validation refuses `lookups` on a dataset that declares `owners` (`packages/engine/src/validate.ts`, `checkLookups`; `docs/SPEC.md` Dataset row: "A dataset that declares `owners` declares no lookups, so an owner still reads only titles through a relation").
- So no owner account, link actor or view for owners ever reads a lookup. Theatre's owned datasets (`persoon`, `toewijzing`, `beschikbaarheid`) carry none; step 3 cannot put a lookup on Toewijzing or Beschikbaarheid without lifting this.

## Why the limit exists
Lifting the refusal alone opens two leaks, both shown by the probes now kept in `packages/engine/test/lookups-privacy.test.ts`:
1. **The filter oracle.** Under an owner scope `readRows` drops lookup values from the select (`rows.ts`, lookups only under scope `all`), but a filter or sort on a lookup still compiles (`filter.ts` `resolveKey`, `rows.ts` `orderOf`). An owner could filter `{ <lookup>: <guess> }` and learn the hidden value from which of its own rows come back.
2. **Fields of records the owner may not read.** A lookup exposes a field of the related record, not only its title. Today an owner reads titles through a relation and nothing else (SPEC Dataset row); a lookup would break that rule unless the target field is itself owner-visible on a record the owner can read.

## What lifting it would need
- `filter.ts` and `orderOf` refuse a lookup key under any scope other than `all`, unless the lookup is marked for owners.
- A lookup marked `owner_visible` only when its target field is `owner_visible` and the target dataset is readable by the owner, checked by validation; `holdKeys` and the owner-view publish check (`forOwnersProblem`) accept such a lookup key and nothing else.
- The owner-view leak test extended to an owned dataset with an owner-visible lookup.
- A spec line in `docs/SPEC.md` first.

## When to revisit
When a domain needs a related field on an owner's own rows, for example a person's page showing the venue of each of their assignments. Until then `mijn_producties`-style queries carry such fields as owner-visible text.
