# Shake-out: action-inputs (F2, typed action inputs; "Tourstop verschuiven")

Driven 2026-10-11 on `feature/action-inputs` at 33422cc (the reviewed and fixed code), in the worktree `worktable-f2`,
through the repo's own Playwright harness (`playwright.config.ts`). The harness starts a fresh invented theatre
engine at 127.0.0.1:4311 with its grid at 127.0.0.1:5174 (and the fiche pair at 4312/5175). It signs in its invented
accounts through the magic-link form: editor `planner@e2e.test` for every flow, administrator `beheer@e2e.test` to
set a producer's parameters, and owner `lotte@e2e.test` for the denied-actor edge. Every flow ran in a real Chromium
at 1600×900. The theatre seed has no tourstop with activities, so each flow makes its own on the API in an empty
week of 2028 (Mon 5 – Sun 11 June). The tourstop runs Wed 7 – Fri 9 June at Theater Het Anker and has three
activities: "opbouw" on 7 June with no time, "avond" on 8 June 20:00–22:00, and "nacht" on 9 June 01:00–02:30,
past the day line, so its plandag is 8 June. Each flow deletes what it made, whatever happens. Screenshots are the
viewport, written by `e2e/shots.ts`.

Sweep:
- Full Playwright run with the new specs: 186/187. The one failure was `toolbar.spec.ts` › `autosave-own-view`, a
  30 s timeout on `GET /api/views` under load. Re-run right after the action-inputs flows, `toolbar.spec.ts` passed
  whole (15/15 with the two flows). It does not touch this feature's files.
- Every registered test passed in at least one run, so every CHECKS row's `verified` is bumped to 33422cc.

No plan exists for F2 (the findings section and its review are the spec). The flows are the two the caller named:
1. "Tourstop verschuiven" in a tourstop's drawer: the Dagen field, its bounds, a run of 3 and of −2 moving the
   tourstop and its activities (grid and API), and one undo restoring them
2. a refusal shows under the action in Dutch

The flows are in `e2e/action-inputs.spec.ts` (`@e2e`); the read-only checks in `e2e/smoke/action-inputs.spec.ts`
(`@smoke`).

| # | Flow | Layer | Verdict | Evidence |
|---|---|---|---|---|
| 1 | shift-tourstop: Planning lands on the week (Plandag tussen 2028-06-05 en 2028-06-11). The three activities sit under Woensdag 7 juni (opbouw) and Donderdag 8 juni (avond, nacht). Tourstops, narrowed to Naam is "Tourstop e2e verschuiven" › Openen: the drawer shows the group "Tourstop verschuiven" with a "Dagen" number field (spinbutton), empty, and its run button disabled. Boundary: 400, −366, 366 and 1.5 keep it disabled; so does clearing the field. 3 enables it. Run → POST /api/actions/tourstop_verschuiven 201, notice "Tourstop verschuiven uitgevoerd." with "Ongedaan maken". On the server: the tourstop runs 10–12 June; opbouw is on 10 June; avond is on 11 June 20:00–22:00; nacht is on 12 June 01:00–02:30, plandag 11 June (the day line kept). The Tourstops row reads Start 10-06-2028, Einde 12-06-2028. In Planning: opbouw is under Zaterdag 10 juni, avond and nacht under Zondag 11 juni. One Ctrl+Z from a Planning cell → POST /api/batches/…/undo 200, and everything is back on the server and in the bands. Then −2 → 201: the tourstop runs 5–7 June and the activities move to 5, 6 and 7 June (plandag 5, 6, 6). The notice's "Ongedaan maken" → undo 200 restores everything; the Tourstops row reads 07-06-2028 / 09-06-2028 again. Boundary (wire): `dagen` 400, 1.5 and "3" are each 400, naming `input.dagen`; an unknown key `uren` is 400. Nothing moves. | browser | pass | Browser: http://127.0.0.1:5174/#view=10 · shakeout/tourstop-moved.png (the row at 10–12 June, the notice); the drawer with Dagen 3 before the run: shakeout/drawer-dagen.png; Planning after the shift: shakeout/planning-moved.png. Test: `e2e/action-inputs.spec.ts` › `shift-tourstop @e2e` |
| 2 | shift-refused-in-dutch: the administrator makes the producer "Gezelschap e2e kort" (soort eigen, `max_speelreeks_dagen` 5); the editor makes "Productie e2e kort" under it and the tourstop "Tourstop e2e geweigerd" of three days with its activities. The administrator then lowers the cap to 2 (an editor is refused: 403 "Alleen een beheerder wijzigt parameters."). In the drawer, Dagen 3 › Tourstop verschuiven → 422. Under the run button, `role="alert"`: "Een tourstop duurt hoogstens 2 dagen." The alert sits below the button; the button can be pressed again; nothing moved on the server. Denied actor (wire): the owner's POST of the same action → 404, nothing moved. Concurrent edge: someone deletes the tourstop and its activities while the drawer is open; Tourstop verschuiven → 404. An alert shows under the action and nothing is written, but the alert is in English (see Observations). | browser | pass | Browser: http://127.0.0.1:5174/#view=10 · shakeout/refused-in-dutch.png (the Dutch refusal under the action); the concurrent delete: shakeout/refused-deleted.png. Test: `e2e/action-inputs.spec.ts` › `shift-refused-in-dutch @e2e` |

Edges not driven, with the reason:
- Date, text and boolean inputs, and the required yes/no starting as false (review finding 4): no action in this
  repo declares one, so the browser cannot reach them. They are covered by `Drawer.test.tsx` and engine
  `actions.test.ts`.
- The `findAll` cap (5001 activities → 422): engine `actions.test.ts`. The browser would need 5001 rows that the
  other specs share.
- Double-submit: the run button is disabled while the request is out (`sending.status === 'sent'`), and a second
  run is a second batch by design.

Bite check: which test goes red when a dangerous path breaks.
- The engine's input check (`inputProblem`, threat 1): row 1, wire part (400, 1.5 and "3" are each 400; an unknown
  key is 400; the dates stay unchanged).
- The drawer's `typedValid` (the run waits for a value the engine would take): row 1 (disabled for empty, 400,
  ±366, 1.5).
- The shift itself (`shifted`, time of day kept, plandag recomputed by the writer): row 1 (exact server values after
  +3 and −2, the past-midnight activity's plandag).
- One batch and one undo for the tourstop and every activity: row 1 (Ctrl+Z and the notice's undo restore all four
  rows).
- A writer's refusal going back through the action and shown under it: row 2.
- Scope on the action's record (owner): row 2, wire part (404).

Observations while driving (outside this diff, which predates F2):
- A refusal of a record that is gone is in English. Reproduce cold: sign in as the editor and open a tourstop's
  drawer from Tourstops. In another session, delete that tourstop (and first its activities). Type 3 in Dagen and
  press Tourstop verschuiven. The server answers 404 `{"code":"unknown_record","message":"unknown record <id>"}`, and
  the drawer shows "unknown record <id>" in red under the action (shakeout/refused-deleted.png). The grid still
  lists the deleted tourstop until a reload. The drawer passes the engine's English message through
  (`errorText(error.code, error.message)`). `unknown_record` has no Dutch in the grid's `ENGINE_CODES`, and the theatre
  site words have no `error.unknown_record`. "Sjabloon toepassen" has the same path. This needs a defect row and a
  fix pass if Stefan wants every refusal under an action in Dutch.
- A value out of range only disables the run button: nothing says why, and the field shows no bounds (−365..365).
  The browser's own `min`/`max` on the number input give no message while typing.
