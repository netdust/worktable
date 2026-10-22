-- A site needs attention when it left the registry, is not healthy, or its last check is missing or older than 8 days.
WITH redenen AS (
  SELECT s.id, s.naam, s.gezondheid, s.laatste_check, s.organisatie_id,
    CASE
      WHEN NOT s.in_registry THEN 'weg'
      WHEN s.gezondheid = 'storing' THEN 'storing'
      WHEN s.gezondheid = 'let_op' THEN 'let_op'
      WHEN s.laatste_check IS NULL OR s.gezondheid = 'onbekend' THEN 'nooit'
      WHEN s.laatste_check < strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime', '-8 days') THEN 'oud'
    END AS reden
  FROM site s
  WHERE s.deleted_at IS NULL
)
SELECT id, naam, gezondheid, reden, laatste_check, organisatie_id FROM redenen WHERE reden IS NOT NULL
