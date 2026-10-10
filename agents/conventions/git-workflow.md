# Git workflow

## Commit message style

Conventional Commits, `type(scope): description`, imperative mood, no trailing
period. Scopes are workspace names most of the time — `core`, `dashboard`,
`worker` — plus process scopes (`deps`, `nix`, `ci`, `docs`). No `!`
breaking-change marker in use; breaking changes go in the changeset body.

## Changesets are required, not optional

`.github/workflows/changesets.yml` ("Require a changeset") fails a PR that
touches `packages/**` or `apps/**` without adding a file under `.changeset/`
(`bunx changeset status --since="origin/$base"`). Generate one with `bun
changeset`, commit the resulting markdown. One sentence, present tense. The
same workflow's `version` job opens the version PR and publishes via
`changesets/action` (`version-packages` / `release-packages`) — never hand-bump
`package.json` versions. `.github/workflows/release.yml` only runs on `v*`
tags (`gh release create`).

## Branch naming

No rigid scheme; observed clusters: `feat/<kebab>`, `fix/<kebab>`,
`refactor/<kebab>` (sometimes `-v2` for a redo), `chore/<kebab>`,
`audit/<area>` for investigation-only work, `release/<version>`.

## What has to pass before merge

`.github/workflows/ci.yml` runs on PRs into `main`/`develop`, pushes to
`main`/`develop`/`release/*`, and `workflow_dispatch`. A `changes` job
path-filters first so unrelated jobs skip. Required jobs:

- **lint** — `bun run lint` (check-only; `lint:fix` is local-only)
- **typecheck** — `bun run typecheck`
- **test** — `bun run test:coverage`; uploads `coverage/lcov.info`,
  `coverage/api/lcov.info`, `coverage/cli/lcov.info` (Codecov step is
  `continue-on-error`)
- **integration** — live Postgres/Valkey suite, separate job
- **build** — `bun turbo run build`
- **nix-check** — only when `flake.nix`/`flake.lock` changed

Final `ci-status` aggregates all of the above (`needs: [changes, lint,
typecheck, test, integration, build, nix-check]`) — branch protection points
at it, not the individual jobs.

`.github/pull_request_template.md` has its own checklist (typecheck, lint,
test, no cross-module imports, no raw `EmbedBuilder`s, locale keys). Its
language list is stale — there is exactly one locale directory
(`packages/core/src/languages/en-US/`); treat the intent ("update locale keys")
as correct, not the literal list.

The example addons (`hello-world`, `tag-manager`) live in
[`lumi-devs/lumi-addons`](https://github.com/lumi-devs/lumi-addons)' `examples/`,
validated by that repo's own CI.
