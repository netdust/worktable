# Review: step-0b

Branch `feature/step-0b`, range d4837b7..3d21080 before the fix wave. Two reviewers ran on the most capable model on 2026-10-05, after all five tasks passed their task reviews: a whole-branch review (superpowers code-reviewer) and `security-sentinel` (the plan carries a threat model). Both were read-only, and neither wrote the code.

## Whole-branch review: "Ready to promote: with fixes"

**Strengths:**
- The write path follows the plan's order inside one transaction.
- Every threat-model mitigation lives in its named home.
- The engine/domain boundary is clean.
- Routing by `row[key]` is proven with `id ≠ key`.
- The browser gate proves the cross-site refusal unconditionally.

**Important**
- **I1:** a relation edit could never be stored. The grid sent the ntdst-core list shape `[id]`, and the engine refused it as not an integer. This also blocked "+ New" on activiteit, and ledger row 41 wrongly said nothing WordPress was left. **Fixed:** the adapter's wire format is type-aware; the new ledger row 60 records the assumption; e2e `relation-pick` covers it.
- **I2:** clearing any nullable non-text cell sent `''`. This is the gate's defect 1, and it is broader than the datetime case. **Fixed** in the same seam: `''` becomes `null`, and e2e `clear-end` covers it.

**Minor**
- **M3:** end-before-start compared `HH:mm` and `HH:mm:ss` as strings. **Fixed** in the theatre writer.
- **M4:** `records()` reads at most 5000 rows per target. Recorded as a deferral.
- **M5:** the dagplanning status cell showed the raw key. **Fixed** with defect 2.

**Known defects from the gate:**
- **(1) datetime clear:** confirmed and broader. Fixed (I2).
- **(2) dagplanning status as plain text:** confirmed. Fixed: a mapped column inherits its target's options and relation.
- **(3) revisions as JSON text:** confirmed. Fixed: decoded on read, still stored as JSON text.

**The ledger:** the headline and row 9's credit are corrected, and the missing `row[key]` guard is added.

**Ruling challenged:** R5, R8 and R9 are built, but the `docs/SPEC.md` diff that names them is not applied. It must not be promoted silently. This is raised to Stefan as a promotion condition.

## Security audit: no Critical, no High

- **M1:** on the proxied path, `changeOrigin` hides the Host from the engine, so DNS rebinding was stopped only by Vite's untested default `allowedHosts`. **Fixed:** pinned explicitly, e2e `rebound-host-refused` added, and mitigation 9's home corrected.
- **M2:** a browser that sends no `Sec-Fetch-Site` could write cross-site through the proxy. **Fixed:** a request that carries `Origin` without `Sec-Fetch-Site` is refused (fails closed). curl and scripts are still allowed.
- **L1:** an update does not re-check a relation column it leaves untouched. Recorded as a Decision; productie has no writer in 0b.
- **L2:** `Sec-Fetch-Site` was compared case-sensitively. **Fixed.**
- **L3:** the guard covered only `/rows/*`. **Fixed:** it now covers every write method under `/api`.
- **L4:** `/revisions` was unbounded. **Fixed:** capped at 5000, and a dataset without a writer gives 404.
- **L5:** the forged-audit test had a gap. **Fixed.**
- **L6:** a writer's bad output answers 400, not 500. Deferred; writer code is trusted.

**Mitigations 1–10:** all verified after the fix wave, each with its denial test.

## Fix wave and re-review

- **Commits:** c15985e (engine), 447f1c5 (theatre), bf76951 (grid), 82f78c1 (e2e and Vite), 4ee8105 (docs). Each fix went RED→GREEN, except items 8 and 9, whose behaviour already held. Those tests were added and pass.
- **Re-review:** a scoped re-review on the most capable model found every item addressed and no new breakage.
- **Gate:** `rm -rf e2e/.tmp && bun run gate` exits 0: 188 package tests, 496 grid tests and 14 Playwright flows. The controller re-ran it independently.

**Residual minors, deferred:**
- A cleared text select (status) still sends `''` and is refused as not an option.
- On plain http with a non-loopback hostname, the grid's own writes would carry `Origin` without `Sec-Fetch-Site` and be refused. This cannot happen under today's 127.0.0.1 bind.
- Attack 9's prose still names `app.ts` alone; its mitigation-home line names both.
- Ledger row 46 says "done … 0 lines" while the headline calls it reclassified.
