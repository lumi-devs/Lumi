# 0003: Dashboard in a separate repo, consuming published contracts

Status: Accepted

## Context

The dashboard is a Next.js App Router web admin panel with its own release
cadence, its own frontend toolchain, and no need to ever touch Postgres,
Redis, or the bot token directly — every dashboard read/write already goes
through the RPC bridge (ADR 0002). Keeping it in this monorepo meant its
build, lint and typecheck were coupled to this repo's `turbo`/workspace setup
for no benefit, since it never imports this repo's *source*, only the wire
contract.

## Decision

The dashboard lives in its own repo, `lumi-devs/lumi-dashboard`, published as
the `ghcr.io/lumi-devs/lumi-dashboard` image. It talks to `apps/api` only
over the internal HTTP RPC bridge (`apps/api/src/rpc-http-server.ts`) and
consumes `@lumi-devs/contracts` / `@lumi-devs/observability` from GitHub
Packages rather than importing this repo's source directly.

A dashboard-visible contracts change only reaches it once published and
re-pinned: bump `packages/contracts/package.json` (and
`packages/observability/package.json` if it changed), tag
`contracts-v<version>` and push — `.github/workflows/publish-packages.yml`
publishes both packages from that tag — then bump the pin in the
`lumi-dashboard` repo. `apps/api` enforces compatibility at connection time
via the `CONTRACT_MISMATCH` handshake from ADR 0002: same major version
always, and while major is `0`, same minor version too, so a breaking
contracts change and the dashboard's pin bump must land together.

## Consequences

The dashboard's build/lint/test run entirely in its own repo with its own
toolchain, and this repo's `packages/*`/`apps/*` workspace only ever contains
backend code. The cost is the extra release step (publish + re-pin) for any
contracts change the dashboard needs, and the two packages are versioned and
published in lockstep from one tag rather than independently (see ADR 0009)
specifically because the dashboard consumes them from outside this repo.
