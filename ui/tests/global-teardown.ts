import { rmSync } from "node:fs";
import { FIXTURE_DIR } from "./fixture";

export default async function globalTeardown() {
  const pid = (globalThis as Record<string, unknown>).__srvPid as
    | number
    | undefined;
  if (pid) {
    try {
      process.kill(-pid);
    } catch {
      try {
        process.kill(pid);
      } catch {
        /* already gone */
      }
    }
  }
  rmSync(FIXTURE_DIR, { recursive: true, force: true });
}
