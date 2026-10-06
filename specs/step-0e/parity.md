# Parity

## Checks

- counts: pass, 6 compared, 0 mismatched keys
- activities_per_week: pass, 40 compared, 0 mismatched keys
- assignments_per_person: pass, 28 compared, 0 mismatched keys
- absences_per_person: pass, 4 compared, 0 mismatched keys

## Counts per dataset

- organisatie: 22
- productie: 4
- activiteit: 246
- persoon: 15
- toewijzing: 508
- beschikbaarheid: 12

## Views

- Planning: pass, 227 rows, expected 227 (activiteit where status = bevestigd)
- Toewijzingen: pass, 508 rows, expected 508 (toewijzing, no filter)
- Afwezigheden: pass, 12 rows, expected 12 (beschikbaarheid, no filter)

## Informational

- plandag shifted: 0 (the day line moves these to the previous day; never a failure)
