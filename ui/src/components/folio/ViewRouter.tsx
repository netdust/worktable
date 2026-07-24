// ViewRouter — the single exhaustive ViewType→renderer map (R01),
// carried from folio's view-router. The view definition's `view` field
// (table | list | kanban | calendar | timeline) selects exactly one
// renderer; every renderer takes the same presentational props
// (view, already-filtered records, effective groupBy, onOpen), so the
// frame never knows which view it is showing. An unknown type is a
// definition error surfaced honestly, not a blank pane — the map is the
// ONE place view types are enumerated.
import type { ComponentType } from "react";
import type { ResolvedView, RecordSummary } from "../../api";
import { TableView } from "../TableView";
import { KanbanView } from "../KanbanView";
import { CalendarView } from "../CalendarView";
import { TimelineView } from "../TimelineView";
import { EmptyState } from "./Feedback";

export interface RenderProps {
  view: ResolvedView;
  records: RecordSummary[]; // already filtered + sorted by the ViewFrame
  groupBy: string | null; // effective group field (control or view default)
  onOpen: (record: string) => void;
}

// `list` is a grouped table — the same renderer in grouped mode, not a
// second component (the harvested folio rule).
const RENDERERS: Record<string, ComponentType<RenderProps>> = {
  table: TableView,
  list: TableView,
  kanban: KanbanView,
  calendar: CalendarView,
  timeline: TimelineView,
};

export function ViewRouter({
  type,
  ...props
}: RenderProps & { type: string }) {
  const Renderer = RENDERERS[type];
  if (!Renderer) return <EmptyState label={`Unknown view type "${type}"`} />;
  return <Renderer {...props} />;
}

export const KNOWN_VIEW_TYPES = Object.keys(RENDERERS);
