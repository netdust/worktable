WITH act AS (
  SELECT a.id, a.productie_id, a.omschrijving, a.soort, a.plandag, a.datum, a.start_at, a.eind_at, a.status,
    COALESCE(a.locatie_id, sr.locatie_id) AS locatie_id
  FROM activiteit a
  LEFT JOIN speelreeks sr ON sr.id = a.speelreeks_id AND sr.deleted_at IS NULL
  WHERE a.deleted_at IS NULL AND a.status != 'geannuleerd'
)
SELECT act.id, act.id AS activiteit_id, act.locatie_id, act.productie_id, act.omschrijving, act.soort, act.plandag,
  act.datum, act.start_at, act.eind_at, act.status,
  (SELECT COUNT(*) FROM conflicten c
    WHERE c.type = 'locatie_dubbel' AND (c.activiteit_id = act.id OR c.ander_activiteit_id = act.id)) AS conflicten
FROM act
WHERE act.locatie_id IS NOT NULL
