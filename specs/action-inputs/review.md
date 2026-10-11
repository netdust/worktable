# Review: action-inputs (F2)

Reviews of 2026-10-11: superpowers whole-branch review (opus) and security-sentinel. Fix pass on feature/action-inputs.

## F2 — feature/action-inputs (verdict: with fixes)
1. (Important) Rename the action: it moves one tourstop, not a tour. Ruling: `tourstop_verschuiven`, label "Tourstop verschuiven" (theatre `actions.ts`, `index.ts`, tests). Moving every stop of a production is a different design, not built.
2. (Important) `ctx.findAll` was added by ruling, outside the approved finding. Keep it (the approved test cannot pass without it); Stefan is asked. Add to its doc comment in `declare.ts`: no scope applied; never copy its rows into what an owner-reachable action returns or refuses.
3. (Should fix, sentinel M6) Integer inputs must declare both `min` and `max`, finite numbers; validation refuses otherwise (theatre declares ±365). Test the refusals.
4. (Minor, do it) A required boolean starts as `false` in the drawer, so it can be sent without ticking twice (`Drawer.tsx` `typedValid`/`TypedInput`). Test it.
5. (Minor, do it) OpenAPI: `input` gets `additionalProperties: false`; omit `required` when empty. Test the typed-input OpenAPI output.
6. (Minor, do it) Test the `findAll` cap: 5001 matching rows refuse with 422.
Left as is (noted): `inputProblem` keeps its own checks instead of `fits` (equivalent); casts in domain code; the English cap message (engine messages are English); the grid's hard-coded 500 (matches MAX_INPUT_TEXT); `shifted` on a malformed stored date (values are validated).

## Fixed
1. f4151ba — renamed to `tourstop_verschuiven`, label "Tourstop verschuiven" (theatre `actions.ts`, `index.ts`, tests); test: theatre `shift.test.ts` 'is served on the tourstop as "Tourstop verschuiven"', and every request in it posts to `/api/actions/tourstop_verschuiven`.
2. 62304b8 — `findAll` doc comment in `declare.ts`: no scope applied; never copy its rows into what an owner-reachable action returns or refuses. Kept by ruling; Stefan is asked.
3. f0159dc — `checkInput` refuses an integer input without finite `min` and `max` (and the spec says so); test: engine `actions.test.ts` 'validation refuses an integer input with %s' (no bounds, no max, no min, infinite, NaN, text).
4. d004baf — a required boolean starts as `false` in the drawer; test: `Drawer.test.tsx` 'starts a required yes/no unticked as false, so it runs without a tick'.
5. 76fa858 — OpenAPI `input` carries `additionalProperties: false` and omits `required` when empty; test: `openapi.test.ts` 'typed action inputs: their schemas, no other keys, and required only when something is'.
6. c4a2bb0 — the cap through `POST /actions/:name`: 5000 rows read, 5001 refuse with 422 and write nothing; test: `actions.test.ts` 'ctx.findAll in an action' (the cap existed; the test fails with the cap loosened by one).
