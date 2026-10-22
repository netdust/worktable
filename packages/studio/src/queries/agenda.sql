SELECT 1000000000000 + a.id AS id, a.titel, a.datum, a.start_at, a.eind_at, a.soort, a.organisatie_id,
  a.id AS agendapunt_id, NULL AS actie_id, NULL AS taak_id
FROM agendapunt a
WHERE a.deleted_at IS NULL
