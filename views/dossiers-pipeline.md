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
