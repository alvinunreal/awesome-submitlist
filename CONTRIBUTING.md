# Contributing

Thanks for helping keep this list useful.

## Suggesting a destination

Open an issue with the *Suggest a destination* template, or send a catalog
request from the [Submitlist contact page](https://submitlist.io/contact). Either way the
site goes through the same review before it appears here:

1. Someone opens the site and confirms it still accepts submissions.
2. Eligibility rules, pricing, and the exact submission URL are recorded.
3. Domain Rating and monthly organic traffic are pulled from Ahrefs.
4. The entry is published to the catalog and shows up here on the next sync.

Sites that only exist to sell listings, parked domains, link farms, and sites
that no longer accept submissions are not added.

## What pull requests can change

`README.md` and `data/destinations.json` are generated. A pull request that
edits them by hand will be overwritten by the next weekly sync, so please do
not send one. Pull requests are welcome for:

- `scripts/build-readme.js` (table layout, wording, formatting)
- `assets/` (illustrations, icons)
- `CONTRIBUTING.md` and the issue templates
- the GitHub Action in `.github/workflows/sync.yml`

## Rebuilding locally

```sh
bun scripts/build-readme.js          # or: node scripts/build-readme.js
bun scripts/build-readme.js --force  # rewrite even when the catalog is unchanged
```

The script reads the public catalog endpoint at
`https://api.submitlist.io/catalog/destinations`, skips archived and paused
destinations, and writes both files. No token is needed.

## Reporting a wrong entry

If a site is dead, moved, or its pricing changed, open an issue with the site
name and what you saw. Corrections are made in the catalog, not in this repo,
and flow back here automatically.
