// kanban.ts — the pure drag-decision for the kanban board, extracted so
// the seal-gating rule (R08) is unit-tested without simulating a drag.
//
// The seal is the only write. When a card is dropped on a different
// column, this decides what happens WITHOUT ever writing a field:
//   - flow-owned field (status …) + record awaiting a seal → OPEN the
//     record so the human decides at its seal actions.
//   - flow-owned field, not awaiting a seal → a NOTE: this move needs a
//     sealed decision, not a drag (no silent write).
//   - non-flow field, no field-write endpoint in v2 → a NOTE: not saved.
//   - dropped on its own column / nowhere → NOOP.
import type { RecordSummary } from "../api";

// Fields a flow owns; a view must never write these from a drag.
export const FLOW_OWNED = new Set(["status"]);

export type DropAction =
  | { kind: "noop" }
  | { kind: "open"; record: string }
  | { kind: "note"; message: string };

export function decideCardDrop(params: {
  groupBy: string;
  record: string; // "<domain>/<slug>"
  from: string | null; // column the card came from
  to: string | null; // column dropped on ("__null__" for the unset col)
  records: RecordSummary[];
}): DropAction {
  const { groupBy, record, from, to, records } = params;
  if (to === null) return { kind: "noop" };
  if (to === (from ?? "__null__")) return { kind: "noop" };

  if (FLOW_OWNED.has(groupBy)) {
    const rec = records.find((r) => `${r.domain}/${r.slug}` === record);
    if (rec?.frontmatter.awaiting_seal) return { kind: "open", record };
    return {
      kind: "note",
      message:
        `“${groupBy}” is a flow-owned field — moving a card needs a ` +
        `sealed decision, not a drag. Open the record to act on its flow.`,
    };
  }
  return {
    kind: "note",
    message:
      `No field-write endpoint in v2 — “${groupBy}” changes aren't ` +
      `persisted yet. This move is not saved.`,
  };
}
