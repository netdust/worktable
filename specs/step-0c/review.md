# Review: step-0c

Branch `feature/step-0c`, range 5fa7cbe..f745270 before the fix wave. Two reviewers ran on the most capable model on 2026-10-05, after all five tasks passed their task reviews: the whole-branch review (superpowers code-reviewer) and `security-sentinel` (the plan carries a threat model). Both were read-only, and neither wrote the code.

## Whole-branch review: "Ready to promote: with fixes"

**What the reviewer verified itself:**
- `git diff --stat main 9f4f0dd -- packages/engine` is empty: the fiche needed no engine change.
- On a fresh run: `bun run check` passes, packages 248/248, grid 511/511, e2e 22/22.
- No domain word appears in the engine.
- The ledger's 0c counts match numstat.

**Strengths:**
- The in-use rule is small, generic and inside the transaction.
- The delete path holds end to end.
- The Laika parity rules match the PHP source.
- Seeds respect the foreign keys.
- Tests are behavioural.

**Important**
- **I1: `voorstellingen` published the day-line `plandag` as the show's date.** A show starting 2026-10-14 00:30 appeared on a website calendar as 13 October. **Fixed** under a controller ruling: `docs/SPEC.md` asks for the show's "date", and the spec of record wins over step 0c's R7. The view publishes `datum` (the calendar day), and the parity and e2e tests pin it.

**Minor**
- **M2:** the theatre writers judge cross-field rules on every write, while Laika judged only writes that touched those fields. Recorded as an import deferral for step 0e.
- **M3:** a site `error.in_use` string would override the sentence built from `by`. Recorded as a deferral.
- **M4:** a 404 on delete left a dead row. **Fixed:** the row is dropped.

**Rulings challenged:** none. Two items must reach Stefan:
- the persoon↔naam dead end in the grid (finding 7);
- the self-reference deferral.

## Security audit: no Critical, no High

- **M1:** when auth lands, the in-use check runs before the writer's delete decision, so a 409 could leak dataset labels and counts to an actor who may not delete. Recorded as a deferral: authorization runs before `inUse()`, and `by` is filtered to readable datasets.
- **L1:** `ctx.exists` did not type-check values; bun:sqlite reinterprets arrays and objects. **Fixed.**
- **L2:** a malformed `by` could wedge the grid's save state. **Fixed:** bad entries are filtered.
- **L3:** the fiche's `website` and `email` were free text, which becomes stored XSS once links render. **Fixed:** `http(s)://` and `@` are required when filled.
- **L4:** the write transaction was DEFERRED. **Fixed:** it is IMMEDIATE.
- **Info:** relations stored in custom fields will not block a delete. Recorded as a deferral.

**Mitigations 1–5:** verified. Threat 2 (the race) is verified by construction, with no denial test.

## Fix wave and re-review

- **Commits:**
  - 9b74573: engine, `exists` type-check and IMMEDIATE.
  - 7597862: theatre, `datum`.
  - b142996: fiche, website and email.
  - fc51945: grid, `by` filter and 404.
  - 86f584f: plan deferrals and time log.

  Each fix went RED→GREEN.
- **Re-review:** a scoped re-review on the most capable model found all eight items addressed and no new breakage.
- **Gate:** the controller re-ran `rm -rf e2e/.tmp && bun run gate`: exit 0, with packages 254, grid 513, e2e 22.

**Residual minors, deferred:**
- Attack 2's prose does not mention IMMEDIATE.
- A dev database seeded before the fix keeps a SavedView that names `plandag`; reseed with `--fresh`.
- Focus lands on `<body>` after a successful delete (an a11y follow-up).
