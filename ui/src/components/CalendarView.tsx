import { useEffect, useState } from "react";
import { resolveView, type ResolvedView } from "../api";
import { buildMonthGrid, placeDocuments } from "../lib/ported/calendar-grid";
import { StatusChip } from "./StatusChip";
import { GridSkeleton, EmptyState, ErrorState } from "./folio/Feedback";
import { Icon } from "./folio/Icon";

// Calendar view over the ported (folio) calendar-grid math. The date
// field comes from the view definition's `date_field`; a flow-owned
// field (status) is never dragged here — v2 has no field-write
// endpoint, so the calendar is read + open (drag-to-reschedule is
// deferred with the field-write API).
export function CalendarView({
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
  const [ym, setYm] = useState(() => {
    const d = new Date();
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
  });

  useEffect(() => {
    let live = true;
    resolveView(name)
      .then((v) => live && setView(v))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [name, refreshKey]);

  if (error) return <ErrorState message={error} />;
  if (!view) return <GridSkeleton />;
  if (view.records.length === 0)
    return <EmptyState label="No records in this view." />;

  const dateField = view.definition.date_field || "updated";
  const grid = buildMonthGrid(ym.year, ym.month);
  const { byDay, unscheduled } = placeDocuments(view.records, dateField);
  const monthName = new Date(Date.UTC(ym.year, ym.month - 1, 1)).toLocaleString(
    "en",
    { month: "long", year: "numeric", timeZone: "UTC" },
  );
  const step = (delta: number) => {
    let m = ym.month + delta;
    let y = ym.year;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    setYm({ year: y, month: m });
  };

  return (
    <div className="calendar">
      <div className="cal-head">
        <button className="cal-nav" onClick={() => step(-1)} aria-label="previous month">
          <Icon name="left" size={16} />
        </button>
        <h2>{monthName}</h2>
        <button className="cal-nav" onClick={() => step(1)} aria-label="next month">
          <Icon name="right" size={16} />
        </button>
        <span className="muted cal-field">by {dateField}</span>
      </div>
      <div className="cal-dow">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="cal-dow-cell">{d}</div>
        ))}
      </div>
      <div className="cal-grid">
        {grid.map((cell) => (
          <div key={cell.iso} className={cell.inMonth ? "cal-cell" : "cal-cell out"}>
            <div className="cal-day">{cell.day}</div>
            {(byDay[cell.iso] || []).map((r) => (
              <button
                key={r.slug}
                className="cal-item"
                onClick={() => onOpen(`${r.domain}/${r.slug}`)}
                title={r.frontmatter.title || r.slug}
              >
                <StatusChip status={r.frontmatter.status || ""} />
                <span className="cal-item-title">{r.frontmatter.title || r.slug}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
      {unscheduled.length > 0 && (
        <div className="cal-unscheduled muted">
          {unscheduled.length} record{unscheduled.length > 1 ? "s" : ""} with no{" "}
          {dateField} date (not shown)
        </div>
      )}
    </div>
  );
}
