# records/dossiers

One dossier is one folder: `records/dossiers/<slug>/`.

    <slug>/
      item.md         # the record: frontmatter core + open fields
      research.md     # stage artifact — sourced findings
      dossier.md      # final artifact — ## Summary + ## Sources
      reviews/        # gitignored working papers (evidence = attest notes)

`item.md` frontmatter core (see docs/SPEC.md):

    ---
    type: dossier
    status: new          # flow-owned: new → researched → drafted → reviewed → final
    run:                 # flow-owned
    created: 2026-07-23
    updated: 2026-07-23
    subject: <what this dossier is about>
    ---

Driven by `flows/dossier.yaml`: research → gate → draft → gate →
attested review → your seal. Status values are written only by the
flow; everything else is workspace.
