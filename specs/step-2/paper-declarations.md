# Paper declarations against the built engine (step 2 after-gate)

Promised in `specs/step-2/spec.md:135` and `plan.md:544`. Read-only, 2026-10-10, against `docs/SPEC.md` and `packages/engine/src` at main `ebe0d57`. Names on paper are provisional; every example value is invented; no client data.

**Sources.**
- cargovelo-core: `~/Sites/cargo/app/public/content/mu-plugins/cargovelo-core` (~5.7k lines PHP plus a React app; 7 custom tables `wp_cv_*`, 4 capabilities, 3 roles, a 9-state lifecycle, 5 REST groups; no post types).
- The agency draft: Stefan's paste of 2026-10-11 (reference datasets Klant, Contact, Medewerker; core datasets Project, Retainer, Deliverable, Taak, Inzet, Afwezigheid; six queries; four gaps seen on paper). Section B was first written against an assumed portfolio and press-kit studio; Stefan named the agency draft instead, and B is redone against it.

## A. cargovelo-core

**What it is.** A bike-courier shipment system: bookings from a web form, a customer portal, CSV, phone or API; one status lifecycle; a dispatch desk per hub; a courier app with proof of delivery; recipient track and trace; a priced export for accounting.

**Declaration on paper.**
- Config datasets: `hub` (code, naam, stad, cutoff_sameday; the space), `zone` (one row per postcode → hub), `dienst` (express, sameday, nextday, scheduled), `instelling` (one row).
- `prijslijst` (one `standaard`, by `exists`), `prijsregel` (prijslijst, dienst, basis_cent, extra_pakket_cent, toeslagen json; unique per list × dienst).
- `klant` (owners: id), `adres` (owners: klant_id), `koerier` (owners: id).
- `zending`: referentie (writer-set, unique), klant_id, klantnaam snapshot, contact_email, dienst_id, hub_id (from pickup postcode), status (9 options), uitzondering, flattened pickup and delivery addresses, four window datetimes, pakketten json, prijs_cent snapshot + prijs_reden, koerier_id, stop_volgorde, kanaal, opmerkingen, POD columns. `title: referentie`, `date: ophaal_start`, `scoped: hub_id`, `owners: klant_id` (+ two more, see C1), `record_link: { email: lever_email }`.
- `klant_notitie` (owners: klant_id), `interne_notitie` (no owners: customers get 404).
- Lifecycle on `zending.status`: draft→requested (staff, customer); requested→confirmed; confirmed→assigned (writer, when koerier set); assigned→picked_up and picked_up/in_transit→in_transit/delivered/failed (staff, courier); assigned→confirmed (writer clears courier); failed→confirmed; requested/confirmed→cancelled (staff, customer); draft/assigned/failed→cancelled (staff). Hooks mail on requested/confirmed (create), confirmed-from-requested, picked_up, delivered, failed, cancelled.
- Writer: postcodes in a zone; service windows (SLA, sameday cut-off, nextday skips weekends, scheduled not in the past); price frozen on create from klant→prijslijst→prijsregel, recomputed on edit unless a reason is set; closed shipments not editable; status on create forced; failed needs uitzondering; assigning needs an active courier; couriers write only courier states and POD; customers only cancel and their own creates; master data administrator-only.
- Action `toewijzen` (input koerier). Queries: `mijn_ritten` (courier, owner koerier_id, writes status and POD), `tracking` (owners id, through the record link), `tracking_tijdlijn` (status revisions), `hub_dag` (counts per hub × day × status), `geleverd_export`.
- Skin: space hub; sections Zendingen, Klanten, Koeriers, Tarieven, Instellingen; board on status per hub; tones; group facts.

