// live.ts — the SSE subscription. Native EventSource cannot send an
// Authorization header, so we stream /events via fetch and read the
// body incrementally, emitting a debounced tick on each `event:
// change` frame. No state lives here — the tick just tells the UI to
// re-read (the server is the source of truth).

import { getToken, notifyUnauthorized } from "./api";

export function subscribeChanges(
  onChange: () => void,
  opts: { debounceMs?: number } = {},
): () => void {
  const debounceMs = opts.debounceMs ?? 250;
  const controller = new AbortController();
  let timer: number | undefined;
  let stopped = false;

  const fire = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(onChange, debounceMs) as unknown as number;
  };

  async function run() {
    while (!stopped) {
      try {
        const res = await fetch("/events", {
          headers: { Authorization: `Bearer ${getToken()}` },
          signal: controller.signal,
        });
        if (res.status === 401) {
          // the token went stale — route to the gate, don't reconnect
          // forever against a 401 (review finding)
          stopped = true;
          notifyUnauthorized();
          return;
        }
        if (!res.ok || !res.body) throw new Error(`events ${res.status}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (!stopped) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            if (line.startsWith("event: change")) fire();
          }
        }
      } catch {
        if (stopped) return;
        await new Promise((r) => setTimeout(r, 1500)); // reconnect backoff
      }
    }
  }
  run();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    controller.abort();
  };
}
