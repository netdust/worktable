SELECT 1000000000000 + t.id AS id, 'taak' AS soort, t.titel,
  COALESCE(s.naam, w.naam, p.naam, a.titel) AS onderwerp, t.deadline, t.id AS taak_id, t.actie_id, t.status,
  t.organisatie_id
FROM taak t
LEFT JOIN site s ON s.id = t.site_id AND s.deleted_at IS NULL
LEFT JOIN werkpakket w ON w.id = t.werkpakket_id AND w.deleted_at IS NULL
LEFT JOIN project p ON p.id = t.project_id AND p.deleted_at IS NULL
LEFT JOIN actie a ON a.id = t.actie_id AND a.deleted_at IS NULL
WHERE t.deleted_at IS NULL AND t.status = 'open'

UNION ALL
-- A preview expires a day after it was made, so that day is its deadline. Acties carry no organisatie (plan ruling).
SELECT 2000000000000 + a.id, 'bevestigen', a.titel, g.naam, date(a.voorbereid_op, '+1 day'), NULL, a.id, NULL, NULL
FROM actie a
LEFT JOIN groep g ON g.id = a.groep_id
WHERE a.deleted_at IS NULL AND a.status = 'voorbereid'

UNION ALL
SELECT 3000000000000 + a.id, 'mislukt', a.titel, g.naam, NULL, NULL, a.id, NULL, NULL
FROM actie a
LEFT JOIN groep g ON g.id = a.groep_id
WHERE a.deleted_at IS NULL AND a.status IN ('mislukt', 'deels')
