#!/usr/bin/env python3
"""pack-tests.py — the gates are code, so the gates get tested.

A security gate nobody tested is a security gate that reports clean
because its regex never matched anything. These fixtures are small and
deliberately nasty: each one is a defect that has actually shipped in
real WordPress themes.

    python3 .flow/tests/pack-tests.py

Exit 0 all pass · 1 otherwise. Stdlib only; no WordPress required.
"""
from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

FLOW = Path(__file__).resolve().parents[1]
SECURITY = FLOW / "bin" / "wp-security.py"

failures: list[str] = []
checks = 0


def scan(php: str) -> tuple[int, str]:
    with tempfile.TemporaryDirectory() as td:
        f = Path(td) / "t.php"
        f.write_text(php)
        p = subprocess.run([sys.executable, str(SECURITY), str(f)],
                           capture_output=True, text=True)
        return p.returncode, p.stdout


def expect(name: str, php: str, rules: set[str]) -> None:
    """`rules` is the EXACT set of rule names the scan must report."""
    global checks
    checks += 1
    _, out = scan(php)
    got = {line.split("[wp-security/")[1].split("]")[0]
           for line in out.splitlines() if "[wp-security/" in line}
    if got != rules:
        failures.append(f"{name}: expected {sorted(rules) or 'clean'}, "
                        f"got {sorted(got) or 'clean'}\n    {out.strip()}")


# ── ESCAPING ─────────────────────────────────────────────────────────
expect("bare variable echoed", """<?php
function t( $p ) { echo $p->post_title; }
""", {"ESCAPING"})

expect("escaped output is clean", """<?php
function t( $p ) { echo esc_html( $p->post_title ); }
""", set())

expect("partial escape still fails", """<?php
function t( $a, $b ) { echo esc_html( $a ) . $b; }
""", {"ESCAPING"})

expect("short echo tag", """<?php
function t( $u ) { ?><a href="<?= $u ?>">x</a><?php }
""", {"ESCAPING"})

expect("short echo tag escaped", """<?php
function t( $u ) { ?><a href="<?= esc_url( $u ) ?>">x</a><?php }
""", set())

expect("static string is not a finding", """<?php
function t() { echo '<p>hello</p>'; }
""", set())

expect("known-safe WP getter", """<?php
function t() { echo get_search_form( array( 'echo' => false ) ); }
""", set())

# ── SQL ──────────────────────────────────────────────────────────────
expect("interpolated query", """<?php
function t( $term ) {
    global $wpdb;
    return $wpdb->get_results( "SELECT * FROM {$wpdb->posts} WHERE x = '$term'" );
}
""", {"SQL"})

expect("prepared query is clean", """<?php
function t( $term ) {
    global $wpdb;
    return $wpdb->get_results( $wpdb->prepare(
        "SELECT * FROM {$wpdb->posts} WHERE post_title = %s", $term ) );
}
""", set())

expect("table name alone is not interpolation", """<?php
function t() {
    global $wpdb;
    return $wpdb->get_results( "SELECT ID FROM {$wpdb->posts} LIMIT 10" );
}
""", set())

# ── NONCE / CAPS ─────────────────────────────────────────────────────
expect("mutating handler with neither", """<?php
function t() {
    update_option( 'x', $_POST['x'] );
}
add_action( 'admin_post_t', 't' );
""", {"NONCE", "CAPS", "ESCAPING"} - {"ESCAPING"})

expect("mutating handler fully guarded", """<?php
function t() {
    check_admin_referer( 't' );
    if ( ! current_user_can( 'manage_options' ) ) { return; }
    update_option( 'x', sanitize_text_field( wp_unslash( $_POST['x'] ) ) );
}
""", set())

expect("read-only reflection is escaping, not CSRF", """<?php
function t() {
    echo esc_html( $_GET['s'] );
}
""", set())

expect("nonce without caps", """<?php
function t() {
    check_admin_referer( 't' );
    update_option( 'x', sanitize_key( $_POST['x'] ) );
}
""", {"CAPS"})

expect("caps without nonce", """<?php
function t() {
    if ( ! current_user_can( 'manage_options' ) ) { return; }
    update_option( 'x', sanitize_key( $_POST['x'] ) );
}
""", {"NONCE"})

expect("a guard in ANOTHER function does not count", """<?php
function guarded() {
    check_admin_referer( 'x' );
    if ( ! current_user_can( 'manage_options' ) ) { return; }
}
function unguarded() {
    update_option( 'x', sanitize_key( $_POST['x'] ) );
}
""", {"NONCE", "CAPS"})

# ── suppression ──────────────────────────────────────────────────────
expect("suppression with a reason", """<?php
function t( $html ) {
    // wp-security: ignore ESCAPING — $html is wp_kses_post()'d by the caller
    echo $html;
}
""", set())

expect("suppression without a reason does NOT silence", """<?php
function t( $html ) {
    // wp-security: ignore ESCAPING
    echo $html;
}
""", {"ESCAPING"})

expect("suppression of one rule does not silence another", """<?php
function t() {
    // wp-security: ignore NONCE — invoked only from WP-CLI
    update_option( 'x', sanitize_key( $_POST['x'] ) );
}
""", {"CAPS"})


# ── the flow itself ──────────────────────────────────────────────────
def check_flow() -> None:
    """Whatever else changes, these must hold: no machine gate may route
    a red exit anywhere except back to `build`, and __end__ must be
    reachable only through the seal gate. That chain IS the trust claim
    the pack makes; a stray edge would quietly void it."""
    global checks
    checks += 1
    src = (FLOW / "flows" / "site.yaml").read_text()
    import json
    twin = FLOW / "flows" / "site.json"
    if not twin.exists():
        failures.append("flow: no compiled twin (run flow-lint --compile)")
        return
    doc = json.loads(twin.read_text())
    gates = {n["id"] for n in doc["nodes"] if n["kind"] == "gate"}
    machine = {g for g in gates if g.startswith("gate-")
               and g not in ("gate-approval", "gate-acceptance", "gate-ledger",
                             "gate-brief", "gate-plan")}
    for e in doc["edges"]:
        if e["from"] in machine and e.get("when", "").endswith("!= 0"):
            if e["to"] != "build":
                failures.append(f"flow: red exit from {e['from']} routes to "
                                f"{e['to']}, not build")
    ends = [e["from"] for e in doc["edges"] if e["to"] == "__end__"]
    if ends != ["gate-acceptance"]:
        failures.append(f"flow: __end__ reachable from {ends}, "
                        f"expected only gate-acceptance")
    if "--fresh" not in src:
        failures.append("flow: the finishing seal is not --fresh — a "
                        "post-seal edit would ride the old approval")


check_flow()

for f in failures:
    print(f"FAIL  [pack-tests]  {f}")
print(f"pack-tests: {checks} checks, {len(failures)} failure(s)")
sys.exit(1 if failures else 0)
