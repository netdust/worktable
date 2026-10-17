# Upstream: the vitest-runner name filter

The bug our patch fixes is already reported upstream, so we file nothing.

- **The bug:** [stryker-js#6210](https://github.com/stryker-mutator/stryker-js/issues/6210). On Vitest 5 the per-test name filter matches nothing, so every covered mutant runs zero tests and survives. Vitest 5 joins a test's name chain with `' > '`, and @stryker-mutator/vitest-runner 10.0.0 joins it with `' '`. Here it showed as rank.ts scoring 0.9% unpatched against 78.6% patched.
- **The fix:** [PR #6214](https://github.com/stryker-mutator/stryker-js/pull/6214) joins the names with `' > '`, the same change our patch makes.
- **What we do:** keep `patches/@stryker-mutator%2Fvitest-runner@10.0.0.patch` until a vitest-runner release contains #6214. Then bump the runner and drop the patch, the `patchedDependencies` entry in package.json and `patches/`.
- **Also open:** [#6248](https://github.com/stryker-mutator/stryker-js/issues/6248). The filter also runs tests whose names merely start with a filtered test's name. That only makes runs slower. It creates no false kills, because an extra test that fails really did fail.
