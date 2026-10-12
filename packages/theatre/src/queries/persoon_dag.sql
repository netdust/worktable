WITH act AS (
  SELECT a.id, a.productie_id, a.omschrijving, a.soort, a.plandag, a.datum, a.start_at, a.eind_at,
    COALESCE(a.locatie_id, sr.locatie_id) AS locatie_id,
    datetime(COALESCE(a.start_at, a.datum || 'T00:00')) AS van,
    datetime(CASE WHEN a.start_at IS NULL THEN a.datum || 'T23:59:59' ELSE COALESCE(a.eind_at, a.start_at) END) AS tot
  FROM activiteit a
  LEFT JOIN speelreeks sr ON sr.id = a.speelreeks_id AND sr.deleted_at IS NULL
  WHERE a.deleted_at IS NULL AND a.status != 'geannuleerd'
)
SELECT t.id, t.id AS toewijzing_id, t.persoon_id, act.id AS activiteit_id, act.productie_id, t.rol_id,
  act.omschrijving, act.soort, act.plandag, act.datum, act.start_at, act.eind_at, act.locatie_id, t.state,
  (SELECT b.soort FROM beschikbaarheid b
    WHERE b.persoon_id = t.persoon_id AND b.deleted_at IS NULL
      AND ((datetime(b.start_at) < act.tot AND act.van < datetime(b.eind_at)) OR datetime(b.start_at) = act.van)
    ORDER BY CASE b.soort WHEN 'afwezig' THEN 1 WHEN 'onzeker' THEN 2 WHEN 'voorkeur' THEN 3 ELSE 4 END, b.id
    LIMIT 1) AS beschikbaarheid,
  (SELECT COUNT(*) FROM conflicten c WHERE c.toewijzing_id = t.id OR c.ander_toewijzing_id = t.id) AS conflicten
FROM toewijzing t
JOIN act ON act.id = t.activiteit_id
WHERE t.deleted_at IS NULL AND t.persoon_id IS NOT NULL
