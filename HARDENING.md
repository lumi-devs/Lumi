# Lumi (Ember-TS) — Hardening & Verification Prompt

> **Purpose.** This is a self-contained prompt + backlog for a future Claude Code session.
> `TODO.md` (the Part I + Part II scale-out roadmap) is marked **all `[x]`**, but a large share
> of that work was *written but never runtime-verified* — the roadmap is littered with
> "🔬 not re-run here", "tests unchanged (pre-existing failures)", and "not executed in this
> session". This document records the **actually-verified state** and a prioritized plan to get
> the tree green and prove the distributed paths.
>
> **Trust nothing here without re-running the gates.** The snapshot below is dated; re-verify
> first (see [Re-verify in 4 commands](#re-verify-in-4-commands)).

---

## The prompt (paste this to start a session)

```
Read HARDENING.md. Re-run the four verification gates to refresh the current-state
snapshot, then work the backlog top-down: P0 (get the tree green) before P1
(single-instance guarantee) before P2 (prove distributed paths) before P3/P4.

Rules of engagement:
- Honor CLAUDE.md conventions exactly (cards, formatters, zero cross-module imports,
  RedisKeys, container.db, etc.). Do NOT hand-roll what the library reference covers.
- The single-instance guarantee is sacred: `docker compose up` (no profile) must yield a
  working bot on one host. Never let a refactor break the monolith path.
- Every fix must leave `bun run typecheck`, `bun run lint`, and `bun test` no worse than
  you found them — ideally green. Update the snapshot + check boxes in this file as you go.
- When a public contract changes, update CLAUDE.md and the matching `~/.claude/skills/ember-*`.
- Commit in logical units with conventional messages; push to the `codeberg` remote
  (it mirrors to GitHub server-side). Do not add `data/` or any embedded repo.
```

---

## Re-verify in 4 commands

```bash
bun run typecheck                                   # tsc --noEmit -p tsconfig.json
bunx eslint packages/*/src apps/*/src --ext ts      # read-only (the npm script adds --fix!)
bun test                                            # vitest run
docker compose config --services                    # what `docker compose up` actually starts
```

> ⚠️ `bun run lint` is `eslint … --fix` — it **mutates the tree**. Use the bare `bunx eslint …`
> form above when you only want to *measure*.

---

## Verified current state — 2026-05-30

| Gate | Result | Detail |
|---|---|---|
| `typecheck` | ✅ **clean** | 0 TS errors across the workspace. |
| `lint` | ❌ **26 errors, 7 warnings** | 16 files. Mostly `require-await` in the new bus/sharding impls + `no-this-alias` in a monkey-patch. |
| `test` | ❌ **6 fail / 7 pass / 5 errors** | A `node_modules` hack crashes 5 suites on import; 1 real assertion bug. |
| `docker compose up` | ⚠️ **no bot** | Default profile = `postgres, pgbouncer, redis, rabbitmq, dashboard`. `worker` is gated behind `--profile production`. |

The roadmap's own un-ticked boxes corroborate this: every item under **"Single-instance
guarantee"** and **"Cross-cutting gates"** at the bottom of `TODO.md` is still `[ ]`.

---

## Backlog (priority order)

### P0 — Get the tree green (blockers)

- [ ] **P0.1 — Restore the test suite (the `node_modules` discord.js hack).**
  - **Symptom:** `bun test` → `TypeError: Attempted to assign to readonly property` at
    `node_modules/discord.js/src/index.js:260`, killing 5 suites (`afk.test.ts`, etc.) on import.
  - **Why:** Someone hand-added a "Polyfills for Sapphire / cjs-module-lexer" block
    (`exports.time = formatters.time; …`) to `node_modules/discord.js/src/index.js`. But two lines
    above, `__exportStar(require('@discordjs/formatters'), exports)` **already** re-exports those
    names as **readonly getters** — so under Bun the manual `exports.x =` assignment throws.
    Worse: it's a raw `node_modules` edit, so **every `bun install` wipes it** and the breakage
    returns. There is no `patchedDependencies` entry in `package.json` today.
  - **Fix options (pick after investigating, in rough order of preference):**
    1. Make it durable + Bun-safe via **`bun patch discord.js`**, and replace the throwing
       `exports.x = y` assignments with `Object.defineProperty(exports, 'x', { value: y,
       enumerable: true, configurable: true })` (defineProperty overrides the getter where `=`
       fails). `bun patch` persists the change across installs.
    2. Determine whether the manual block is even needed — `__exportStar(@discordjs/formatters)`
       already exports `time`/`TimestampStyles`/`*Mention`. The block exists for `cjs-module-lexer`
       *static* named-export detection (Node ESM interop). Confirm what actually imports these
       **from `discord.js`** vs `@discordjs/formatters` (CLAUDE.md already mandates the latter).
    3. Bump discord.js to a version that exports these statically, removing the need for the patch.
  - **Acceptance:** `bun test` runs all suites with no import-time `TypeError`; the fix survives a
    fresh `bun install` (i.e. it is a committed `bun patch`, not a raw edit).

- [ ] **P0.2 — Fix the failing unit test (`shortTimestamp`).**
  - **Symptom:** `packages/core/tests/utilities/time.test.ts` → `shortTimestamp` expects
    `<t:1000:T>` but receives `<t:1000:t>`.
  - **Why:** Per Discord, `t` = **ShortTime** (correct), `T` = LongTime. The helper returns the
    correct `t`; the **test assertion is stale**. Confirm against `src/utilities/time.ts` (read the
    helper to be sure it intends ShortTime), then correct the expectation to `:t`.
  - **Acceptance:** test passes asserting the Discord-correct style; no helper change unless the
    helper itself is wrong.

- [ ] **P0.3 — Clear the 26 lint errors.**
  - **Categories & files:**
    - `@typescript-eslint/require-await` — async interface methods with sync bodies:
      `packages/event-bus/src/{InProcBus,NatsJetStreamBus,RedisStreamsBus,RawGatewayConsumer,RawGatewayPublisher}.ts`,
      `packages/sharding/src/shard-planner.ts`, `apps/gateway/src/main.ts`,
      `packages/core/src/core/entity-cache/entity-populator.ts`,
      `packages/core/src/core/lib/{discord-rest,pre-deferred-interactions,scheduler-leader-lock}.ts`,
      `packages/core/src/core/services/GuildLogService.ts`.
      → These implement a `Promise`-returning `EventBus`/interface surface with synchronous bodies.
      Decide: refactor to drop `async` + return `Promise.resolve()`, or relax the rule for
      interface-conformance files in the eslint config. Don't blanket-disable.
    - `@typescript-eslint/no-this-alias` + `func-name-matching` — the worker WS monkey-patch in
      `packages/core/src/client/EmberClient.ts` (and the `patched`/`handlePacket` name mismatch).
      → A targeted `// eslint-disable-next-line` *with a justifying comment* is acceptable here.
    - `no-eq-null` warnings + the rest in `SortedCollection.ts`, `ModuleStore.ts`, `loggable.ts`.
  - **Note:** some are auto-fixable by `bun run lint` (the `--fix` script) — run it, re-measure,
    then hand-resolve the residue (`require-await`, `no-this-alias` are **not** auto-fixable).
  - **Acceptance:** `bunx eslint packages/*/src apps/*/src --ext ts` exits 0.

### P1 — Honor the single-instance guarantee

- [ ] **P1.1 — `docker compose up` must start a working bot.**
  - **Symptom:** bare `docker compose up` starts infra only; `worker` is `profiles: [production]`
    (docker-compose.yml:130). A self-hoster gets Postgres/Redis/RabbitMQ but **no bot** — breaking
    the roadmap's explicit promise ("runs `docker-compose up` and gets a working bot — no manual
    multi-service wiring").
  - **Decide:** either (a) remove the `production` profile from `worker` so the monolith
    (`EMBER_ROLE=monolith`, the default) is in the no-profile set, or (b) keep it profiled and
    rewrite the guarantee + README to `docker compose --profile production up`. (a) matches the
    stated guarantee. Reconcile with the `ember-dev` service (also profiled) so dev vs self-host
    defaults are coherent.
  - **Acceptance:** on a clean checkout, `docker compose up` brings the bot online and it logs in
    to Discord (or fails only for missing `BOT_TOKEN`, not missing wiring). Update `TODO.md`'s
    "Single-instance guarantee" boxes and the README.

- [ ] **P1.2 — Smoke every profile.** `default`, `production`, `scale`, `ha`, `observability`,
  `scale-nats`. For each: `docker compose --profile <p> config` parses, then `up` reaches healthy.
  - **Acceptance:** a short table in `docs/` (or this file) recording which profiles boot clean and
    any host-resource caveats (the `ha` profile costs ~1.5 GB extra RAM per `ha-topology.md`).

### P2 — Prove the distributed paths (the unrun 🔬 tests)

- [ ] **P2.1 — Make the chaos/verify scripts repeatable + CI-run.** These exist and were
  "run locally once" but never gated in CI:
  `scripts/chaos-streams.ts`, `chaos-cluster.ts`, `chaos-rolling-deploy.ts`, `chaos-autoscale.ts`,
  `chaos-gateway-proxy.ts`, `verify-scheduler-catchup.ts`, `loadtest-rest.ts`. All need a **real
  Redis** (some need NATS / a token).
  - **Do:** add a `bun run verify:chaos` aggregate + a CI workflow that spins up Redis (+NATS) as
    services and runs them. Surface pass/fail clearly.
  - **Acceptance:** one documented command runs the suite green against ephemeral infra.

- [ ] **P2.2 — Exercise the NATS path.** `chaos-gateway-proxy.ts` and the `NatsJetStreamBus` were
  **never run** (no local NATS server in the authoring session). Bring up `--profile scale-nats`
  and run `TRANSPORT=nats NATS_URL=… bun scripts/chaos-gateway-proxy.ts`.
  - **Acceptance:** the NATS transport drains events with the same p99 SLO (≤200 ms) the Redis path
    hit, and DLQ/redelivery behave identically.

- [ ] **P2.3 — The deferred multi-worker chaos.** S1's "kill a worker mid-command, another picks
  up, no double-effect" was deferred into S2/S6 scripts. Confirm it's genuinely covered by
  `chaos-rolling-deploy.ts` + `chaos-streams.ts` on a **multi-replica** run, not just single-proc.

### P3 — Pay down documented debt

- [ ] **P3.1 — Migrate modules off local discord.js cache.** 10 `client.{guilds,channels,users,
  members}.cache` refs remain (worker role has no local cache — these silently no-op at scale).
  Files: `modules/afk/lib/delete-handler.ts`, `afk/services/AfkService.ts`,
  `verify/lib/captcha-expiry-handler.ts`, `verify/interaction-handlers/captcha.ts`,
  `utility/tempvc/listeners/ready.ts`, `dashboard/index.ts`, `mod/lib/thresholds.ts`,
  `mod/lib/lift-handler.ts`, `mod/commands/ban.ts`.
  - **Do:** route through `container.entityCache` (the `RedisEntityCache` shipped in S8/S3) or REST,
    following the migration pattern in `docs/explanation/entity-cache.md`.
  - **Acceptance:** the grep count trends to 0 (or each remaining use is justified as monolith-only).

- [ ] **P3.2 — Finish F5's lazy-load unification (`[~]`).** Discovery no longer executes module
  code, but boot still uses `registerPath` + `super.loadAll()` rather than a pure convention-mount.
  Low risk, low priority — close the loop or explicitly accept it.

- [ ] **P3.3 — Verify generated manifests are in sync.** Run `bun run modules:manifest`; the working
  tree should show **no diff** (committed `manifest.json` == in-code `meta`). If it diffs, the
  manifests are stale and discovery is reading wrong metadata.

### P4 — Docs & contract sync

- [ ] **P4.1 — Reconcile CLAUDE.md + skills with the new surfaces** introduced this cycle:
  `container.entityCache`, the role/transport env matrix (`EMBER_ROLE`, `TRANSPORT`,
  `CLUSTER_NAME`, `REDIS_SENTINELS`, `SCHEDULER_LEADER_LOCK`, …), the readiness/shutdown registries,
  and the removal of the Sapphire `HealthRoute`/`@sapphire/plugin-api` (health is now the metrics
  port's `/healthz` + `/readyz`). CLAUDE.md still describes `src/` layout; the repo is now a
  `packages/*` + `apps/*` workspace — update or add a monorepo note.
- [ ] **P4.2 — Update `TODO.md`'s bottom gates** to reflect real status once P0–P2 land.

---

## Constraints & conventions (do not break)

- **CLAUDE.md is law** — cards (`make*Card`), `@discordjs/formatters`, `@sapphire/*` helpers,
  `RedisKeys`/`RedisTTL`, `container.db` (never `container.prisma` in a module), zero cross-module
  imports, Zod-first config. Don't reintroduce hand-rolled patterns the reference bans.
- **Single-instance path always works** — every change keeps a monolith/compose route until the
  distributed route is proven.
- **No `data/` in git** — it's runtime-downloaded addons (an embedded repo); now in `.gitignore`.
- **Remote:** push to `codeberg` (primary; mirrors to GitHub). `origin`/`github` point at the old
  pre-rename `ember-hq/bot.git` and are stale.

## Definition of done

1. `bun run typecheck`, `bunx eslint …`, and `bun test` all green — and the test fix survives a
   fresh `bun install`.
2. `docker compose up` (no profile) yields a working bot on one host.
3. The chaos/verify suite runs green in CI against ephemeral Redis (+NATS).
4. CLAUDE.md + `ember-*` skills match the shipped surfaces; `TODO.md` gates reflect reality.
