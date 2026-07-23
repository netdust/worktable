# worktable

Records, flows, gates, views — a work system where **agents are the
number-one user** and humans hold the authority.

Agents work records through declared flows. Deterministic gates and
recorded human seals decide what advances and what finishes. Views are
the human layer over what is, underneath, nothing but a folder of
markdown files.

- The record is a folder of `.md` files, versioned by git. Nothing
  else is persistent truth.
- Status moves only through flows ([netdust-flow](https://github.com/netdust/netdust-flow)
  is the runtime: gates, seals, evidence, run journal).
- Views are documents. Any index, board, or app rendering them is
  derived wallpaper — regenerable, never authoritative.
- A domain (leads, articles, dossiers, a theater tour) is a folder of
  definitions — record schemas, a flow, a few gate scripts, some
  views. Never kernel code.

Start with [`docs/SPEC.md`](docs/SPEC.md). Agents: read
[`AGENTS.md`](AGENTS.md) before touching anything.

First domain: **dossiers** (`records/dossiers/`, `flows/dossier.yaml`)
— research → gated draft → attested review → human seal.
