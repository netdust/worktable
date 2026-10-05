# Worktable: rules for agents

Worktable is a standalone planning and views engine. `docs/SPEC.md` is the contract. If this file and the spec disagree, the spec wins; tell the owner.

## The one rule
`packages/engine` knows shapes (dataset, query, writer, skin needs, views, publication, actors) and never a domain word. A dataset may also declare a lifecycle, a record token and one public-create action. The engine never knows what they mean in a domain. Domain packages (`theatre`, `fiche`, later others) declare names. `engine` must never import from a domain package. `bun run check` enforces it.

## Layout
- `packages/engine`: shapes, REST, migrations, views, publication, actors
- `packages/theatre`: theatre datasets, SQL views, writers, seeds
- `packages/fiche`: Doorverwijsgids fiches; stays in the repo as the proof that the engine is domain-free
- `apps/grid`: the React grid, talking to the engine's REST only

## Stack
Bun, Hono, Drizzle, SQLite, Zod, Biome, TypeScript. One engine instance per client, one database file each. No WordPress code anywhere in this repo. Multi-tenant hosting is out.

## Scope
Build only what the Scope lock in the spec lists as "in". Anything in the "out" column (admin-created datasets, resources, run-of-show, child spaces, urensaldo, leave approval) is not built, not stubbed, not "prepared for". Changing scope is a decision by the owner, made by editing the spec first.

## Order of work
Follow the build steps in the spec. A step is done when its acceptance gate passes in a real browser, not when the code exists. Do not start step N+1 before step N's gate passes.

## Working rules
- Do not propose a different architecture. If something in the spec cannot work, say what and why, with evidence, and stop.
- Domain rules (refuse rules, day line, conflict types) live in domain writers and SQL views, never in the engine.
- Queries are SQL views. They store nothing and join datasets only.
- Custom fields live in each dataset's `velden` JSON column, declared in the Veld table. Never create a table for them.
- Datasets are code. Admins create fields, views, templates and publications, never datasets.
- Names in the domain are Dutch as in the spec (Activiteit, Toewijzing, Weergave). Names in the engine are English and generic.
- Copy from Folio: the filter AST compiler, the shape of its views and fields tables, magic-link sessions. Copy from ntdst-baseline only the TypeScript and React of its views app (services/views/app), never PHP. Nothing else.
- No client data in this repo. Fixtures are invented.
- Gates run in this repo's own browser e2e harness, not Laika's.
- Importing existing data is a generic command that reads JSON. Exporters live in the client's own repo. No client data and no WordPress code here.
