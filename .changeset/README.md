# Changesets in Lumi

We use [Changesets](https://github.com/changesets/changesets) to automate package versioning and CHANGELOG generation across the Bun workspace.

## Adding a changeset

When submitting a pull request that introduces user-facing changes, bug fixes, or new features, run:

```bash
bun changeset
```

Follow the interactive prompts to select the affected packages, choose the bump type (`major`, `minor`, `patch`), and write a concise summary of your changes. Commit the generated markdown file under `.changeset/` along with your PR.
