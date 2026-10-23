# Feature review: studio-domain

Reviewed: origin/feature/studio-domain at 16418554807f819ded4eb3d71f4932d3816df00b, base 19acd13 (origin/main, with studio-mcp, selection-actions and drawer-actions merged).
Plan: specs/studio-domain/plan.md (revision of 2026-10-22/23, Threat model, Test map, Review Focus). Spec: specs/studio/spec.md.
Level: full. Reviewers:
- the superpowers code reviewer (general-purpose, opus)
- security-sentinel (opus)

There is no ARCHITECTURE-INVARIANTS.md, so no invariant-auditor. The project is not WordPress.

Both reviewers ran `bun test packages/studio` (87 pass) in scratch copies, plus their own probes through the real REST paths. The probes are in the sentinel's scratch at `probe-copy/packages/studio/test/zz-probe.test.ts`. Neither changed any tree.

## Blocking

B1. A service can take a fresh preview out of voorbereid, rewrite it, and bring it back, so Stefan's Bevestigen confirms a set he never saw. Raised by security-sentinel, probes P1, P1w, P1b and P1c.
- Where: `src/datasets.ts:127` (voorbereid → aangevraagd for both roles, with no freshness check) and `src/writers/actie.ts:57-69` (undo writes skip checkFit). voorbereid is not a live state (`datasets.ts:120`), so the open drawer stops re-reading. Its button sends `expect: { status: 'voorbereid' }`.
- Attack (claude, Bearer):
  1. voorbereid → aangevraagd → voorbereiden
  2. rewrite a link's voorstel, or move a wacht link to te_bevestigen
  3. → voorbereid (a fresh voorbereid_op)
  4. Stefan's stale drawer presses Bevestigen → 200, on the rewritten voorstel.

  It works the same through claude's own undo of voorbereiden → voorbereid. It also works through cancel → rewrite samenvatting or resultaat in geannuleerd → its own undo back to voorbereid.
- This breaks the core property. The N1b deferral's premise ("services are refused by kind") holds only inside voorbereid.
- Fix, domain only, in actieWriter.update when the actor is not kind user:
  - leaving voorbereid is allowed only to geannuleerd, or to aangevraagd once voorbereid_op is more than 24 h old;
  - an undo write that leaves or enters voorbereid is refused.
- Tests: the three sequences, each ending with the voorstel unchanged or Bevestigen refused.
- The residual (a drawer left open across a real expiry) is narrowed by making voorbereid a live state, so the drawer re-reads. The full fix is the deferral's snapshot (an engine change).

B2. A service can rename a site row, so a confirmed link resolves to a different production site. Raised by security-sentinel, probe P2.
- Where: `src/writers/site.ts:39-47`. A service may write naam; checkUnique blocks only collisions. The worker resolves sites by naam.
- Attack (claude): after Bevestigen, `PATCH site/4 {naam: 'tmp-x'}`, then `PATCH site/2 {naam: 'voorbeeld-blog'}` → 200, 200. A row claude created itself can take a real registry name too.
- Fix: siteWriter refuses `values.naam !== current.naam` for every actor. The same value passes, because the sync's PATCH carries naam.
- Test: "a site's naam never changes after create, for a service too; the sync's PATCH with the same naam answers 200".

## Should fix

S1. A link that was never confirmed can enter bezig in a confirmed bijwerken. Raised by security-sentinel, probe P3.
- Where: `actie-site.ts:69-76`. A service's wacht → bezig → klaar in a bezig bijwerken answers 200, and the same in voorbereiden.
- Fix: on a bijwerken, a link enters bezig only from te_bevestigen.

S2. A create can carry state, voorstel and resultaat. Raised by security-sentinel, probe P4.
- Where: `actie-site.ts:96-100`. claude's POST of an actie_site with state te_bevestigen and a voorstel on an unclaimed actie → 201. A link created in bezig is accepted too.
- Fix: a create is wacht, or overgeslagen with a non-blank resultaat (the action's not-in-registry case), and never carries a voorstel.

S3. A worker or action skip reason can be cleared, so "Toch wel" restores a skipped site. Raised by security-sentinel, probe P5.
- Where: `actie-site.ts:15, :91` (resultaat frozen only in voorbereid) and `:56-59`. claude's `{resultaat: null, voorstel: …}` in voorbereiden, then Stefan's Toch wel → 200. The same works in geannuleerd plus undo.
- Fix: once an overgeslagen link has a resultaat, it keeps it.

S4. The "Sites met aandacht" tile can hide the broken site. Raised by the code reviewer.
- Where: `seed.ts:275` sorts by naam; the tile at `seed.ts:417` shows 5 rows. let_op sites and retired (weg) sites push a storing site out.
- Fix: an `ernst` integer in `sites_aandacht.sql` (storing 1, let_op 2, nooit 3, oud 4, weg 5), and the view sorted by `['ernst', 'naam']`.

## Note

From security-sentinel:
- N1: "Toch wel" after an expiry can bring back a voorstel older than 24 h (P5b). The only defence is the worker refreshing dropped links at re-preview. That worker test is mandatory.
- N2: nothing bounds the time between bevestigd and the worker's claim (P6), against S10's "never later while Stefan is away". Consider refusing bevestigd → bezig when voorbereid_op is more than 24 h old, plus a person-only bevestigd → geannuleerd.
- N3: Ruling D does not reach attachments. Any editor service can DELETE a screenshot (engine `attachments.ts:141-148`, role-only). Engine follow-up.
- N4: "Toch wel" shows on a link without a voorstel, and Bevestigen on an expired preview. Both fail closed; a UX note.
- N5: the drawer's detail line is samenvatting while the worker installs voorstel; the accepted deferral. Doc drift: the contract says samenvatting is "frozen from voorbereid on", but the code freezes it only in voorbereid and bevestigd. Site names that differ only by case or whitespace count as different sites (P10), with no SSH impact.

From the code reviewer:
- M1: samenvatting freezes less than the contract says: a service can rewrite it after klaar (`actie-site.ts:15, 91`; the test at `actie-site.test.ts:86-102` asserts the looser rule). Either freeze it, or record the ruling.
- M2 (`sites_aandacht.sql:8`): "Nooit gecheckt" also shows for gezondheid onbekend with a laatste_check. It should apply only when laatste_check is NULL.
- M3 (`queries/agenda.sql:7`, `queries.ts:101`): a request appears in the Agenda as "Onderhoud". It is an Opdracht.
- M4 (`writers/planning.ts:103`): a taak does not follow its site's, project's or feature's client when organisatie_id is absent, so a worker task naming only a site disappears under the client switcher.
- M5: plan and spec drift:
  - threat 6 omits sla;
  - Review Focus 6 names a removed high-risk test;
  - the + Nieuw ruling mentions risico;
  - spec.md:266 says "a board by risico".
- M6 (`e2e/auth.ts:39`): the harness's `claude@studio.e2e.test` is a person with the editor role, not a service. A "service-cannot-confirm" flow needs a real service token.

Findings: 2 Blocking · 4 Should fix · 11 Note
