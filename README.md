# Worktable
A standalone planning and views engine: shapes in the engine, names in domain packages.
Layout: `packages/engine` (shapes, REST, views), `packages/theatre` and `packages/fiche` (domains), `apps/grid` (the React grid), `packages/mcp` (the MCP server).
MCP: `bun packages/mcp/src/main.ts --url http://127.0.0.1:<port> --token-file <absolute path, mode 0600>`; the file holds a service account's token.
Stack: Bun, Hono, Drizzle, SQLite, Zod, Biome, TypeScript; `bun run check` runs the boundary check, Biome and the type check.
Read docs/SPEC.md.
