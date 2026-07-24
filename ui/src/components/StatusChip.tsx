import { statusCategory } from "../lib/records";

// The status pill, folio-style: a small coloured dot + coloured text,
// where the colour comes from the status's semantic CATEGORY (not the
// raw string). Keeps the `.chip` hook the views/tests rely on; the
// category adds the colour class. An empty status is a neutral dash.
export function StatusChip({ status }: { status: string }) {
  if (!status) return <span className="chip chip-empty">—</span>;
  const cat = statusCategory(status);
  return (
    <span className={`chip chip-${cat}`}>
      <span className="chip-dot" aria-hidden />
      {status}
    </span>
  );
}
