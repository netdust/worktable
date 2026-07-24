// records.ts — framework-free helpers over a record list. Pure
// functions, unit-tested (T07), carried in spirit from the folio
// harvest's framework-free layout modules. No React here.

import type { RecordSummary, ViewDef, FlowDef, ViewListItem } from "../api";

export interface Column {
  key: string;
  label: string;
}

// A "project" in worktable is a source folder (records/<domain>) that
// one or more views read from — the sidebar nests views under their
// project, mirroring folio's rail (project → views). Derived purely
// from the view list; no backend concept required.
export interface Project {
  source: string;
  label: string;
  views: ViewListItem[];
}

export function projectsOf(views: ViewListItem[]): Project[] {
  const bySource = new Map<string, ViewListItem[]>();
  for (const v of views) {
    const src = v.definition.source || "(no source)";
    const bucket = bySource.get(src);
    if (bucket) bucket.push(v);
    else bySource.set(src, [v]);
  }
  return [...bySource.entries()].map(([source, vs]) => ({
    source,
    label: projectLabel(source),
    views: vs,
  }));
}

function projectLabel(source: string): string {
  const seg = source.replace(/\/+$/, "").split("/");
  return humanize(seg[seg.length - 1] || source);
}

/** Columns for a table: the record link is always first (rendered by
 *  the view), then the definition's declared columns. `title` is
 *  dropped — it is the link column, not a data column. */
export function columnsOf(def: ViewDef): Column[] {
  const declared = parseList(def.columns).filter((c) => c !== "title");
  return declared.map((key) => ({ key, label: humanize(key) }));
}

/** Accept every form a view definition uses: `[a, b]`, `a, b`, `a b`,
 *  `a` — matching the server's parser so the UI and API agree. */
export function parseList(raw: string | undefined): string[] {
  let s = (raw || "").trim();
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  const parts = s.includes(",") ? s.split(",") : s.split(/\s+/);
  return parts.map((p) => p.trim()).filter(Boolean);
}

export function humanize(key: string): string {
  return key.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** The folio status model: every status maps to one of five semantic
 *  CATEGORIES, and the category — not the raw string — drives colour.
 *  This is what gives folio its calm palette (a coloured dot + coloured
 *  text, per Linear) instead of a per-string rainbow. Worktable statuses
 *  are free-form, so an unknown value falls to the neutral `backlog`
 *  category rather than inventing a hue. */
export type StatusCategory =
  | "backlog"
  | "unstarted"
  | "started"
  | "completed"
  | "cancelled";

const CATEGORY_OF: Record<string, StatusCategory> = {
  // unstarted — queued, not begun (info / blue)
  new: "unstarted",
  todo: "unstarted",
  backlog: "unstarted",
  planned: "unstarted",
  // started — work in flight (warning / amber)
  researched: "started",
  drafted: "started",
  reviewed: "started",
  doing: "started",
  "in-progress": "started",
  contacted: "started",
  building: "started",
  // completed — done (success / green)
  final: "completed",
  done: "completed",
  sent: "completed",
  approved: "completed",
  shipped: "completed",
  // cancelled — abandoned (danger / muted, struck)
  rejected: "cancelled",
  cancelled: "cancelled",
  dropped: "cancelled",
};

export function statusCategory(status: string): StatusCategory {
  return CATEGORY_OF[status.trim().toLowerCase()] ?? "backlog";
}

/** Ordered non-empty groups for a grouped table; if the view has no
 *  group_by, one implicit group holding every record in order. */
export function groupRecords(
  records: RecordSummary[],
  groups: { value: string; records: string[] }[],
  groupBy: string | undefined,
): { value: string | null; records: RecordSummary[] }[] {
  if (!groupBy) return [{ value: null, records }];
  const bySlug = new Map(records.map((r) => [r.slug, r]));
  return groups.map((g) => ({
    value: g.value,
    records: g.records
      .map((slug) => bySlug.get(slug))
      .filter((r): r is RecordSummary => Boolean(r)),
  }));
}

/** Tab order for the record panel: the flow's node `out:` sequence
 *  (artifacts named by earlier nodes come first), then any remaining
 *  artifacts by name. Cover (item.md body) is prepended by the panel;
 *  this orders the artifact tabs only. */
export function orderArtifacts(
  artifacts: string[],
  flow: FlowDef | null,
): string[] {
  if (!flow) return [...artifacts].sort();
  const rank = new Map<string, number>();
  let i = 0;
  for (const node of flow.nodes) {
    for (const out of node.out || []) {
      const file = out.trim();
      if (!rank.has(file)) rank.set(file, i++);
    }
  }
  return [...artifacts].sort((a, b) => {
    const ra = rank.has(a) ? rank.get(a)! : Number.MAX_SAFE_INTEGER;
    const rb = rank.has(b) ? rank.get(b)! : Number.MAX_SAFE_INTEGER;
    return ra !== rb ? ra - rb : a.localeCompare(b);
  });
}
