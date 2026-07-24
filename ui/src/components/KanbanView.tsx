import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { resolveView, type ResolvedView, type RecordSummary } from "../api";
import { buildColumns } from "../lib/ported/board-grouping";
import { decideCardDrop } from "../lib/kanban";
import { parseList } from "../lib/records";
import { StatusChip } from "./StatusChip";
import { BoardSkeleton, EmptyState, ErrorState } from "./folio/Feedback";

// Kanban over the ported board-grouping math + a lean @dnd-kit/core
// shell (not folio's 518-line quirk-mass). Columns are the group_by
// field's values; cards drag BETWEEN columns to regroup. The drop
// decision is the pure, unit-tested `decideCardDrop` (seal-gating,
// R08) — this shell only renders it. Within-column ordering is out.
export function KanbanView({
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
  const [note, setNote] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

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

  const groupBy = view?.definition.group_by || "status";
  const order = useMemo(
    () => parseList(view?.definition.lanes),
    [view?.definition.lanes],
  );
  const columns = useMemo(
    () => (view ? buildColumns(view.records, groupBy, order) : []),
    [view, groupBy, order],
  );

  if (error) return <ErrorState message={error} />;
  if (!view) return <BoardSkeleton />;
  if (view.records.length === 0)
    return <EmptyState label="No records in this view." />;

  function onDragEnd(e: DragEndEvent) {
    const action = decideCardDrop({
      groupBy,
      record: String(e.active.id),
      from: (e.active.data.current?.column as string | null) ?? null,
      to: e.over ? String(e.over.id) : null,
      records: view!.records,
    });
    if (action.kind === "open") onOpen(action.record);
    else if (action.kind === "note") setNote(action.message);
  }

  return (
    <div className="kanban-wrap">
      {note && (
        <div className="kanban-note" role="status">
          {note}
          <button className="note-x" onClick={() => setNote(null)} aria-label="dismiss">
            ×
          </button>
        </div>
      )}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="kanban">
          {columns.map((col) => (
            <Column
              key={col.value ?? "__null__"}
              id={col.value ?? "__null__"}
              label={col.label}
              records={col.records}
              onOpen={onOpen}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

function Column({
  id,
  label,
  records,
  onOpen,
}: {
  id: string;
  label: string;
  records: RecordSummary[];
  onOpen: (record: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section ref={setNodeRef} className={isOver ? "kan-col over" : "kan-col"}>
      <header className="kan-col-head">
        <StatusChip status={label === "—" ? "" : label} />
        <span className="count">{records.length}</span>
      </header>
      <div className="kan-col-body">
        {records.map((r) => (
          <Card
            key={`${r.domain}/${r.slug}`}
            record={r}
            column={id === "__null__" ? null : id}
            onOpen={onOpen}
          />
        ))}
      </div>
    </section>
  );
}

function Card({
  record,
  column,
  onOpen,
}: {
  record: RecordSummary;
  column: string | null;
  onOpen: (record: string) => void;
}) {
  const id = `${record.domain}/${record.slug}`;
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id, data: { column } });
  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;
  return (
    <article
      ref={setNodeRef}
      className={isDragging ? "kan-card dragging" : "kan-card"}
      style={style}
      onClick={() => onOpen(id)}
      {...listeners}
      {...attributes}
    >
      <div className="kan-card-title">
        {record.frontmatter.title || record.slug}
      </div>
      <div className="kan-card-meta">
        {record.frontmatter.updated && (
          <span className="muted">{record.frontmatter.updated}</span>
        )}
        {record.reviews > 0 && (
          <span className="reviews-badge" title="attested reviews">
            ✓ {record.reviews}
          </span>
        )}
        {record.frontmatter.awaiting_seal && (
          <span className="seal-flag" title="awaiting a sealed decision">
            ⧗ seal
          </span>
        )}
      </div>
    </article>
  );
}
