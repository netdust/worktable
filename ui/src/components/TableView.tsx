import { useEffect, useState } from "react";
import { resolveView, type ResolvedView } from "../api";
import { columnsOf, groupRecords } from "../lib/records";
import { StatusChip } from "./StatusChip";

// One renderer for both `table` and `list` (grouped) — grouping is a
// mode driven by the view's group_by, not a second component (the
// harvested rule). Records are body-less here; the panel loads detail.
export function TableView({
  name,
  refreshKey,
  onOpen,
}: {
  name: string;
  refreshKey: number;
  onOpen: (record: string) => void;
}) {
  const [view, setView] = useState<ResolvedView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setError(null);
    resolveView(name)
      .then((v) => live && setView(v))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [name, refreshKey]);

  if (error) return <div className="pane-msg error">{error}</div>;
  if (!view) return <div className="pane-msg muted">Loading…</div>;

  const columns = columnsOf(view.definition);
  const groupBy = view.definition.group_by;
  const groups = groupRecords(view.records, view.groups, groupBy);
  const colSpan = columns.length + 1;

  return (
    <div className="table-wrap">
      <table className="records">
        <thead>
          <tr>
            <th>Record</th>
            {columns.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <GroupRows
              key={g.value ?? "_all"}
              value={g.value}
              records={g.records}
              columns={columns}
              colSpan={colSpan}
              onOpen={onOpen}
            />
          ))}
          {view.records.length === 0 && (
            <tr>
              <td colSpan={colSpan} className="muted">
                No records.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({
  value,
  records,
  columns,
  colSpan,
  onOpen,
}: {
  value: string | null;
  records: { domain: string; slug: string; frontmatter: Record<string, string> }[];
  columns: { key: string; label: string }[];
  colSpan: number;
  onOpen: (record: string) => void;
}) {
  return (
    <>
      {value !== null && (
        <tr className="group-header">
          <td colSpan={colSpan}>
            {value} <span className="count">{records.length}</span>
          </td>
        </tr>
      )}
      {records.map((r) => {
        const id = `${r.domain}/${r.slug}`;
        return (
          <tr key={id} className="record-row" onClick={() => onOpen(id)}>
            <td className="record-link">{r.frontmatter.title || r.slug}</td>
            {columns.map((c) => (
              <td key={c.key}>
                {c.key === "status" ? (
                  <StatusChip status={r.frontmatter.status || ""} />
                ) : (
                  r.frontmatter[c.key] || "—"
                )}
              </td>
            ))}
          </tr>
        );
      })}
    </>
  );
}
