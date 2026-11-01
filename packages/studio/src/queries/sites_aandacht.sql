-- A site needs attention when it left the registry, is not healthy, was never checked, or its last check is older than 8 days.
-- ernst orders the list, so a tile's first rows always hold the broken sites, never a retired one.
WITH redenen AS (
  SELECT s.id, s.naam, s.gezondheid, s.laatste_check, s.organisatie_id,
    CASE
      WHEN NOT s.in_registry THEN 'weg'
      WHEN s.gezondheid = 'storing' THEN 'storing'
      WHEN s.gezondheid = 'let_op' THEN 'let_op'
      WHEN s.laatste_check IS NULL THEN 'nooit'
      WHEN s.laatste_check < strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime', '-8 days') THEN 'oud'
      WHEN s.gezondheid = 'onbekend' THEN 'onbekend'
    END AS reden
  FROM site s
  WHERE s.deleted_at IS NULL
)
SELECT id, naam, gezondheid, reden,
  CASE reden WHEN 'storing' THEN 1 WHEN 'let_op' THEN 2 WHEN 'nooit' THEN 3 WHEN 'onbekend' THEN 3 WHEN 'oud' THEN 4 ELSE 5 END
    AS ernst,
  laatste_check, organisatie_id
FROM redenen
WHERE reden IS NOT NULL
