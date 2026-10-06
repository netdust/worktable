# Review: step-0e U3, the vocabulary check

Branch `feature/step-0e-vocabulary`, range f4cf450..b51ddb6. One fresh reviewer, on the most capable model, read the whole branch on 2026-10-06. Its verdict: **ready to merge**. It found nothing Critical and nothing Important, so there was no fix pass.

## Checked
- `bun run check` passes with the vocabulary step.
- 5 script tests and 366 engine tests pass. The rename changed only words: it adds and removes the same number of lines per file, and adds or removes no `test(`.
- The check fails closed: an unresolvable `--domain`, or a domain module without `queries`, exits 1.
- The rename avoided collisions with engine keys: `titel` became `heading`, not the reserved `title`.

## Minor, deferred
1. Plurals and compounds of the vocabulary words (`personen`, `toewijzingen`, `persoonsgegevens`) are not caught, unless a domain declares them.
2. An acronym-prefixed identifier (`XMLToewijzingParser`), or ALLCAPS with no separator (`PERSOONID`), is one token, so it passes.
3. Gitignored files under `packages/engine` (`dist/`, `*.db`) are scanned. A local database file there would turn `check` red on one machine only. Nothing writes one there today.
4. No test plants `persoon_id`. The reviewer's probe shows it is caught.
5. The rename leaves a few half-Dutch names (`noteLijst`, `deze note bestaat al`), and undeclared Dutch fixture words remain. Both are allowed by the rule.

## Declined to judge (reviewer), with the executor's ruling
- **Option values and labels are not in the word list:** by the plan's Decision (plan review S5). It stands.
- **English words theatre declares (`contact`, `venue`, `email` …):** they are allowlisted when the engine first uses one, which is the design. It stands.
- **Non-ASCII:** Dutch domain words here carry no diacritics. It stands.
