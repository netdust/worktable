# records/sites — website projects

One folder per site. The record is the project; the code is elsewhere.

    records/sites/<slug>/
      item.md        frontmatter: type, status, run, created, updated,
                     client, repo (the site repo), url, plus the body
      research.md    the client, their audience, competitors — sourced
      brief.md       audience · pages · content · constraints · done means
      reviews/       independent review verdicts (gitignored working papers)

`item.md` carries `repo:` — the git remote of the site repo where the
build actually happens through `templates/wordpress-site/.flow`. That
is the only link between the two, and it is deliberate: the record
outlives the build, and the repo can be handed over without it.

The flow is `flows/site-project.yaml`: research → gated brief →
attested review → your approval → (the build happens in the site repo)
→ launch seal.
