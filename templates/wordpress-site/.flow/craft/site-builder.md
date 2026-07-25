# craft: site-builder — building a WordPress site that survives its gates

You are building a site whose owner will judge the design and has
delegated everything else to the gates. That division is the deal:
**they look at whether it feels right; you make sure nothing else is
wrong.** Every hour they spend finding an unescaped variable is an hour
stolen from the part only they can do.

## Write for the gates you will meet

You know the road: syntax → security → standards → render → a11y →
their eyes. Writing to clear those on the first pass is not
gate-pleasing, it is just the job.

**Escaping — late and always.** Escape at output, in the form that
matches the context: `esc_html()` in text, `esc_attr()` in attributes,
`esc_url()` in `href`/`src`, `wp_kses_post()` when markup must survive.
Never escape at assignment and assume it holds — it will not survive
the next person's refactor, and the gate reads the output line.

**Nonce and capability together.** Any handler that changes something
gets both: `check_admin_referer()` (or `check_ajax_referer()`) and
`current_user_can()`. `wp_ajax_` fires for every logged-in user,
subscribers included — authentication is not authorization.

**`$wpdb->prepare()`, every time there is a variable.** No exceptions
you can talk yourself into.

**Escape hatch, used honestly.** If a finding is genuinely wrong:

    // wp-security: ignore ESCAPING — $html is wp_kses_post()'d in the caller
    echo $html;

The reason is mandatory and it is a claim on the record. Do not write
one you would not defend in review.

## Templates that render on the ugly cases

`gate-render` requests every route in `.flow/render-routes.txt` with
`WP_DEBUG` on and fails on a single new line in `debug.log`. So the
posts that break templates are the ones to think about while writing
them:

- no featured image, no excerpt, no author bio, no categories
- a title long enough to wrap three times, and one that is a single
  40-character word
- an empty archive, an empty search, a 404
- a menu that has not been assigned yet

`the_post_thumbnail()` on a post without one prints nothing — fine.
`get_the_post_thumbnail_url()` returns `false`, and passing that to
`esc_url()` inside a `style` attribute gives you `url()` and a notice.
That difference is most of what this gate catches.

## Accessibility is not a later pass

`gate-a11y` checks one `<h1>`, no skipped heading levels, `alt` on
every image, a label for every control, a `main` landmark, `<html lang>`,
links with text, and no horizontal scroll at 360px. All of that is
cheaper to write correctly than to retrofit, and none of it constrains
the design.

`alt=""` is correct for a decorative image. A missing `alt` attribute is
not the same thing, and only one of them passes.

## The loop discipline

One task, its check, `attest.py`, stop. Do not run ahead. Do not fix
three things because you noticed them — note them and let the plan
carry them, or the ledger records one task's evidence for three tasks'
work.

Before attesting: **if I reverted this, would the check go red?** If
not, the check is theater.

## What belongs to the human

Whether it looks right. Whether the copy sounds like the client.
Whether the hierarchy leads the eye where the business needs it. You
prepare the ground and get out of the way — surface the question and
stop. Resuming a session is not approval.
