WITH act AS (
  SELECT a.id, a.start_at IS NOT NULL AS getimed,
    a.soort IN ('maaltijd', 'overnachting', 'reis') AS logistiek,
    datetime(COALESCE(a.start_at, a.datum || 'T00:00')) AS van,
    datetime(CASE WHEN a.start_at IS NULL THEN a.datum || 'T23:59:59' ELSE COALESCE(a.eind_at, a.start_at) END) AS tot
  FROM activiteit a
  WHERE a.deleted_at IS NULL AND a.status != 'geannuleerd'
),
slot AS (
  SELECT t.id, t.activiteit_id, t.rol_id, NULL AS persoon_id, act.getimed, act.logistiek, act.van, act.tot
  FROM toewijzing t
  JOIN act ON act.id = t.activiteit_id
  WHERE t.deleted_at IS NULL AND t.state = 'open' AND t.persoon_id IS NULL AND t.rol_id IS NOT NULL
  UNION ALL
  -- An assigned place: who could take it instead of the one on it.
  SELECT t.id, t.activiteit_id, t.rol_id, t.persoon_id, act.getimed, act.logistiek, act.van, act.tot
  FROM toewijzing t
  JOIN act ON act.id = t.activiteit_id
  WHERE t.deleted_at IS NULL AND t.persoon_id IS NOT NULL AND t.rol_id IS NOT NULL AND t.state NOT IN ('geannuleerd', 'geweigerd')
)
SELECT s.id * 1000000 + p.id AS id, s.id AS toewijzing_id, p.id AS persoon_id, p.weergavenaam AS naam,
  s.activiteit_id, s.rol_id, pr.voorkeur, s.persoon_id AS vervangt,
  ROW_NUMBER() OVER (
    PARTITION BY s.id ORDER BY pr.voorkeur DESC, COALESCE(pr.dagtarief, r.dagtarief) ASC NULLS LAST, p.weergavenaam
  ) AS rang
FROM slot s
JOIN persoon_rol pr ON pr.rol_id = s.rol_id AND pr.deleted_at IS NULL
JOIN persoon p ON p.id = pr.persoon_id AND p.deleted_at IS NULL AND p.actief = 1 AND p.id IS NOT s.persoon_id
LEFT JOIN rol r ON r.id = s.rol_id
WHERE NOT EXISTS (
    SELECT 1 FROM beschikbaarheid b
    WHERE b.persoon_id = p.id AND b.deleted_at IS NULL AND b.soort = 'afwezig'
      AND ((datetime(b.start_at) < s.tot AND s.van < datetime(b.eind_at)) OR datetime(b.start_at) = s.van))
  AND NOT EXISTS (
    SELECT 1 FROM toewijzing o
    WHERE o.activiteit_id = s.activiteit_id AND o.persoon_id = p.id AND o.deleted_at IS NULL AND o.state != 'geannuleerd')
  AND NOT (s.getimed AND NOT s.logistiek AND EXISTS (
    SELECT 1 FROM toewijzing o
    JOIN act oa ON oa.id = o.activiteit_id
    WHERE o.persoon_id = p.id AND o.deleted_at IS NULL AND o.state IN ('voorlopig', 'uitgenodigd', 'bevestigd')
      AND oa.getimed AND NOT oa.logistiek AND ((oa.van < s.tot AND s.van < oa.tot) OR oa.van = s.van)))
