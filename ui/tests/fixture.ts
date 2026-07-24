// Shared fixture constants for the e2e suite: a temp worktable folder
// (its own git repo, so seals work), the server port, and the token.
import { tmpdir } from "node:os";
import { join } from "node:path";

export const TOKEN = "e2e-token";
export const API_PORT = 8791;
export const FIXTURE_DIR = join(tmpdir(), "worktable-ui-e2e");
export const NETDUST_FLOW =
  process.env.WORKTABLE_NETDUST_FLOW || "/home/user/netdust-flow";
