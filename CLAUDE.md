# worktable — project instructions

A work system where agents are the number-one user and humans hold the
authority. Read `README.md` for the shape, `AGENTS.md` for the
operating rules (they are binding), `docs/SPEC.md` for the model.

## Flow bindings

Read by `/flow` at arm time; without them the walker refuses to arm.

    Gate check: python3 bin/spec-gate.py
    Test suite: make check

`make check` runs the server suite, the runtime contract, and the flow
lint. It is what `patch` attests as SUITE.

## The runtime is a separate repo

Status, evidence and finishing all come from
[netdust-flow](https://github.com/netdust/netdust-flow), resolved via
`~/.claude/netdust-flow` (override with `NETDUST_FLOW=` or
`WORKTABLE_NETDUST_FLOW=`). That is a real dependency across a repo
boundary, and it has already broken once in the worst way:

> worktable's finishing gates began calling `seal.py check … --fresh`
> before netdust-flow had the flag. argparse exits 2 for an unknown
> flag; our flows route `gate.exit == 2` as **rejected**. Every
> approval was silently read as a refusal, and no test noticed.

So: **`make contract` is not optional.** It probes every gate command
our flows declare against the runtime actually installed, and fails if
the runtime cannot parse one. Run it after any flow edit, after any
runtime upgrade, and in CI. If you change a gate command to use a new
runtime feature, the runtime change must land and be released first.

## Domains are definitions, not code

A domain (`records/<domain>/`) is a folder of definitions: a
`domain.yaml` describing its artifacts, a flow, some views. Adding a
domain must not require editing `bin/`. If you find yourself adding
`if domain == "leads"` to a gate script, the gate is missing a
parameter — put it in `domain.yaml` instead.

## Working here

- **Never hand-move `status`, `run`, or `awaiting_seal`.** They are
  flow-owned, written only by `bin/gate-then-status.py`. See AGENTS.md
  rule 1 — this is enforced, not advisory.
- **The server has exactly one write: the seal.** Every other endpoint
  is derived and regenerable. A feature that needs a second write needs
  a conversation first (`docs/DEFERRED-UI.md` lists the ones already
  parked, and why).
- **stdlib only in `server.py` and `bin/`.** The server boots with
  nothing installed and is safe to kill at any time; keep it that way.
- **Compiled twins are generated.** After editing `flows/*.yaml`, run
  `make flows` and commit both files.

## Commands

    make check      # test + contract + flows — before every commit
    make test       # server + gate suite (35 checks)
    make contract   # gate commands vs the installed runtime
    make flows      # lint domain flows, verify gates, compile twins
    make ui         # typecheck + Playwright e2e (npm ci in ui/ first)
