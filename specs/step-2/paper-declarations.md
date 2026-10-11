# Paper declarations against the built engine (step 2 after-gate)

Promised in `specs/step-2/spec.md:135` and `plan.md:544`. Read-only, 2026-10-10, against `docs/SPEC.md` and `packages/engine/src` at main `ebe0d57`. Names on paper are provisional; every example value is invented; no client data.

**Sources.**
- cargovelo-core: `~/Sites/cargo/app/public/content/mu-plugins/cargovelo-core` (~5.7k lines PHP plus a React app; 7 custom tables `wp_cv_*`, 4 capabilities, 3 roles, a 9-state lifecycle, 5 REST groups; no post types).
- "The studio draft" (**assumed**; its location is recorded nowhere): the netdust studio domain `~/Sites/netdust/web/app/mu-plugins/netdust-core/services/studio/` (seeded by `bin/studio-seed.php`, `bin/seed-studio.php`) and the archived studio-agenda draft (`git show 8a0b311^:specs/studio-agenda/spec.md`, EventService at `110be31^`). If another draft was meant, section B is redone.

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

## B. The studio draft (assumed)

**What it is.** A one-person studio's catalogue: profile, projects with screenshots, services, a mobile card, press kits shared through revocable per-recipient links; the agenda draft adds a curated public list of appearances with an `.ics` per event. No registration, no tickets.

**Declaration on paper.**
- `profiel` (one row, writer refuses a second), `contact` (links on profiel), `projecttype` (config), `project` (titel, samenvatting, klant, jaar, rol, soort, live_url, stack json, dates, status, zichtbaarheid, uitgelicht, volgorde, tekst; types through a join with `links`), `dienst`, `perskit`, `kitbestand` (file as Attachment), `toegang` (perskit or project, email, status active/revoked, gebruikt, laatst_gebruikt; owners id, record_link email), `afspraaktype` (config), `afspraak` (date datum, optional times and end, rol, locatie, stad, organisator_url, status).
- Lifecycle: `toegang` active→revoked, hook on active mails the link; `afspraak` concept→gepland→gepubliceerd optional.
- Writer: singleton profiel; a grant targets exactly one of kit or project; one live grant per email × target; at most 100 per target (needs a count); organisator_url http(s) only.
- Queries: `projecten_publiek` and `agenda_komend` / `agenda_voorbij` as share-token public views; `mijn_kit` read through the grant's record link.
- Skin: table and calendar on afspraak; sections Werk, Profiel, Delen, Agenda.

**Engine changes it would need.**
1. **S1 = C4** hook mail with the record link.
2. **S2 = C8** Attachment, with file reads for link accounts and public views (a kit is files; screenshots are public).
3. **S3 Recording a read (new).** Grant uses and downloads: `record_link` keeps `uses` and `last_used_at`, or drop the counters.
4. **S4 Non-relation action inputs (new).** A pasted list of emails; cargo's stop order is the same gap.
5. **S5 `ctx.count(dataset, match)` (new, small)**, or drop the cap of 100.
6. **S6 Per-record renderers, zip and bio-sheet PDF (new)** — better left to the website.
7. **S7 Visitor filters on a public view (new, optional)**, or one view per filter.

**What fits as-is.** Every model as a dataset; singleton by the writer; repeaters as child datasets with `links`; taxonomies as config datasets; the two-way grant target as two nullable relations; revocation as soft delete or link rotation (one identical 401); public listings as share-token views rendered by the WordPress shortcode; effective-end logic in SQL; calendar on datum; wall-clock datetimes; rate limits and no-store headers; no matrix, board or public create needed.

## Matrix findings
Neither domain needs the matrix or `open`.

## Engine change × domain

| # | Engine change | cargo | studio | Specified or new |
|---|---|---|---|---|
| C1 | Several owner columns per source; `record_link` names its column | yes | – | new |
| C2 | Public create, as an action, answering the record link | yes | – | specified, unbuilt (action form new) |
| C3 | Dry-run create (quote) | yes | – | new |
| C4/S1 | Hook mail receives the record link | yes | yes | new |
| C5 | Several mails per hook | yes | – | new, small |
| C6 | Link account writes a declared column | yes | – | new |
| C7 | Board skin | yes | – | specified, unbuilt |
| C8/S2 | Attachment | yes | yes | specified (step 4) |
| C8/S2 | Attachment reads scoped to owners, link accounts, public views | yes | yes | new |
| C9 | `$period: today` | yes | – | new, small |
| C10 | Administrator account routes | yes | – | new (cutover) |
| S3 | Record link use counter | – | yes | new, or drop |
| S4 | Non-relation action inputs | yes | yes | new |
| S5 | `ctx.count` | – | yes | new, small, or drop |
| S6 | Per-record renderers (zip, pdf) | – | yes | new, leave to the website |
| S7 | Visitor filters on public views | – | optional | new |

C1 and C4 change existing frozen shapes (`Owners`, `HookResult`); every other row adds beside them. None is built: each needs a finding and a spec line first (`docs/SPEC.md`, freeze list).
