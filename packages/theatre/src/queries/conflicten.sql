WITH eigen AS (
  SELECT
    COALESCE(CAST(json_extract(o.parameters, '$.waarschuwingshorizon_dagen') AS INTEGER), 14) AS horizon,
    COALESCE(CAST(json_extract(o.parameters, '$.bevestigingstermijn_dagen') AS INTEGER), 7) AS termijn
  FROM (SELECT 1) LEFT JOIN (
    SELECT parameters FROM organisatie WHERE soort = 'eigen' AND deleted_at IS NULL ORDER BY id LIMIT 1
  ) o
),
act AS (
  SELECT a.id, a.productie_id, a.speelreeks_id, a.soort, a.plandag,
    COALESCE(a.omschrijving, a.soort) AS wat,
    COALESCE(a.locatie_id, sr.locatie_id) AS locatie_id,
    a.start_at IS NOT NULL AS getimed,
    a.soort IN ('maaltijd', 'overnachting', 'reis') AS logistiek,
    datetime(COALESCE(a.start_at, a.datum || 'T00:00')) AS van,
    datetime(CASE WHEN a.start_at IS NULL THEN a.datum || 'T23:59:59' ELSE COALESCE(a.eind_at, a.start_at) END) AS tot
  FROM activiteit a
  LEFT JOIN speelreeks sr ON sr.id = a.speelreeks_id AND sr.deleted_at IS NULL
  WHERE a.deleted_at IS NULL AND a.status != 'geannuleerd'
),
tw AS (
  SELECT t.id, t.persoon_id, t.state, t.created_at, p.weergavenaam AS naam, act.id AS activiteit_id,
    act.productie_id, act.plandag, act.wat, act.locatie_id, act.getimed, act.logistiek, act.van, act.tot
  FROM toewijzing t
  JOIN act ON act.id = t.activiteit_id
  JOIN persoon p ON p.id = t.persoon_id AND p.deleted_at IS NULL
  WHERE t.deleted_at IS NULL AND t.persoon_id IS NOT NULL AND t.state IN ('voorlopig', 'uitgenodigd', 'bevestigd')
),
alle AS (
  SELECT 1 AS code, x.id AS x, y.id AS y, 'overlap' AS type,
    CASE WHEN x.getimed AND y.getimed THEN 'conflict' ELSE 'waarschuwing' END AS ernst,
    x.persoon_id, x.id AS toewijzing_id, y.id AS ander_toewijzing_id, x.activiteit_id, y.activiteit_id AS ander_activiteit_id,
    x.locatie_id, x.productie_id, x.plandag,
    x.naam || ' staat dubbel ingepland: ' || x.wat || ' en ' || y.wat || '.' AS omschrijving
  FROM tw x
  JOIN tw y ON y.persoon_id = x.persoon_id AND y.plandag = x.plandag AND y.id > x.id
  WHERE NOT x.logistiek AND NOT y.logistiek
    AND (NOT (x.getimed AND y.getimed) OR (x.van < y.tot AND y.van < x.tot))

  UNION ALL
  SELECT CASE b.soort WHEN 'afwezig' THEN 2 ELSE 3 END, x.id, b.id, b.soort,
    CASE b.soort WHEN 'afwezig' THEN 'conflict' ELSE 'waarschuwing' END,
    x.persoon_id, x.id, NULL, x.activiteit_id, NULL, x.locatie_id, x.productie_id, x.plandag,
    x.naam || CASE b.soort WHEN 'afwezig' THEN ' is afwezig tijdens ' ELSE ' is misschien niet beschikbaar tijdens ' END
      || x.wat || COALESCE(' (' || b.reden || ')', '') || '.'
  FROM tw x
  JOIN beschikbaarheid b ON b.persoon_id = x.persoon_id AND b.deleted_at IS NULL AND b.soort IN ('afwezig', 'onzeker')
    AND datetime(b.start_at) < x.tot AND x.van < datetime(b.eind_at)

  UNION ALL
  SELECT 4, t.id, 0, 'open_slot', 'conflict', NULL, t.id, NULL, act.id, NULL, act.locatie_id, act.productie_id, act.plandag,
    'Open plaats' || COALESCE(' voor ' || r.naam, '') || ' bij ' || act.wat || '.'
  FROM toewijzing t
  JOIN act ON act.id = t.activiteit_id
  LEFT JOIN rol r ON r.id = t.rol_id AND r.deleted_at IS NULL
  CROSS JOIN eigen
  WHERE t.deleted_at IS NULL AND t.state = 'open'
    AND act.plandag BETWEEN date('now', 'localtime') AND date('now', 'localtime', '+' || eigen.horizon || ' days')

  UNION ALL
  SELECT 5, x.id, 0, 'onbevestigd', 'conflict', x.persoon_id, x.id, NULL, x.activiteit_id, NULL, x.locatie_id,
    x.productie_id, x.plandag, x.naam || ' heeft nog niet geantwoord op ' || x.wat || '.'
  FROM tw x
  CROSS JOIN eigen
  WHERE x.state = 'uitgenodigd'
    AND date(COALESCE(
      (SELECT MAX(r.at) FROM revision r
        WHERE r.entity = 'toewijzing' AND r.record_id = x.id AND r.field = 'state' AND r.new = '"uitgenodigd"'),
      x.created_at), 'localtime') <= date('now', 'localtime', '-' || eigen.termijn || ' days')

  UNION ALL
  SELECT 6, x.id, y.id, 'locatie_dubbel',
    CASE WHEN x.getimed AND y.getimed THEN 'conflict' ELSE 'waarschuwing' END,
    NULL, NULL, NULL, x.id, y.id, x.locatie_id, x.productie_id, x.plandag,
    COALESCE(o.naam, 'Een locatie') || ' is dubbel geboekt: ' || x.wat || ' en ' || y.wat || '.'
  FROM act x
  JOIN act y ON y.locatie_id = x.locatie_id AND y.id > x.id
  LEFT JOIN organisatie o ON o.id = x.locatie_id
  WHERE NOT x.logistiek AND NOT y.logistiek
    AND (x.productie_id != y.productie_id
      OR (x.speelreeks_id IS NOT NULL AND y.speelreeks_id IS NOT NULL AND x.speelreeks_id != y.speelreeks_id))
    AND CASE WHEN x.getimed AND y.getimed THEN x.van < y.tot AND y.van < x.tot ELSE x.plandag = y.plandag END
)
SELECT code * 1000000000000 + x * 1000000 + y AS id, type, ernst, persoon_id, toewijzing_id, ander_toewijzing_id,
  activiteit_id, ander_activiteit_id, locatie_id, productie_id, plandag, omschrijving
FROM alle
