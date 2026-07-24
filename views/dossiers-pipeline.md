---
type: view
view: table
source: records/dossiers
group_by: status
columns: [title, status, updated, run]
sort: updated desc
---

# Dossier pipeline

A view is a document: the frontmatter above IS the view definition —
source folder, rendering hint, grouping, columns, sort. Whatever
renders it (Obsidian, a generator, the phase-2 frontend) is wallpaper;
this file is the definition of record.

Obsidian users — the equivalent live Dataview query:

```dataview
TABLE status, updated, run
FROM "records/dossiers"
GROUP BY status
SORT updated DESC
```

<!-- rendered:begin -->
_Rendered 2026-07-24 by `bin/render-views.py` — derived, do not edit._

### final (1)

| record | status | updated | run | dossier | research | reviews |
|---|---|---|---|---|---|---|
| [gezondleven-be](../records/dossiers/gezondleven-be/item.md) | final | 2026-07-23 | r20260723-215841 | [✓](../records/dossiers/gezondleven-be/dossier.md) | [✓](../records/dossiers/gezondleven-be/research.md) | ✓ |
<!-- rendered:end -->
