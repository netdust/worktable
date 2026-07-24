import { statusColor } from "../lib/records";

export function StatusChip({ status }: { status: string }) {
  if (!status) return <span className="chip chip-empty">—</span>;
  const { bg, fg } = statusColor(status);
  return (
    <span className="chip" style={{ background: bg, color: fg }}>
      {status}
    </span>
  );
}