**Engine changes it would need.**
1. **C1 Several owner columns per source (new).** A shipment belongs to a customer, a courier and (tracking) itself. `Owners` holds one column; writes through a query use the dataset's scope, so a courier writing through `mijn_ritten` gets 404; a tracking link acting as the owner column's subject would read every shipment of that customer. Smallest: `owners` holds several columns, `scopeOf` picks the one pointing at `actor.subject.dataset` (`pointsAt` already checks this), and `record_link` names its column.
2. **C2 Public create (specified, unbuilt).** The booking form also finds or creates an occasional customer, so it must run as an action with `children`, answering the shipment's record link.
3. **C3 Dry-run create (new).** A quote before booking: run the writer and checks in a rolled-back transaction and answer the values; rate-limited.
4. **C4 Hook mail with the record link (new).** Every cargo mail carries the tracking link; `HookResult.mail(link)` only receives an action-token link. Smallest: `HookResult.record_link?: true`.
5. **C5 Several mails per hook (new, small).** `mail` returns `Mail[]`.
6. **C6 A link account writes a declared column (new).** The recipient edits delivery instructions while open. A `link_writable` flag on owner-visible columns, judged by the writer.
7. **C7 Board skin (specified, unbuilt).**
8. **C8 Attachment (specified, step 4) with reads scoped to owners and link accounts (new).** POD photo and signature.
9. **C9 `$period: 'today'` (new, small).**
10. **C10 Administrator account routes (new, cutover).** Onboarding customers and couriers from the admin; the engine has CLI accounts only.

Optional: lifecycle roles keyed by subject dataset; HTML mail.

