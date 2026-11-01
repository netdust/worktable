# Feature review: studio-mcp

Reviewed: origin/feature/studio-mcp at fad83ad77822d63a960b427e64cdf1b1b9580de8, base 5f1a34b (origin/main). Code range 8545b1d..fad83ad: the docs commits 8545b1d and d9b42c3 were not reviewed.
Plan: specs/studio-mcp/plan.md, with its Threat model, Test map and Review Focus. Spec: specs/studio/spec.md S18.
Level: full. Reviewers:
- the superpowers code reviewer (general-purpose, opus)
- security-sentinel (opus)

There is no ARCHITECTURE-INVARIANTS.md, so no invariant-auditor. The project is not WordPress.

Both reviewers ran the branch's real binary over real stdio against throwaway engines outside the harness ports. Neither changed anything in any tree.
- Code reviewer: `bun test packages/mcp` 26/26; check-boundaries, check-vocabulary and tsc all exit 0. Verdict: with fixes.
- Sentinel: identifiers, ids, redirects, error text, timeouts, no-delete and the boundary check are verified. The loopback guarantee is broken by a proxy environment.

## Blocking

B1. An environment proxy carries the Bearer token off loopback. Raised by security-sentinel.
- Where: `packages/mcp/src/client.ts:43,62-70`, `src/config.ts:43-54`, `src/main.ts:8-10`.
- The attack: with `HTTP_PROXY`/`http_proxy` in Claude Code's environment and no `NO_PROXY` covering loopback, Bun sends `http://127.0.0.1:<port>/…` through the proxy. Proven end to end against fad83ad's main.ts: the proxy logged `authorization=Bearer …`, the engine got nothing, and the tool result was the proxy's body. That breaks the Global Constraint "talks only to a loopback instance" and mitigation 2, silently.
- Fix: set `process.env.NO_PROXY = '*'` and `process.env.no_proxy = '*'` in main.ts before the first fetch (verified in Bun 1.4.2). `proxy: ''` and deleting HTTP_PROXY at runtime were verified NOT to work.
- Test: a subprocess test spawns main.ts with HTTP_PROXY pointing at a recording Bun.serve, calls schema, and asserts the recorder saw no request.

## Should fix

S1. `localhost` connects to `::1`, and the engine binds only 127.0.0.1. Raised by security-sentinel.
- Where: `src/config.ts:24,54`, and `test/config.test.ts:100` keeps localhost.
- Any local process can bind `[::1]:<engine port>` and receive the token: 10 of 10 localhost requests went to ::1.
- Fix: accept localhost but return `http://127.0.0.1:<port>` as the origin, and flip the test.

S2. Attack 4's bound ("the worst an injected session can do is create requests and write rows an editor may write") does not hold. Raised by security-sentinel.
- Where: `plan.md:58`, `plan.md:18`.
- A same-uid, prompt-injected Claude can read the token file and DELETE through curl: the write guard passes requests without Origin. "No delete tool" is MCP behaviour, not a control. The control belongs in the writers: Writer.delete(ctx) sees ctx.actor.kind.
- Fix here: reword attack 4 to "whatever the editor token can do through the engine", naming the domain writers as the control. The writer side goes to studio-domain.

S3. `test/config.test.ts:97`: the word `urls` turns the vocabulary check red once studio-domain merges. Raised by the code reviewer.
- studio declares `smoke_urls`, so `urls` becomes a domain word. Running studio-domain's checker over this branch gives exactly one hit.
- Fix: rename the test title.

## Note

N1. Outside this diff: S10's administrator-only confirmation can be bypassed by a same-uid Claude with Bash. Raised by security-sentinel.
- The route: POST /api/auth/request for the admin's address, read the magic link from the outbox (`mailer.ts:21`) or the journal (`mailer.ts:22`), then POST /api/auth/consume. Writing the SQLite file is simpler still.
- Only OS-level separation closes it. This is for the studio-worker threat model, and the decision is Stefan's.

N2. For studio-domain: actie_site's site_id, voorstel and state stay writable by the claude service after confirmation in the in-progress tree. The domain plan's Task 3 ("voorstel is frozen from voorbereid on", "a dropped site stays dropped after confirmation") is meant to close this. Raised by security-sentinel.

N3. Config refusals echo a token pasted into the wrong slot to stderr, which ends up in Claude Code's MCP log. Raised by security-sentinel and the code reviewer (#3).
- The three slots: `--token-file <token>` (`config.ts:69`/`:180`), `--<token>` (`:35`) and `--url http://<token>:p` (`:53`).
- Fix: refuse a relative --token-file without echoing it, which also fixes S19's user-scope registration from any cwd; and never echo option names or values.

N4. Plain HTTP on loopback is unauthenticated: while the engine is down, any local process on its port gets the token. Acceptable on a single-user box, but it belongs in the plan's Deferrals. Raised by security-sentinel.

N5. Supply chain is clean. The SDK is pinned at 1.32.1 with integrity matching the registry, and the stdio graph loads only ajv, ajv-formats, zod and zod-to-json-schema. bun audit's qs hit is stryker's qs@6.15.1, not the SDK's. Raised by security-sentinel.

Code reviewer's minors:
- N6 (`src/tools.ts:41,71`): `rows` with no limit asks for up to 5000 rows and can exceed Claude Code's MCP output cap. Suggestion: a small default with `total` as the paging signal.
- N7 (`src/config.ts:173-176`): the mode is checked before the owner, so a foreign file gets chmod advice. "readable" is the wrong word for write bits.
- N8 (`src/client.ts:93,100-101`): "does not answer" misleads in two cases. A timed-out POST or PATCH may have committed, so read before retrying. A token with whitespace or non-ASCII makes fetch throw on the header, which also reads as "does not answer".
- N9 (`src/tools.ts:16-20`): a 401 comes back as "Sign in first". For a service token it should say the token was refused.
- N10 (`scripts/check-boundaries.ts:31-36`): leavesMcp catches only relative paths into packages/. A `../../../apps/grid/...` import passes.
- N11 (`scripts/check-boundaries.ts:5-8`, `bun.lock`): textual merge conflicts with studio-domain. They are trivial; package.json merges clean.
- N12 (`AGENTS.md:9-11`, `README.md:3`): neither lists packages/mcp, its rule or its usage.
- N13 (`test/config.test.ts:10`): about 11 `wt-mcp-*` dirs are left in /tmp per run.

Findings: 1 Blocking · 3 Should fix · 13 Note
