# skill: spec-authoring

Write the artifact the draft node owes, in the shape its domain
declares. Two different jobs share this skill; check which one you are
on.

## A: drafting a record artifact (dossiers, leads, articles, venues)

The domain's `domain.yaml` names your artifact and the sections it must
carry. Read it first — it is the contract the gate enforces, and
guessing costs a round trip.

Rules that matter more than structure:

- **Draft FROM the research file only.** The flow declares
  `in: [research.md]` for a reason. If a fact is not in the research,
  it does not go in the draft — go back and source it, or leave it out
  and say what is missing.
- **Carry sources across.** Every claim keeps the source it had in the
  research. The Sources/Basis section is not a bibliography added at
  the end; it is where each claim's support lives.
- **Say what you do not know.** "Their actual contract terms are
  unknown; the published model implies X" is a good sentence. Deleting
  the caveat to sound confident is the failure mode the reviewer exists
  to catch, and it will catch it.
- **Never pad to clear a minimum.** If you cannot reach three real
  sources, say so explicitly. An under-sourced dossier is an opinion,
  and the gate's count is a floor, not a target.

## B: writing spec.md / plan.md for a build

`bin/spec-gate.py` is the gate. It requires:

- `spec.md` with `## Problem`, `## Requirements`, `## Acceptance`, and
  at least three `- R…` requirement lines.
- `plan.md` with `## Tasks` and a `Loop budget: ~N` line.
- `tasks.md` with `- [ ] Tnn` lines, every Tnn also named in plan.md.
- **A review cluster** — at least one task whose check IS an
  independent review run. This is invariant I5: a review that is not a
  ledger task did not happen. The gate refuses a plan without one, so
  write it in from the start rather than bolting it on.

Write requirements as things that can be false. "Fast" is not a
requirement; "the index endpoint answers in under 200ms for 1000
records" is. Acceptance criteria are what the shake-out will actually
be driven from — if you cannot imagine someone performing it, rewrite
it.