**What fits as-is.** Every table as a dataset; snapshot pricing through `find`/`findBy`; unique references by `exists`; the full transition table with `expect` (the PHP's `UPDATE … WHERE status = :from` is `transition_lost`); writer side effects re-checked by `valuesOf`; hooks with `ctx.current`; Revision replaces the events table (undo free); notes split in two datasets; hub as space; owner accounts for customers and couriers; queries over revision; views for owners; xlsx export; CSV import as POST per line. Process cost: English column names would collide with the engine's vocabulary check; Dutch names avoid it.

## B. The agency draft

**What it is.** A creative agency's planning: clients and their contacts, staff with weekly capacity and cost price, projects (campaign, one-off, retainer) with hour and money budgets, deliverables the client approves from a link, tasks on a board, one row per person × project × day for both plan and timesheet, absence, and a monthly billable export for the invoicing tool.

**Declaration on paper.**
- `klant` (naam, btw, adres, sector, facturatie_ref): reference. The engine stores `facturatie_ref`; only the export reads it.
- `contact` (klant_id → klant, voornaam, achternaam, email, functie). The draft's `token` column is not declared: the engine mints the review link itself (action token), as step 2 removed Persoon's token. Title: a derived, read-only display name, as Persoon's `weergavenaam`.
- `medewerker` (voornaam, achternaam, email, rol options strategie · design · copy · dev · pm, capaciteit_uren_week, kostprijs_uur). Title: a derived display name. The draft's `user_id` is not declared: staff sign in as engine accounts (editors), linked by the account table, not by a column.
- `project` (klant_id, naam, soort options campagne · eenmalig · retainer, status, start, deadline, budget_uren, budget_bedrag, pm_id → medewerker). Lifecycle on status: offerte → lopend → opgeleverd (editor, administrator); opgeleverd → gefactureerd (administrator only); gefactureerd → gesloten.
- `retainer` (klant_id, project_id, uren_per_maand, start, eind, overdracht boolean).
- `deliverable` (project_id, naam, deadline, status, contact_id → contact). `owners: { owner: 'contact_id' }`. Lifecycle on status: in_werk → intern_review → klant_review (editor, administrator); klant_review → goedgekeurd or aanpassen (editor, administrator, **owner**); aanpassen → in_werk. Hook on `klant_review`: `token: { to: ['goedgekeurd', 'aanpassen'], days: 14 }` and a mail to the contact's email (read with `ctx.find`) carrying the token's link. `token_projection`: naam, deadline, the project's title.
- `taak` (project_id, deliverable_id nullable, titel, toegewezen_aan → medewerker, deadline, status todo · bezig · review · klaar, schatting_uren). Lookup `klant` via project_id → project.klant_id (one hop, served with the client's title).
- `inzet` (medewerker_id, project_id, taak_id nullable, datum, uren_gepland, uren_werkelijk, factureerbaar boolean, registratie_status geen · ingediend · goedgekeurd). Writer: one row per person × task × day (see gap A1 for the row without a task); `uren_*` not negative; `goedgekeurd` administrator-only.
- `afwezigheid` (medewerker_id, start, eind, soort verlof · ziek · opleiding).
- Queries (SQL views):
  - `bezetting`: medewerker × week; planned hours against `capaciteit_uren_week` minus absence days; a flag when over.
  - `project_budget`: one row per project; planned, spent, remaining hours and money against budget; burn rate per week.
  - `retainer_saldo`: retainer × maand; hours used against `uren_per_maand`, with carry-over to the next month when `overdracht` (a recursive CTE over the months).
  - `werklijst`: medewerker × to-do; overdue tasks, deliverables in `klant_review` past a horizon, days with `uren_gepland` and no `uren_werkelijk`.
  - `factureerbaar_periode`: klant × maand; approved (`goedgekeurd`), billable hours and amounts.
  - `deadlines`: one row per deliverable and per project deadline; `date: deadline`.
- Skin: board on `taak.status`; calendar on `deadlines`; tables for the rest; sections Werk (project, deliverable, taak), Planning (inzet, afwezigheid, bezetting), Klanten (klant, contact, retainer), Rapportage (project_budget, retainer_saldo, factureerbaar_periode).
- Actors: staff as editors; administrators for billing and rates; contacts through the review link only; the invoicing tool and the monthly job as service accounts.

**The three checks.**
1. **The client's last move on a deliverable runs on the lifecycle plus the action token. Holds, with one gap.** The hook on entering `klant_review` mints a token bound to the deliverable and its `from` (`action-token.ts`, `mintActionToken`), owned by the record's owner subject, the contact (`ownerSubject`, from `owners: contact_id`); the contact needs no account (a link account is made on first use, `linkAccount`). `POST /act` makes the one transition as that link account, in one transaction with `expect: klant_review`, refusing a reused, expired or other-record token with one identical 401; a new round (aanpassen → in_werk → klant_review) mints a fresh token and revokes the old. **Where it does not hold:** `aanpassen` without a reason is little use, and `POST /act` writes exactly `{ status: to }` and nothing else (`action-token.ts`, the act route's `applyWrite(..., { [column]: to }, ...)`); the client cannot say *what* to change, and cannot see or add the deliverable's files. That is change C6 (a declared column the link may write, e.g. `feedback`) and C8 (Attachment read and write through the link).
2. **The monthly retainer rollover runs from cron through a service account, with no clock in the engine. Holds.** The carry-over needs no write at all: `retainer_saldo` computes it in SQL from the hours, month by month. Only the generated maintenance tasks are writes: a cron job outside the engine authenticates by Bearer token (service account, editor role, 600 requests a minute, `rate-limit.ts` `serviceLimit`) and creates them with `POST /rows/taak`, or through a domain action in one batch. **Where it is weak:** an action can only take relations as input (`actions.ts` `idsOf`: every input must be a record id), so the month cannot be passed in; the action would have to read the date itself (a clock in domain code) or the job falls back to one POST per task, without one batch and one undo. Change S4 (non-relation action inputs: `maand`, like "shift a tour by N days") closes it. A second run in the same month must be refused by the writer (`exists` on retainer × maand on a generated-task marker).
3. **`factureerbaar_periode` pulled over REST by the invoicing tool, not pushed from a hook. Holds.** A service account reads `GET /rows/factureerbaar_periode?filter={"maand":"2026-10"}` (paged at 5000, with an exact `total`), described by `/schema?format=openapi`. Pull is the right shape: hooks run inside the write and their mails go out only after commit (`writes.ts` `enterState`, `sendAfterCommit`), and the engine makes no outbound call. Marking a month invoiced is a write back by the same account (an administrator-role service account may move a project to `gefactureerd`; a service account cannot publish or manage accounts).

**The four gaps already seen on paper.**
- *The board skin isn't built:* still true; specified in `docs/SPEC.md` (Skins), built when a domain first needs it. Not in the accepted group below.
- *Retainers need a rollover and no clock:* holds through cron and a service account (check 2); S4 makes it one batch.
- *factureerbaar_periode wants to post:* pull instead (check 3); no engine change.
- *bezetting is person × week and the matrix wants join rows:* true. A matrix needs a `down` and an `across` relation to datasets with join rows between them (`MatrixDecl`); a week is not a dataset. `bezetting` renders as a table grouped on medewerker (or a calendar once that skin exists); no engine change.

**Engine changes it would need.**
1. **C6 = a link account writes a declared column** (the client's feedback on `aanpassen`), and **C8 = Attachment read and write through the link** (the deliverable's files).
2. **S4 Non-relation action inputs** (the rollover's month).
3. **C5 Several mails per hook** (the review mail to the contact, a copy to the project's PM).
4. **A1 `exists`/`findBy` matching a null** (new, small, not in the accepted group). "One row per person, task and day" cannot be checked for a row without a task: `matchOf` refuses null (`writes.ts`, "may not be matched against null"). Smallest: a null in a match means `IS NULL`. Raised for Stefan's decision.
5. The calendar skin for `deadlines`: step 3 work, already agreed.

**What fits as-is.** Every dataset; capacity and absence as data the queries read; budgets, burn rate, carry-over, overbooking and the work list as SQL views; the project lifecycle with the administrator-only `gefactureerd`; the deliverable lifecycle and the client's move through the action token (check 1); one row for plan and timesheet; the lookup of a task's client through its project; staff as editors; the invoicing tool and the monthly job as service accounts; pull over REST with OpenAPI; tables, group facts and saved views for everything the calendar and board do not cover.

## Matrix findings
Neither domain needs the matrix or `open`. The agency's `bezetting` is person × week, which is not a join between two datasets; it renders as a grouped table.

## Engine change × domain

| # | Engine change | cargo | agency | Decision (Stefan, 2026-10-11) |
|---|---|---|---|---|
| C1 | Several owner columns per source; `record_link` names its column | yes | – | closed as website work (Stefan, 2026-10-12) |
| C2 | Public create, as an action, answering the record link | yes | – | not in the finding: already specified, built when a domain needs it |
| C3 | Dry-run create (quote) | yes | – | closed as website work (Stefan, 2026-10-12) |
| C4 | Hook mail receives the record link | yes | – | accepted (with C5) |
| C5 | Several mails per hook | yes | yes | accepted (with C4) |
| C6 | Link account writes a declared column | yes | yes | accepted (with C8) |
| C7 | Board skin | yes | yes | not in the finding: already specified, built when a domain needs it |
| C8 | Attachment, read and written by owners and link accounts | yes | yes | accepted (with C6) |
| C9 | `$period: today` | yes | – | accepted |
| C10 | Administrator account routes | yes | – | closed as website work (Stefan, 2026-10-12) |
| S4 | Non-relation action inputs | yes | yes | accepted |
| S3, S5, S6, S7 | Record-link counter, `ctx.count`, renderers, visitor filters | – | – | dropped (came from the assumed studio) |
| A1 | `exists`/`findBy` matching null | – | yes | new; for Stefan's decision |

The accepted changes are worked out in `specs/engine-additions/findings.md`. None is built; each needs Stefan's approval of that finding and a spec line first.
