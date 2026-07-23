# Research: Vlaams Instituut Gezond Leven × StrideLMS

Collected 2026-07-23. Every claim carries its source; items marked
[OWNER INPUT] need Stefan's knowledge and are excluded from the
dossier's factual claims until provided.

## The organization

- Vlaams Instituut Gezond Leven vzw (until 2017: VIGeZ) is the
  Flemish expertise center for health promotion and disease
  prevention; recognized/funded by the Flemish government since 1991;
  known for the voedingsdriehoek and bewegingsdriehoek.
  Source: https://nl.wikipedia.org/wiki/Vlaams_Instituut_Gezond_Leven
- Partner organization of the Flemish government (Departement Zorg /
  Zorg en Gezondheid).
  Source: https://www.zorg-en-gezondheid.be/vlaams-instituut-gezond-leven
- Mission includes strategies, advice and TRAINING for professionals:
  preventiewerkers, zorgverleners (huisartsen, verpleegkundigen,
  diëtisten, …), lokale besturen, bedrijven, scholen, kinderopvang.
  Source: https://www.gezondleven.be/over-gezond-leven/wat-doet-gezond-leven

## Their training operation (the surface StrideLMS addresses)

- Dedicated professional training arm: "Gezond Leven Academie" —
  e-learnings, webinars (live + recorded), blended and on-site
  formats; custom trainings on request (academie@gezondleven.be).
  Source: https://www.gezondleven.be/academie
  Source: https://www.gezondleven.be/opleidingen/op-aanvraag
- Runs its own digital learning platform on a separate domain:
  https://www.gezondlevenacademie.be/ with a substantial catalog
  (multiple categories; courses like "Groeien als gezondheidsvaardige
  organisatie", "Kleurrijk Gezond", e-learning "Rookvrije Start").
  Source: https://www.gezondlevenacademie.be/course/index.php
  Source: https://www.gezondleven.be/opleidingen/elearning/e-learning-rookvrije-start

## KEY FINDING — current platform is Totara (enterprise Moodle fork)

- Catalog URLs on gezondlevenacademie.be use the path
  `/totara/catalog/explore.php` (and Moodle-style
  `/course/index.php`, `/course/view.php?id=…`) — this is the URL
  signature of Totara Learn, the commercial per-seat-licensed
  enterprise fork of Moodle.
  Source: https://www.gezondlevenacademie.be/totara/catalog/explore.php
  Source: https://www.gezondlevenacademie.be/course/index.php?categoryid=4
- Totara's licensing model (the product's, not necessarily this
  customer's contract): annual subscription priced in tiers of
  active users (bands from 500 up), i.e. costs scale with audience
  size.
  Source: https://www.totara.com/us/license/
  Source: https://elearningindustry.com/directory/elearning-software/totara-learn/pricing
- Gezond Leven's ACTUAL contract terms are unknown (analysis caveat):
  the cost-scaling implication applies to Totara's published model;
  their negotiated deal could differ.
- Catalog includes a "Basisopleiding gezondheidsbevordering" for
  beginning health-promotion professionals, alongside the e-learnings
  and programs listed above.
  Source: https://www.gezondlevenacademie.be/course/index.php?categoryid=4

## StrideLMS (public footprint)

- stridelms.be positions it as "Leerplatform voor Belgische
  opleidingsorganisaties" — fixed rate, unlimited users, Belgian
  hosting; developed from years of practical experience with the
  digital training platform of VAD, which trains 1,000+ professionals
  annually across Flanders. (Site blocks automated fetch; wording per
  search-index snippet of the homepage.)
  Source: https://stridelms.be/
- VAD (Vlaams expertisecentrum Alcohol en andere Drugs) runs its
  training operation — classroom, e-learning, recorded webinars —
  through its own platform, VAD-academie (vormingen.vad.be).
  Source: https://vad.be/vormingen/
  Source: https://vormingen.vad.be/
- Sector adjacency: VAD and Gezond Leven are peer expertise/partner
  organizations in the same Flemish prevention landscape, serving the
  same professional audiences (preventiewerkers, zorg, onderwijs,
  lokale besturen). Sources: the two organization pages above.
- [OWNER INPUT] StrideLMS feature set, pricing tiers, migration
  tooling (SCORM/H5P import from Totara/Moodle), reference-ability
  of VAD, roadmap.

## Fit signals (to argue in the dossier)

1. They already invest seriously in digital learning — dedicated
   subdomain, mixed formats, custom offerings. Budget and habit exist.
2. They pay enterprise per-seat licensing (Totara) while their
   mission optimizes for maximum reach — StrideLMS's fixed-rate /
   unlimited-users model inverts that cost curve.
3. StrideLMS was born in their own sector at their peer organization —
   VAD as origin story is sector-credibility gold and likely shares
   professional networks and even audiences.
4. Belgian hosting aligns with a government-partner organization's
   data posture (GDPR, gov procurement comfort).

## Risks / unknowns (to state honestly in the dossier)

- Switching costs: an established Totara install, existing content
  (SCORM/H5P), user history; possible multi-year contract or a
  Totara partner relationship.
- Procurement: as a Flemish-government partner organization, platform
  spend may fall under public procurement rules — sales cycle shape
  unknown.
- Who owns the platform decision (IT vs Academie team) — unknown;
  academie@gezondleven.be is the published contact.
- [OWNER INPUT] Any existing relationship between netdust/VAD/Gezond
  Leven that changes the approach.
