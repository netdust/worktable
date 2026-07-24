# worktable run ledger

One entry per flow-driven delivery. THEORY.md argues; this measures.

---

## Run 0001 — dossier: gezondleven-be (deliver@... via netdust-flow)

**Delivered:** a prospect dossier — Vlaams Instituut Gezond Leven as a
StrideLMS lead. Research → gated draft → attested review → owner seal.
**Eval:** 5 stops, gates all first-pass in the journal.
**Headline:** the independent reviewer returned FINDINGS on the first
draft (3: an unsourced "per-seat" premise under the headline cost
argument, a VAD claim overreaching its source, an untraced catalog
fact). Fixed, re-sourced, re-reviewed CLEAN on the exact tree, then
sealed. Three claims that would have been wrong in front of the
prospect, caught before the owner saw them.
**Findings (system):** F1 — the flow verified artifacts but did not
mechanically move `status` (moved manually post-seal). F2 — the
FINDINGS→fix→CLEAN review loop ran between stops, so the journal
recorded a clean first-pass and the real iteration was invisible to
the eval.
**Adaptations shipped after:** bin/gate-then-status.py + dossier flow
v2 (gates now move status, fail-closed); AGENTS.md red-review
discipline (route through the gate so the journal sees it).

---

## Run 0002 — the worktable server (deliver via netdust-flow)

**Delivered:** server.py — phase-2a: a derived index over the folder
plus the one guarded write (the owner's seal). One file, Python
stdlib, six read endpoints + POST /seal, owner-token auth, SSE
invalidation, survival-test by construction. 35-check dependency-free
suite booting the real server over HTTP.
**Method:** full deliver road with craft dispatched — planner
subagent for the plan, two fresh-context reviewers (security-sentinel,
reviewer) as tree-bound attested evidence (I5). Floor-class work
(auth), so the owner sealed the plan before any code and the
shake-out after a live demo on the real repo.
**Eval:** plan gate first-pass; build looped; the review cluster did
its job.
**Headline — the review caught a HIGH with passing tests:** the
correctness reviewer found that view `sort: updated desc` (the space
syntax the real view file uses) was a silent no-op — records came
back in folder order — AND that the test "covering" it was fake: the
fixture used the same broken syntax and the expected order coincided
with alphabetical folder order. 8 findings total (1 high, 1
security-low, the rest medium/low), all fixed and independently
re-verified CLEAN on the fixed tree. The new sort test is proven to
fail on the reintroduced bug — closing run 0001's F2 blindspot in
the same stroke.
**Why it matters:** worktable's own server, built through worktable's
own protocol, and the process caught the defect the process's own
tests missed. External verification beats self-verification —
observed on the system's own body, in the domain it would be most
blind to.
**Residual (non-blocking, noted by review):** no charset on text
artifacts; a theoretical double-response path in _events. Deferred.
**Open:** run 0001's F2 is addressed for this suite but the general
pattern (in-flow review rounds off-journal) recurs — worth a flow
shape where review verdicts pass a gate that journals red.
