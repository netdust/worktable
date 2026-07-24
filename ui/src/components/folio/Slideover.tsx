// Slideover — the folio detail-panel chrome, extracted as reusable
// shell: a scrim, a right-anchored sliding panel, Escape-to-close, and
// focus moved into the panel on open (keyboard users land inside it).
// The panel's CONTENT (header, tabs, seal) is passed as children; this
// owns only the chrome, so the record panel is just its body.
import { useEffect, useRef, type ReactNode } from "react";

export function Slideover({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="panel-overlay" onClick={onClose}>
      <aside
        className="panel"
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        <button className="panel-close" onClick={onClose} aria-label="close">
          ×
        </button>
        {children}
      </aside>
    </div>
  );
}
