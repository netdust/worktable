// url.ts — the active view and open record live in the URL query
// params (?view=…&record=…), so state is shareable and reload-stable.
// One hook owns hydration: components read this state and navigate
// through it; nobody writes window.location directly.

import { useCallback, useEffect, useState } from "react";

export interface UrlState {
  view: string | null;
  record: string | null; // "<domain>/<slug>"
}

function read(): UrlState {
  const p = new URLSearchParams(window.location.search);
  return { view: p.get("view"), record: p.get("record") };
}

export function useUrlState(): [UrlState, (next: Partial<UrlState>) => void] {
  const [state, setState] = useState<UrlState>(read);

  useEffect(() => {
    const onPop = () => setState(read());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((next: Partial<UrlState>) => {
    const merged = { ...read(), ...next };
    const p = new URLSearchParams();
    if (merged.view) p.set("view", merged.view);
    if (merged.record) p.set("record", merged.record);
    const qs = p.toString();
    window.history.pushState(null, "", qs ? `?${qs}` : window.location.pathname);
    setState(merged);
  }, []);

  return [state, navigate];
}
