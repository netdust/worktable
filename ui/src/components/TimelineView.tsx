import { useEffect, useMemo, useState } from "react";
import { resolveView, type ResolvedView, type RecordSummary } from "../api";
import {
  buildTimeScale,
  placeOnTimeline,
  type TimelineZoom,
} from "../lib/ported/timeline-lanes";
import { bucketKey } from "../lib/ported/calendar-grid";
import { StatusChip } from "./StatusChip";
import { LanesSkeleton, EmptyState, ErrorState } from "./folio/Feedback";

// Timeline (Gantt-ish) over the ported timeline-lanes math. Each record
// is a lane; a bar spans the columns between its start and end fields
// (single-date records get a one-column bar). Zoom switches the column
// granularity day/week/month. The date fields come from the view
// definition: start_field / end_field / date_field (fallback). The
// visible range is derived from the records' own dates.
const ZOOMS: TimelineZoom[] = ["day", "week", "month"];

export function TimelineView({
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
  const [zoom, setZoom] = useState<TimelineZoom>("week");

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

  const fields = useMemo(() => {
    const d = view?.definition;
    return {
      startField: d?.start_field || "start",
      endField: d?.end_field || "end",
      fallbackField: d?.date_field || "updated",
    };
  }, [view?.definition]);

  const range = useMemo(
    () => (view ? deriveRange(view.records, fields) : null),
    [view, fields],
  );
  const scale = useMemo(
    () => (range ? buildTimeScale(range.start, range.end, zoom) : []),
    [range, zoom],
  );
  const placement = useMemo(
    () => (view ? placeOnTimeline(view.records, fields, scale) : null),
    [view, fields, scale],
  );

  if (error) return <ErrorState message={error} />;
  if (!view) return <LanesSkeleton />;
  if (!range)
    return <EmptyState label="No records with a date to place on the timeline." />;

  const bySlug = new Map(view.records.map((r) => [r.slug, r]));

  return (
    <div className="timeline-wrap">
      <div className="tl-head">
        <div className="tl-zoom" role="group" aria-label="zoom">
          {ZOOMS.map((z) => (
            <button
              key={z}
              className={z === zoom ? "tl-zoom-btn active" : "tl-zoom-btn"}
              onClick={() => setZoom(z)}
            >
              {z}
            </button>
          ))}
        </div>
        <span className="muted tl-fields">
          {fields.startField} → {fields.endField}
        </span>
      </div>
      <div className="tl-grid" style={{ ["--cols" as string]: scale.length }}>
        <div className="tl-corner" />
        <div className="tl-scale">
          {scale.map((c) => (
            <div key={c.key} className="tl-col-head" title={c.startIso}>
              {c.label}
            </div>
          ))}
        </div>
        {placement!.placed.map((bar) => {
          const r = bySlug.get(bar.slug);
          if (!r) return null;
          return (
            <TimelineRow
              key={bar.slug}
              record={r}
              colStart={bar.colStart}
              colSpan={bar.colSpan}
              cols={scale.length}
              clamped={bar.clamped}
              onOpen={onOpen}
            />
          );
        })}
      </div>
      {placement!.unplaced.length > 0 && (
        <div className="tl-unplaced muted">
          {placement!.unplaced.length} record
          {placement!.unplaced.length > 1 ? "s" : ""} without a date (not shown)
        </div>
      )}
    </div>
  );
}

function TimelineRow({
  record,
  colStart,
  colSpan,
  cols,
  clamped,
  onOpen,
}: {
  record: RecordSummary;
  colStart: number;
  colSpan: number;
  cols: number;
  clamped?: boolean;
  onOpen: (record: string) => void;
}) {
  const id = `${record.domain}/${record.slug}`;
  return (
    <>
      <div className="tl-lane-label" title={record.slug}>
        {record.frontmatter.title || record.slug}
      </div>
      <div className="tl-lane" style={{ ["--cols" as string]: cols }}>
        <button
          className={clamped ? "tl-bar clamped" : "tl-bar"}
          style={{ gridColumn: `${colStart + 1} / span ${colSpan}` }}
          onClick={() => onOpen(id)}
          title={clamped ? "start after end — span clamped" : record.slug}
        >
          <StatusChip status={record.frontmatter.status || ""} />
          <span className="tl-bar-title">
            {record.frontmatter.title || record.slug}
          </span>
        </button>
      </div>
    </>
  );
}

// Derive the visible [start, end] from the records' own dates across
// all three fields. Null when nothing is datable.
function deriveRange(
  records: RecordSummary[],
  fields: { startField: string; endField: string; fallbackField: string },
): { start: string; end: string } | null {
  const dates: string[] = [];
  for (const r of records) {
    for (const f of [fields.startField, fields.endField, fields.fallbackField]) {
      const k = bucketKey(r.frontmatter[f]);
      if (k) dates.push(k);
    }
  }
  if (dates.length === 0) return null;
  dates.sort();
  return { start: dates[0], end: dates[dates.length - 1] };
}
