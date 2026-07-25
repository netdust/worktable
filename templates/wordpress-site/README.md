# wordpress-site — a project pack for building WP sites through gates

Copy `.flow/` into a WordPress site repo. It gives that repo a delivery
road where **everything a machine can check is green before anything
reaches you**, so your attention goes to the one question a machine
cannot answer: does it look and read right.

    __start__ → brief ⊨gate → plan ⊨gate → YOUR APPROVAL ⊨seal
              → build ⟲ ledger
              → syntax → security → standards → render → a11y
              → YOUR SHAKE-OUT ⊨seal(--fresh) → __end__

Two human stops. Everything between them is exit codes.

## Install

    cp -r <worktable>/templates/wordpress-site/.flow  <site-repo>/.flow
    cd <site-repo>
    composer require --dev wp-coding-standards/wpcs \
        dealerdirect/phpcodesniffer-composer-installer
    npm --prefix .flow i -D @playwright/test
    printf 'tasks/.harness-loop.json\n.flow-journal.jsonl\nreviews/\n' >> .gitignore

Edit two files before the first run:

- **`.flow/render-routes.txt`** — every URL that must render. A route
  that is not listed is a route nothing checks.
- **`.flow/floors.yaml`** — tune the patterns to this codebase.

Then verify the pack before it drives anything:

    python3 ~/.claude/netdust-flow/bin/flow-lint.py .flow/flows/site.yaml \
        --check-gates --project . --compile
    python3 .flow/tests/pack-tests.py

## Arm a build

    /flow build/<feature> site

`build/<feature>` is where `spec.md`, `plan.md` and `tasks.md` live —
the paperwork, kept out of `wp-content/`. Binds: `theme` (slug),
`base_ref` (usually `main`), `netdust_flow`.

## The gates

| Gate | Proves | Needs |
| --- | --- | --- |
| `gate-syntax` | every changed PHP file parses | `php` |
| `gate-security` | escaping · nonces · capabilities · prepared SQL | — |
| `gate-standards` | PHPCS / WordPress-Coding-Standards | `composer` |
| `gate-render` | real WP boots, every route renders, **zero new lines in debug.log** | `ddev` |
| `gate-a11y` | landmarks · alt · labels · heading order · no 360px overflow | `npx`, `ddev` |

Cheapest first: a syntax error should not wait for a browser to boot.

**A gate that cannot run does not pass.** If `ddev` is missing,
`gate-render` FAILS — it does not skip. Skipping would make green mean
"either this was verified or it wasn't, and you can't tell from here",
which is exactly the hidden completion heuristic this system exists to
refuse. If you truly want to run without a gate, delete it from the
flow and its edges: that is a decision on the record.

## Why you can trust the outcome

Not because the agent is careful. Because of the graph:

- Every machine gate routes its red exit **back to `build`**. No edge
  carries a red check forward.
- `shakeout` is reachable **only** from a green `gate-a11y`, which is
  reachable only from a green `gate-render`, and so back to syntax.
  That chain is the whole claim, and `pack-tests.py` asserts it.
- `__end__` is reachable **only** from `gate-acceptance`, which reads
  your recorded seal. Resuming the session approves nothing.
- The finishing seal uses `--fresh`: if anything is edited after you
  approve, the approval goes stale and you are asked again. An agent
  cannot tidy up something you already signed off.

## What it does not do

It does not judge design, hierarchy, copy, or brand. It cannot tell you
the homepage is boring. `gate-a11y` checks that a heading order exists,
not that it is the right one. That is the division of labour — the
machine clears the ground; the taste is yours.

It also does not deploy. Finishing means the work is sealed on a tree,
not that it is live.
