SELECT 1000000000000 + t.id AS id, 'taak' AS soort, t.titel, NULL AS onderwerp, t.deadline, t.id AS taak_id,
  NULL AS actie_id, t.status, t.organisatie_id
FROM taak t
WHERE t.deleted_at IS NULL AND t.status = 'open'
