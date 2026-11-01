-- The complement of sites_aandacht, so its rules live in one place and a stale check is never in orde.
SELECT s.id, s.naam, s.gezondheid, s.laatste_check, s.organisatie_id
FROM site s
WHERE s.deleted_at IS NULL AND s.id NOT IN (SELECT id FROM sites_aandacht)
