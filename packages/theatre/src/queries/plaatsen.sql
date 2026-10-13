SELECT t.id, t.activiteit_id, COALESCE(a.omschrijving, a.soort) AS wat, t.rol_id, t.persoon_id, t.state, a.datum,
  a.productie_id
FROM toewijzing t
JOIN activiteit a ON a.id = t.activiteit_id AND a.deleted_at IS NULL
WHERE t.deleted_at IS NULL
