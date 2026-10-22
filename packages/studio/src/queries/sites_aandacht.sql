SELECT s.id, s.naam, s.gezondheid, s.gezondheid AS reden, s.laatste_check, s.organisatie_id
FROM site s
WHERE s.deleted_at IS NULL AND s.gezondheid IN ('storing', 'let_op')
