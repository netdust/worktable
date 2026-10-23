-- Open tasks due by this week's Sunday; a task without a deadline stays in Taken only (spec S11).
SELECT t.id, t.titel, t.deadline, t.id AS taak_id, t.status, t.organisatie_id
FROM taak t
WHERE t.deleted_at IS NULL AND t.status = 'open' AND t.deadline IS NOT NULL
  AND t.deadline <= date('now', 'localtime', 'weekday 0')
