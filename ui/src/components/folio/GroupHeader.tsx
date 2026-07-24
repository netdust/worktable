// GroupHeader + DistributionBar — the folio grouped-view chrome. A
// group header carries its value label, a count, and (when the records
// carry a status) a thin distribution bar summarizing status mix within
// the group. Carried from folio's group-header-row / distribution-bar
// leaves, rebuilt over worktable's RecordSummary. Pure presentation.
import type { RecordSummary } from "../../api";
import { statusColor } from "../../lib/records";

// Count records by status, folding no-status into "—". Pure + exported
// so the distribution math is unit-tested without mounting the bar.
export function statusCounts(records: RecordSummary[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const r of records) {
    const s = r.frontmatter.status || "—";
    counts.set(s, (counts.get(s) || 0) + 1);
  }
  return [...counts.entries()];
}

export function DistributionBar({ records }: { records: RecordSummary[] }) {
  // A segment per distinct status, width proportional to share, summing
  // to the group size.
  const total = records.length || 1;
  const segments = statusCounts(records);
  if (segments.length <= 1) return null; // nothing to distribute

  return (
    <span
      className="dist-bar"
      role="img"
      aria-label={segments.map(([s, n]) => `${s}: ${n}`).join(", ")}
    >
      {segments.map(([status, n]) => {
        const { bg } = statusColor(status === "—" ? "" : status);
        return (
          <span
            key={status}
            className="dist-seg"
            style={{ width: `${(n / total) * 100}%`, background: bg }}
            title={`${status}: ${n}`}
          />
        );
      })}
    </span>
  );
}

export function GroupHeader({
  label,
  records,
  colSpan,
}: {
  label: string;
  records: RecordSummary[];
  colSpan: number;
}) {
  return (
    <tr className="group-header">
      <td colSpan={colSpan}>
        <span className="group-label">{label}</span>{" "}
        <span className="count">{records.length}</span>
        <DistributionBar records={records} />
      </td>
    </tr>
  );
}
