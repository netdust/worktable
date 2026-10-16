# Draft: upstream issue for stryker-js

Not filed. Stefan decides whether it goes to https://github.com/stryker-mutator/stryker-js/issues.

---

**Title:** vitest-runner: with Vitest 5 every mutant runs zero tests and survives (testNamePattern joins names with a space)

**Versions:** @stryker-mutator/core 10.0.0, @stryker-mutator/vitest-runner 10.0.0, vitest 5.0.3, node 22.16.0, `coverageAnalysis: "perTest"` (the runner's default), jsdom environment.

**What happens:** the dry run passes and collects per-test coverage. After it, almost every mutant is reported Survived with `testsCompleted: 0`. Only static mutants get killed, because they run without a test filter. A function whose body is replaced by `{}` survives, even though its own unit test calls it directly.

**Cause:** for a per-test mutant run, `VitestTestRunner.run()` builds `testNamePattern` from `collectTestName()`, which joins the suite and test names with a space (`dist/src/test-helpers.js:11`, `dist/src/stryker-setup.js:66`). Vitest 5 matches `testNamePattern` against the task's full name joined with `" > "`, so the pattern matches no test. The run completes with zero tests, which counts as survived.

**Repro** (Vitest's node API, no Stryker involved). The test file is `rank.test.ts`, holding `describe('rankBetween', () => { test('before-first: …', …) })`:

```js
const ctx = await createVitest('test', { pool: 'threads', maxWorkers: 1, watch: false })
for (const pattern of [/rankBetween before-first/, /rankBetween > before-first/]) {
  ctx.state.filesMap.clear()
  ctx.projects.forEach((p) => { p.config.testNamePattern = pattern })
  await ctx.start(['src/board/rank.test.ts'])
  // count tests with a result that is not 'skip'
}
// /rankBetween before-first/   → 0 tests
// /rankBetween > before-first/ → 1 test   (task.fullTestName is "rankBetween > before-first: …")
```

**Fix we use locally** (`bun patch`):

```diff
-    return nameParts.join(' ').trim();
+    return nameParts.join(' > ').trim();
```

The change goes in `collectTestName` in both `test-helpers.js` and `stryker-setup.js`, so coverage ids and result ids stay equal. In Vitest 5 a test's suite chain holds neither the file nor an empty root suite, so the joined name equals `task.fullTestName`. With the patch, the same module scores 78.6% (91 killed) instead of 0.9% (1 killed). A version-aware choice, or `task.fullTestName` where it exists, would keep older Vitest working.
