# 0009: No Changesets — contracts and observability release in lockstep from one tag

Status: Accepted

## Context

`packages/contracts` and `packages/observability` are the two packages
published for the dashboard repo to consume (ADR 0003). Changesets
(`@changesets/cli`) is the standard tool for exactly this — versioning and
changelogs for packages published out of a monorepo — but its entire model is
independent per-package versions and changelogs, decided per pull request.

## Decision

No Changesets setup exists in this repo (no `.changeset/` directory, no
`changeset` script) — adding one was evaluated and rejected. Instead, both
packages are versioned and published in lockstep from a single git tag:
bump both `packages/contracts/package.json` and
`packages/observability/package.json` by hand to the same version, tag
`contracts-v<version>`, and push — `.github/workflows/publish-packages.yml`
parses that one tag into a single `steps.version.outputs.version` and stamps
it onto *both* packages regardless of whether both actually changed. The
tag's version string also picks the npm dist-tag: a version containing `-`
(e.g. `contracts-v0.5.0-next.2`) publishes under `next`, otherwise `latest`.

## Consequences

There's exactly one release ritual to learn (bump two files by hand, tag,
push) and exactly one compatibility question to ask ("what's the
`@lumi-devs/contracts` pin"), which lines up with `apps/api`'s
`CONTRACT_MISMATCH` handshake (ADR 0002) checking one version, not two. The
cost is that a change to only one of the two packages still bumps both
version numbers, and there's no per-package changelog generation — Changesets'
independent-versioning model was rejected specifically because it would fight
this one-version-for-both design rather than replace the manual step
cleanly. Revisit this if a third published package is added that shouldn't
be forced to release on the same cadence as these two.
