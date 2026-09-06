# Git workflow

## Commit message style

Real history is Conventional Commits, `type(scope): description`, imperative mood,
no trailing period. Scopes are the workspace package/app name most of the time —
`core`, `dashboard`, occasionally a comma list (`perf(core,dashboard): ...`,
`refactor(core,worker): ...`) when a change spans two. Verbatim examples from
`git log`:

```
fix(core): restore the OWNER_IDS env var name
fix(dashboard): let the production build run without a session secret
refactor(core): drop unused card builders and their context wrappers
fix(core): resolve library versions via package exports
feat(dashboard): IA redesign phase 2 - nested guild route paths with legacy redirects
refactor(core): multi-target moderation, confirm prompts, RPC/error consolidation
fix(security): path traversal in docs slug resolution, direct Redis access from dashboard (#135)
perf(core,dashboard): batch appeals moderation lookups, memoize DataTable columns (#134)
refactor(core,worker): export env subpath and replace raw process.env bypasses (#140)
chore(deps): bump codecov/codecov-action from 6 to 7
chore(nix): update flake.lock
```

`CONTRIBUTING.md:207-215` documents the `type(scope): description` format with its
own example table, but its examples (`feat(moderation): add /quarantine command`,
`fix(gateway): resolve heartbeat timeout reconnect loop`) use scopes
(`moderation`, `gateway`) that don't actually appear anywhere in real history —
the real scope vocabulary observed is workspace names (`core`, `dashboard`,
`worker`), plus a few process scopes (`deps`, `nix`, `ci`, `docs`). Prefer matching
what's actually in `git log`, not the doc's invented examples.

Some commits (mainly larger multi-area ones) carry a longer body as a bullet list,
one bullet per area touched, e.g.:

```
feat: overhaul UI system, setup wizards, RPC batch endpoints

- config schema: DURATION, MULTI_ROLE/CHANNEL/USER, STRING_LIST,
  NUMBER step; comma-list path deleted, defs+readers migrated
- discord: rebuilt config renderer (Label modals, native multi
  pickers), /setup wizard, kit limits/navRow/pageFooter, SDK mirrors
- dashboard: tabbed searchable ModuleConfigForm, new inputs,
  converged anti-nuke/join-gate/tempvc cards, setup wizard +
  issues checklist, guild-picker invite states
```

No `!` breaking-change marker in use anywhere in history — breaking changes get
called out in the changeset body instead (see below), not the commit header.

## Changesets are required, not optional

`.github/workflows/changeset-check.yml` fails a PR if it touches any non-`.md`
file under `packages/` or `apps/` and doesn't add a new file under `.changeset/`
(excluding `.changeset/README.md`). Exemptions: bot-authored PRs (Dependabot,
Renovate) and PRs labeled `docs-only`, `area:docs`, `area:ci`, or `area:deps`.
Generate one with `bun changeset` (aliased `bun run changeset`), which prompts for
affected packages and bump type, then commit the resulting markdown file. Real
examples:

```md
---
'@lumi/core': patch
'lumi': patch
---

Restore the OWNER_IDS env var name, which a constant rename had rewritten to a key nothing sets
```

```md
---
'@lumi/core': patch
'lumi': patch
---

Trim redundant comments and dead code post-release cleanup
```

One sentence, present tense, no period requirement either way — matches the tone
of the commit subject, not a changelog-formal voice. `.github/workflows/release.yml`
runs on every push to `main` and manages the Changesets version PR /
GitHub release automatically — you don't hand-bump `package.json` versions.

## Branch naming

No single rigid scheme, but real branches cluster into a few patterns (from
`git branch -a`):

- `feat/<short-kebab-description>` — `feat/dashboard-redesign`,
  `feat/ui-overhaul`, `feat/phase5-chaos-fault-suite`,
  `feat/robustness-1.1-distributed-core`, `feat/robustness-2.2-database-indexes`
- `fix/<short-kebab-description>` — `fix/owner-ids-env-key`,
  `fix/core-audit-tier1`
- `refactor/<short-kebab-description>`, sometimes with a `-v2` suffix for a redo —
  `refactor/core-config-remake`, `refactor/core-tier2-structural`,
  `refactor/core-tier2-structural-v2`, `refactor/core-tier4-cleanup`,
  `refactor/core-tier4-cleanup-v2`, `refactor/modularise-lumi-core`,
  `refactor/modernize-ts-and-utilities`
- `chore/<short-kebab-description>` — `chore/fresh-everything`,
  `chore/remove-audit-planning-cruft`
- `audit/<area>` for investigation-only branches — `audit/docs`,
  `audit/perf-bloat`, `audit/root`
- `release/<version>` — `release/v0.3.1`; the CI workflow explicitly triggers on
  `release/*` pushes (`.github/workflows/ci.yml:5`)
- Sequential `layer-NN` branches (`layer-01` through `layer-11`) were used for a
  chain of stacked PRs during one large refactor push (see the `Merge pull request
  #144-#155` sequence in `git log`) — not a pattern to imitate for ordinary work,
  just what a large multi-PR body of work looked like here once.

## What has to pass before merge

`.github/workflows/ci.yml` runs on PRs into `main`/`develop` and on `merge_group`.
A `changes` job path-filters first (`dorny/paths-filter`) so unrelated jobs skip
when only docs changed; the required jobs when code under `apps/**` or
`packages/**` changed are:

- **lint** — `bun run lint:all` (or, on a PR, `turbo run lint:all --filter
  [origin/$BASE_REF...HEAD]` first, falling back to the full `bun run lint` if
  that fails)
- **typecheck** — same filtered/full pattern, `bun run typecheck`
- **test** — `bun run test:coverage` (both root vitest and dashboard vitest,
  with coverage), uploads `coverage/lcov.info` +
  `coverage/dashboard/lcov.info` as an artifact and to Codecov
  (`continue-on-error: true` on the Codecov step specifically — a Codecov
  failure doesn't fail CI, a test failure does)
- **build** — `bun turbo run build` across the monorepo
- **validate-examples** — only when `examples/**`, `scripts/validate-addon.ts`,
  or the downloader/addon-sdk source changed; runs `bun run validate examples`
  against the Downloader's structural rules
- **nix-check** — only when `flake.nix`/`flake.lock` changed; `nix flake check`

A final `ci-status` job aggregates all of the above and is the one actually
required for merge (`needs: [changes, lint, typecheck, test, build,
validate-examples, nix-check]`, fails if any upstream job failed or was
cancelled) — branch protection should point at this job, not the individual ones,
since several of them conditionally skip.

Separately, `.github/workflows/changeset-check.yml` (a different workflow, see
above) blocks the PR independently if a changeset is missing.

`.github/pull_request_template.md` has its own checklist (`bun run typecheck`
passes, `bun run lint` passes, `bun run test` passes, no cross-module imports, no
raw `EmbedBuilder`s, localization added to "all supported locales (en-US, de,
es-ES, fr)"). That last line is stale — there are 24 locale directories under
`packages/core/src/languages/`, not 4 (see `i18n.md`) — treat the checklist's
*intent* ("update every locale file's keys") as correct, but not its literal list
of four languages.
