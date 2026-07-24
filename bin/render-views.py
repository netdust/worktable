#!/usr/bin/env python3
"""render-views.py — materialize view documents into rendered markdown.

Views are documents (views/*.md): frontmatter defines the query
(source folder, grouping, columns, sort); this tool renders the
matching records as a markdown table BETWEEN MARKERS in the same
file, so the rendered board is visible anywhere markdown renders —
GitHub included, no Obsidian required. It also maintains an
`## Artifacts` section inside each record's item.md, linking its
stage files (the two-level model: the view lists records, the folder
is the detail).

Everything written here is derived wallpaper: regenerable from the
records at any time, clearly fenced, never authoritative. Run after
flow stops, before pushing. Stdlib only.

    render-views.py [--root DIR]     # default: repo root (cwd)
"""
from __future__ import annotations

import argparse
import re
import sys
from datetime import date
from pathlib import Path

R_BEGIN = "<!-- rendered:begin -->"
R_END = "<!-- rendered:end -->"
A_BEGIN = "<!-- artifacts:begin -->"
A_END = "<!-- artifacts:end -->"


def frontmatter(text: str) -> dict:
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}
    fm: dict = {}
    for line in lines[1:]:
        if line.strip() == "---":
            return fm
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$", line)
        if m:
            fm[m.group(1)] = m.group(2).strip()
    return {}


def parse_list(raw: str) -> list[str]:
    raw = raw.strip()
    if raw.startswith("[") and raw.endswith("]"):
        return [p.strip() for p in raw[1:-1].split(",") if p.strip()]
    return [raw] if raw else []


def replace_between(text: str, begin: str, end: str, block: str) -> str:
    if begin in text and end in text:
        pre = text.split(begin)[0]
        post = text.split(end, 1)[1]
        return pre + begin + "\n" + block + "\n" + end + post
    sep = "" if text.endswith("\n") else "\n"
    return text + sep + "\n" + begin + "\n" + block + "\n" + end + "\n"


def load_records(source: Path) -> list[dict]:
    records = []
    if not source.is_dir():
        return records
    for folder in sorted(p for p in source.iterdir() if p.is_dir()):
        item = folder / "item.md"
        if not item.exists():
            continue
        fm = frontmatter(item.read_text())
        artifacts = sorted(p.name for p in folder.glob("*.md")
                           if p.name != "item.md")
        reviews_dir = folder / "reviews"
        n_reviews = (len(list(reviews_dir.glob("*.md")))
                     if reviews_dir.is_dir() else 0)
        records.append({"folder": folder, "name": folder.name, "fm": fm,
                        "artifacts": artifacts, "reviews": n_reviews})
    return records


def render_view(view_path: Path, root: Path) -> bool:
    text = view_path.read_text()
    fm = frontmatter(text)
    if fm.get("type") != "view":
        return False
    source = root / fm.get("source", "")
    records = load_records(source)
    group_by = fm.get("group_by", "")
    columns = [c for c in parse_list(fm.get("columns", ""))
               if c not in ("title",)]  # record link column is always first
    sort = parse_list(fm.get("sort", "")) or ["updated", "desc"]
    sort_key, sort_desc = sort[0], (len(sort) > 1 and sort[1] == "desc")

    # union of stage artifacts across records = the lineage columns
    stage_cols = sorted({a for r in records for a in r["artifacts"]})

    records.sort(key=lambda r: r["fm"].get(sort_key, ""), reverse=sort_desc)
    groups: dict[str, list[dict]] = {}
    for r in records:
        groups.setdefault(r["fm"].get(group_by, "—") if group_by else "all",
                          []).append(r)

    def rel(target: Path) -> str:
        # views/ lives one level under root; records paths are stable
        return "../" + target.relative_to(root).as_posix()

    lines = [f"_Rendered {date.today().isoformat()} by "
             f"`bin/render-views.py` — derived, do not edit._", ""]
    header = (["record"] + columns + [c[:-3] for c in stage_cols]
              + ["reviews"])
    for gname, rows in groups.items():
        if group_by:
            lines.append(f"### {gname} ({len(rows)})")
            lines.append("")
        lines.append("| " + " | ".join(header) + " |")
        lines.append("|" + "---|" * len(header))
        for r in rows:
            cells = [f"[{r['name']}]({rel(r['folder'] / 'item.md')})"]
            for c in columns:
                cells.append(str(r["fm"].get(c, "—")) or "—")
            for a in stage_cols:
                cells.append(f"[✓]({rel(r['folder'] / a)})"
                             if a in r["artifacts"] else "—")
            cells.append("✓" if r["reviews"] else "—")
            lines.append("| " + " | ".join(cells) + " |")
        lines.append("")

    view_path.write_text(replace_between(text, R_BEGIN, R_END,
                                         "\n".join(lines).rstrip()))

    # maintain the Artifacts section in each record's cover file
    for r in records:
        item = r["folder"] / "item.md"
        block_lines = ["## Artifacts", ""]
        for a in r["artifacts"]:
            block_lines.append(f"- [{a}]({a})")
        if r["reviews"]:
            block_lines.append(f"- reviews/: {r['reviews']} report(s) "
                               "(gitignored working papers)")
        if not r["artifacts"] and not r["reviews"]:
            block_lines.append("- (none yet)")
        item.write_text(replace_between(item.read_text(), A_BEGIN, A_END,
                                        "\n".join(block_lines)))
    return True


def main() -> int:
    ap = argparse.ArgumentParser(description="materialize view documents")
    ap.add_argument("--root", type=Path, default=Path.cwd())
    args = ap.parse_args()
    views = sorted((args.root / "views").glob("*.md"))
    done = sum(1 for v in views if render_view(v, args.root))
    print(f"render-views: {done} view(s) rendered")
    return 0


if __name__ == "__main__":
    sys.exit(main())
