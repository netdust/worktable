#!/usr/bin/env python3
"""wp-security.py — the three WordPress mistakes that actually ship.

    wp-security.py [paths ...]        (default: wp-content/themes, plugins)
    wp-security.py --base main        (only files changed against a ref)

This gate exists because the WordPress security model is almost
entirely convention: nothing stops you echoing `$_GET['x']`, nothing
stops an admin action running for a subscriber, nothing stops string
interpolation into SQL. The platform will happily do all three. So the
checks have to live here.

What it refuses:

  ESCAPING   dynamic output that reaches HTML without an escaping
             function. `echo $title` is a stored-XSS hole the moment
             $title comes from anywhere a user can reach.
  NONCE      a function that CHANGES STATE from $_POST / $_GET /
             $_REQUEST without a nonce check in the same function.
             Without one, any page on the internet can submit the form
             on behalf of a logged-in admin. Read-only reflection of
             request data is deliberately NOT a nonce finding — it is an
             escaping bug, ESCAPING already reports it, and firing both
             for one defect trains people to skim past this rule.
  CAPS       an admin_post_ / admin action / AJAX handler with no
             current_user_can() call. Authentication is not
             authorization: `wp_ajax_` fires for every logged-in user,
             including subscribers.
  SQL        interpolation into a $wpdb query without ->prepare().

Design notes, because a noisy gate gets disabled and a disabled gate
proves nothing:

  * Scope is per FUNCTION, not per file. A nonce check at the top of a
    file does not protect a handler defined below it.
  * The escaping allowlist is generous on purpose (esc_*, wp_kses*,
    absint, sanitize_*, number_format, and known-safe WP getters that
    escape internally). A false FAIL costs trust; a missed hole costs
    a site.
  * `// wp-security: ignore <RULE> — <reason>` silences one finding and
    REQUIRES a reason. For line rules (ESCAPING, SQL) it goes on the
    line above; for function rules (NONCE, CAPS) anywhere inside the
    function, since that is where the provoking call is and nobody
    writes it on the signature. Suppression with a stated reason is a
    decision on the record; silent suppression is what this whole
    system refuses.

Exit 0 clean · 1 findings.
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

DEFAULT_ROOTS = ("wp-content/themes", "wp-content/plugins")

# Anything that makes a value safe to print. Generous by design.
SAFE_CALL = re.compile(
    r"\b(esc_html|esc_attr|esc_url|esc_url_raw|esc_js|esc_textarea|"
    r"esc_html__|esc_attr__|esc_html_e|esc_attr_e|"
    r"wp_kses|wp_kses_post|wp_kses_data|"
    r"absint|intval|floatval|number_format|number_format_i18n|"
    r"sanitize_text_field|sanitize_email|sanitize_key|sanitize_title|"
    r"wp_nonce_field|paginate_links|get_search_form|wp_get_attachment_image|"
    r"wp_list_pluck|selected|checked|disabled|"
    r"the_title|the_content|the_excerpt|the_permalink|wp_head|wp_footer|"
    r"body_class|post_class|language_attributes|bloginfo|"
    r"wp_body_open|wp_link_pages|comments_template|get_template_part)\s*\(")

# Output sinks: echo/print/<?= and the interpolating heredoc style.
ECHO_RE = re.compile(r"(?:^|[;{}\s])(echo|print)\s+(?P<expr>[^;]+);")
SHORT_ECHO_RE = re.compile(r"<\?=\s*(?P<expr>[^?]+)\?>")
# A dynamic value: a variable, or a function call that is not on the
# safe list. Constants and quoted strings are not dynamic.
DYNAMIC_RE = re.compile(r"\$[A-Za-z_]\w*|\b[a-z_]\w*\s*\(")

SUPERGLOBAL_RE = re.compile(r"\$_(POST|GET|REQUEST|FILES|COOKIE)\b")
NONCE_RE = re.compile(r"\b(check_admin_referer|check_ajax_referer|"
                      r"wp_verify_nonce)\s*\(")
CAPS_RE = re.compile(r"\b(current_user_can|current_user_can_for_blog|"
                     r"user_can|is_super_admin)\s*\(")
FUNC_RE = re.compile(r"^\s*(?:(?:public|private|protected|static)\s+)*"
                     r"function\s+([A-Za-z_]\w*)\s*\(")
HOOKED_RE = re.compile(r"add_action\s*\(\s*['\"](admin_post[^'\"]*|"
                       r"wp_ajax[^'\"]*|admin_init|admin_menu)['\"]\s*,")
WPDB_RE = re.compile(r"\$wpdb->(query|get_results|get_row|get_var|get_col)\s*\(")
# "this function changes something" — the trigger for both NONCE and CAPS
MUTATION = (r"\b(update_option|add_option|delete_option|update_user_meta|"
            r"update_post_meta|delete_post_meta|wp_insert_|wp_update_|"
            r"wp_delete_|wp_set_|wp_mail|file_put_contents)\b|"
            r"\$wpdb->(query|insert|update|delete|replace)\s*\(")
PREPARE_RE = re.compile(r"\$wpdb->prepare\s*\(")
IGNORE_RE = re.compile(r"//\s*wp-security:\s*ignore\s+(\w+)\s*—?-?\s*(.*)")


class Finding:
    def __init__(self, rule: str, path: Path, line: int, detail: str):
        self.rule, self.path, self.line, self.detail = rule, path, line, detail

    def __str__(self) -> str:
        return f"FAIL  [wp-security/{self.rule}]  {self.path}:{self.line}  {self.detail}"


def php_files(paths: list[str], base: str | None) -> list[Path]:
    if base:
        p = subprocess.run(["git", "diff", "--name-only", f"{base}...HEAD"],
                           capture_output=True, text=True)
        if p.returncode != 0:
            print(f"FAIL  [wp-security]  cannot diff against `{base}` — "
                  f"failing closed rather than scanning nothing")
            sys.exit(1)
        changed = [Path(f) for f in p.stdout.split() if f.endswith(".php")]
        return [f for f in changed if f.exists()]
    out: list[Path] = []
    for root in paths:
        rp = Path(root)
        if rp.is_file() and rp.suffix == ".php":
            out.append(rp)
        elif rp.is_dir():
            out.extend(sorted(rp.rglob("*.php")))
    return out


def strip_comments(line: str) -> str:
    return re.sub(r"//.*$|#.*$", "", line)


def strip_comments_and_strings(line: str) -> str:
    """Crude but adequate: remove quoted literals so a URL in a string
    does not read as a function call, and drop trailing comments.

    NOT usable for the SQL rule: a PHP double-quoted string interpolates
    (`"… = '$term'"`), so blanking it here hides the exact injection the
    rule is looking for. That rule reads the comment-stripped line."""
    line = re.sub(r"'(?:\\.|[^'\\])*'", "''", line)
    line = re.sub(r'"(?:\\.|[^"\\])*"', '""', line)
    return strip_comments(line)


def is_escaped(expr: str) -> bool:
    """True when every dynamic part of the expression is wrapped."""
    clean = strip_comments_and_strings(expr)
    if not DYNAMIC_RE.search(clean):
        return True                      # nothing dynamic to escape
    if SAFE_CALL.search(clean):
        # A safe call is present. Require that no BARE variable survives
        # outside it — `esc_html($a) . $b` must still fail.
        without_safe = SAFE_CALL.sub("SAFE(", clean)
        depth, kept = 0, []
        for ch in without_safe:
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth = max(0, depth - 1)
            elif depth == 0:
                kept.append(ch)
        return not re.search(r"\$[A-Za-z_]\w*", "".join(kept))
    return False


def functions_of(lines: list[str]) -> list[tuple[int, int, str]]:
    """(start, end, name) per function, by brace depth. A nonce check
    in another function is not a nonce check in this one."""
    spans, i = [], 0
    while i < len(lines):
        m = FUNC_RE.match(lines[i])
        if not m:
            i += 1
            continue
        depth, j, opened = 0, i, False
        while j < len(lines):
            code = strip_comments_and_strings(lines[j])
            depth += code.count("{") - code.count("}")
            if "{" in code:
                opened = True
            if opened and depth <= 0:
                break
            j += 1
        spans.append((i, min(j, len(lines) - 1), m.group(1)))
        i = j + 1
    return spans


def _silences(line: str, rule: str) -> bool:
    m = IGNORE_RE.search(line)
    if not m or m.group(1).upper() != rule:
        return False
    return bool(m.group(2).strip())      # a reason is mandatory


def suppressed(lines: list[str], idx: int, rule: str) -> bool:
    """Line-scoped rules: the comment goes on the line above."""
    return idx > 0 and _silences(lines[idx - 1], rule)


def suppressed_in_span(lines: list[str], start: int, end: int,
                       rule: str) -> bool:
    """Function-scoped rules (NONCE, CAPS): the finding is reported at
    the function's signature, but nobody writes the suppression there —
    they write it next to the call that provoked it. Accept it anywhere
    in the function, plus the line above the signature."""
    above = start > 0 and _silences(lines[start - 1], rule)
    return above or any(_silences(l, rule) for l in lines[start:end + 1])


def scan(path: Path) -> list[Finding]:
    try:
        text = path.read_text(errors="replace")
    except OSError as e:
        return [Finding("IO", path, 0, str(e))]
    lines = text.splitlines()
    found: list[Finding] = []

    for i, raw in enumerate(lines):
        line = strip_comments_and_strings(raw)

        for m in list(ECHO_RE.finditer(line)) + list(SHORT_ECHO_RE.finditer(raw)):
            expr = m.group("expr") if "expr" in m.groupdict() else m.group(0)
            if not is_escaped(expr) and not suppressed(lines, i, "ESCAPING"):
                # report the ORIGINAL source: the stripped rewrite shows
                # `'' . $_GET[''] . ''`, which nobody can find in a file
                found.append(Finding("ESCAPING", path, i + 1,
                                     f"unescaped output: {raw.strip()[:70]}"))

        sql_line = strip_comments(raw)
        if WPDB_RE.search(sql_line) and not PREPARE_RE.search(sql_line):
            # `{$wpdb->posts}` is a table name, not user input — every
            # real query has one, so counting it would fail every line.
            args = sql_line.split("(", 1)[-1]
            interpolated = re.sub(r"\{?\$wpdb->\w+\}?", "", args)
            if re.search(r"\$[A-Za-z_]\w*", interpolated) \
                    and not suppressed(lines, i, "SQL"):
                found.append(Finding("SQL", path, i + 1,
                                     "interpolated $wpdb query without ->prepare()"))

    for start, end, name in functions_of(lines):
        body = lines[start:end + 1]
        code = "\n".join(strip_comments_and_strings(l) for l in body)
        reads_input = SUPERGLOBAL_RE.search(code)
        # A nonce protects a STATE CHANGE from being triggered by another
        # site. A function that merely reflects $_GET into the page has
        # an escaping bug, not a CSRF bug — and the ESCAPING rule already
        # reports it. Firing both would train people to ignore this one.
        mutates = re.search(MUTATION, code)
        if reads_input and mutates and not NONCE_RE.search(code) \
                and not suppressed_in_span(lines, start, end, "NONCE"):
            found.append(Finding("NONCE", path, start + 1,
                                 f"`{name}()` changes state from request "
                                 f"input with no nonce check in scope"))
        hooked = HOOKED_RE.search(code) or re.search(
            r"add_action\s*\(\s*['\"](?:admin_post|wp_ajax)", code)
        if (reads_input or hooked) and not CAPS_RE.search(code) \
                and not suppressed_in_span(lines, start, end, "CAPS"):
            # only demand caps where the handler actually acts on input
            if re.search(MUTATION, code):
                found.append(Finding("CAPS", path, start + 1,
                                     f"`{name}()` mutates state from request "
                                     f"input with no capability check"))
    return found


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="*", default=list(DEFAULT_ROOTS))
    ap.add_argument("--base", help="scan only files changed against this ref")
    args = ap.parse_args()

    files = php_files(args.paths or list(DEFAULT_ROOTS), args.base)
    if not files:
        print("ok    [wp-security]  no PHP files in scope")
        return 0

    findings: list[Finding] = []
    for f in files:
        findings.extend(scan(f))

    for f in findings:
        print(f)
    if findings:
        rules = sorted({f.rule for f in findings})
        print(f"wp-security: {len(files)} file(s), {len(findings)} finding(s) "
              f"[{', '.join(rules)}]")
        return 1
    print(f"ok    [wp-security]  {len(files)} file(s) clean")
    return 0


if __name__ == "__main__":
    sys.exit(main())
