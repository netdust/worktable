WITH eigen AS (
  SELECT
    COALESCE(CAST(json_extract(o.parameters, '$.waarschuwingshorizon_dagen') AS INTEGER), 14) AS horizon,
    COALESCE(CAST(json_extract(o.parameters, '$.bevestigingstermijn_dagen') AS INTEGER), 7) AS termijn
  FROM (SELECT 1) LEFT JOIN (
    SELECT parameters FROM organisatie WHERE soort = 'eigen' AND deleted_at IS NULL ORDER BY id LIMIT 1
  ) o
),
act AS (
  SELECT a.id, a.plandag, a.status, COALESCE(a.omschrijving, a.soort) AS wat
  FROM activiteit a
  WHERE a.deleted_at IS NULL AND a.status != 'geannuleerd'
)
SELECT 1000000000000 + t.id AS id, 'taak' AS soort, t.toegewezen_aan AS persoon_id, t.titel, t.deadline,
  t.id AS taak_id, t.status
FROM taak t
WHERE t.deleted_at IS NULL AND t.status = 'open'

UNION ALL
SELECT 2000000000000 + t.id, 'open_slot', NULL, 'Open plaats' || COALESCE(' voor ' || r.naam, '') || ': ' || act.wat,
  act.plandag, NULL, NULL
FROM toewijzing t
JOIN act ON act.id = t.activiteit_id
LEFT JOIN rol r ON r.id = t.rol_id AND r.deleted_at IS NULL
CROSS JOIN eigen
WHERE t.deleted_at IS NULL AND t.state = 'open'
  AND act.plandag BETWEEN date('now', 'localtime') AND date('now', 'localtime', '+' || eigen.horizon || ' days')

UNION ALL
SELECT 3000000000000 + t.id, 'onbeantwoord', t.persoon_id, 'Geen antwoord van ' || p.weergavenaam || ': ' || act.wat,
  act.plandag, NULL, NULL
FROM toewijzing t
JOIN act ON act.id = t.activiteit_id
JOIN persoon p ON p.id = t.persoon_id
CROSS JOIN eigen
WHERE t.deleted_at IS NULL AND t.state = 'uitgenodigd'
  AND date(COALESCE(
    (SELECT MAX(r.at) FROM revision r
      WHERE r.entity = 'toewijzing' AND r.record_id = t.id AND r.field = 'state' AND r.new = '"uitgenodigd"'),
    t.created_at), 'localtime') <= date('now', 'localtime', '-' || eigen.termijn || ' days')

UNION ALL
SELECT 4000000000000 + act.id, 'optie', NULL, 'Nog in optie: ' || act.wat, act.plandag, NULL, NULL
FROM act
WHERE act.status = 'optie'
  AND act.plandag BETWEEN date('now', 'localtime') AND date('now', 'localtime', '+14 days')
