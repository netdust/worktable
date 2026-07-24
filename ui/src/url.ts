// url.ts — the active view, open record, and the ephemeral view controls
// (group / sort / filters) all live in the URL query params, so state is
// shareable and reload-stable. One hook owns hydration: components read
// this state and navigate through it; nobody writes window.location
// directly.

import { useCallback, useEffect, useState } from "react";

export interface UrlState {
  view: string | null;
  record: string | null; // "<domain>/<slug>"
  group: string | null; // control: group-by override
  sort: string | null; // control: "field.dir"
  filters: string | null; // control: encoded filter clauses
}

const KEYS: (keyof UrlState)[] = ["view", "record", "group", "sort", "filters"];

function read(): UrlState {
  const p = new URLSearchParams(window.location.search);
  return {
    view: p.get("view"),
    record: p.get("record"),
    group: p.get("group"),
    sort: p.get("sort"),
    filters: p.get("filters"),
  };
}

type Navigate = (next: Partial<UrlState>, opts?: { replace?: boolean }) => void;

export function useUrlState(): [UrlState, Navigate] {
  const [state, setState] = useState<UrlState>(read);

  useEffect(() => {
    const onPop = () => setState(read());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // `replace` for state the user didn't choose (the default-view seed)
  // so it doesn't leave a dead Back-button entry; push otherwise.
  const navigate = useCallback(
    (next: Partial<UrlState>, opts: { replace?: boolean } = {}) => {
      const merged = { ...read(), ...next };
      const p = new URLSearchParams();
      for (const k of KEYS) {
        const v = merged[k];
        if (v) p.set(k, v);
      }
      const qs = p.toString();
      const url = qs ? `?${qs}` : window.location.pathname;
      if (opts.replace) window.history.replaceState(null, "", url);
      else window.history.pushState(null, "", url);
      setState(merged);
    },
    [],
  );

  return [state, navigate];
}
