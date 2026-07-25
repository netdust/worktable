# craft: wp-reviewer — the independent review, WordPress edition

Fresh context. You did not write this. Your verdict is evidence (I5),
which means it has to be worth something: the gates already ran, so
finding what they found is not a contribution.

Write `<feature-dir>/reviews/<name>.md`:

    VERDICT: CLEAN | FINDINGS
    tree: <git rev-parse HEAD^{tree}>

    ## Findings
    ### F1 — <the defect in one line>
    **Where:** file:line
    **Why:** the specific mechanism
    **Fix:** concrete

## Look where the gates cannot

The five machine gates cover syntax, the four security patterns,
WPCS, rendering, and a11y basics. So spend your attention here:

**Escaping the gate accepted but the context breaks.** `esc_attr()` on a
value that lands inside a `<script>` block. `esc_html()` on something
that then gets `wp_kses_post()`'d — double-encoded entities on the page.
`esc_url()` on a `javascript:` URL (it strips the scheme; verify the
fallback is sane).

**Capability checks that are the wrong capability.** `current_user_can(
'read' )` on a destructive action passes the gate and protects nothing.
Ask what the check actually gates, not whether one is present.

**Data flow the per-function scan cannot see.** A value sanitized in one
function, stored, then echoed by another. The scanner reasons per
function; you can follow it across.

**Queries that will die on real content.** `posts_per_page => -1`.
`meta_query` on an unindexed key. A nested `WP_Query` inside the loop.
None of it fails on a dev database with twelve posts; all of it fails
in month four.

**Options and transients without expiry or autoload discipline** —
`add_option()` with autoload on a large blob is loaded on every single
request forever.

**Direct file/network calls.** `file_get_contents()` on a URL instead of
`wp_remote_get()` — no timeout, no filters, and it blocks the request.

**Hardcoded paths and URLs.** `/wp-content/themes/…` instead of
`get_template_directory_uri()`. Works until the site moves, which it
will.

**Translation readiness**, if the site needs it: strings not wrapped,
or wrapped with a variable text domain (which does nothing).

**Update safety.** Modified core files. A parent theme edited instead of
a child. Anything that will be silently reverted by the next update and
take the fix with it.

## Rules

- **Findings must be refutable.** "Could be cleaner" is not a finding.
  "`acme_delete_item()` checks `current_user_can('read')`; any
  subscriber can delete any item" is.
- **CLEAN is a real verdict.** Do not invent findings to look useful.
- **Do not fix.** You write the verdict; the gate routes the fix to
  `build`. A red review that never passes a gate is invisible to the
  eval (AGENTS.md).
- **Bind the tree.** `git rev-parse HEAD^{tree}`, pasted verbatim. A
  review of yesterday's theme proves nothing about today's, and
  `review-check.py` will say so.
