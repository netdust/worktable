SELECT 1000000000000 + a.id AS id, a.titel, a.datum, a.start_at, a.eind_at, a.soort, a.organisatie_id,
  a.id AS agendapunt_id, NULL AS actie_id, NULL AS taak_id
FROM agendapunt a
WHERE a.deleted_at IS NULL

UNION ALL
SELECT 2000000000000 + x.id, x.titel, substr(x.gepland_op, 1, 10), x.gepland_op, NULL, 'onderhoud', NULL, NULL, x.id, NULL
FROM actie x
WHERE x.deleted_at IS NULL AND x.gepland_op IS NOT NULL AND x.status != 'geannuleerd'

UNION ALL
SELECT 3000000000000 + t.id, t.titel, t.deadline, NULL, NULL, 'taak', t.organisatie_id, NULL, NULL, t.id
FROM taak t
WHERE t.deleted_at IS NULL AND t.status = 'open' AND t.deadline IS NOT NULL
