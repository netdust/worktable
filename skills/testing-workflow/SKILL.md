# skill: testing-workflow

A test's job is to fail when the behaviour is wrong. Everything below
follows from that one sentence, and this repo has already paid for
forgetting it.

## The rule

**Before a test counts, prove it can fail.** Break the code (revert the
fix, flip the condition, delete the guard), watch the test go red, put
it back. A test never observed failing is an assertion that the code
works — and this system does not accept assertions as evidence.

The bill for skipping this, from run 0002:

> A test covered view sorting. The fixture used the same broken `sort:`
> syntax as the implementation, and the expected order happened to
> match alphabetical folder order. Code and test were both wrong in the
> same direction, so the suite was green and the feature was broken.
> An independent reviewer found it, not the suite.

Same-direction wrongness is the failure mode. It survives every green
run and only dies to a deliberate break or an outside reader.

## Writing them here

- **Drive the real thing.** `tests/server-tests.py` boots the actual
  server over HTTP; the UI suite runs a real browser against a real
  build. Prefer that to mocking the boundary you are trying to verify.
- **One reason to fail per test.** When it goes red you want the name
  to tell you what broke, not to start an investigation.
- **Test the contract, not the implementation.** A test that has to
  change every time you refactor is measuring the wrong thing.
- **A bug fix ships with the test that would have caught it**, and you
  demonstrate that by running it against the unfixed code first.

## Attesting

The check you attest must be the check that can fail:

    python3 <netdust-flow>/bin/attest.py <feature-dir> T07 -- make check

A green exit writes evidence; a red one records nothing. Do not attest
a narrower command than the task claims to cover — a passing check on
the wrong scope is the same defect class as the fixture above.

## Cross-repo contracts

worktable's gates call netdust-flow's binaries. That boundary broke
once, silently, and cost every finishing gate in the repo (`make
contract` exists because of it). If you change a gate command to use a
new runtime flag, the runtime change lands first — and `make contract`
is how you find out you were wrong.
