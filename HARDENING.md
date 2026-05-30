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

## Verified current state — 2026-05-30 (P0.1–P0.3 done; all three gates green — typecheck 0, lint 0 errors/6 warnings, vitest 36/36 across 7 suites. Also this session: P1.3 resolved (ha demoted to PLANNED), P2.1 chaos runner + CI added, P4.2 cross-cutting gate synced. Remaining open items all need live external infra — see P1.2 / P2.2 / P2.3)

| Gate | Result | Detail |
|---|---|---|
| `typecheck` | ✅ **clean** | 0 TS errors across the workspace. |
| `lint` | ✅ **0 errors, 6 warnings** | **P0.3 done.** All 26 errors fixed (require-await→`Promise.resolve`, member-ordering moves, `no-this-alias`→arrow, class-literal→field). 6 pre-existing **warnings** remain (`no-negated-condition`×3, `switch-exhaustiveness`, `func-names`, `no-eq-null`) — non-blocking; `eslint` exits 0. |
| `test` (vitest) | ✅ **36 pass / 7 suites, 0 fail** | **P0.2 done.** All 15 failures were **test staleness**, not code bugs — fixed test-only (+ one stale `time.ts` docstring), no production-logic change. Stale flat `container.prisma`/`container.db` mocks → namespaced `.afk`/`.config`/`.permissions`/`.modules`; `WorkerManager` lazy-spawn `__INIT__` handshake; `module_store` rewritten for true-private `#records`/manifest-driven discovery; `permissions` import-crash fixed (import-time `OWNER_IDS` parse). NB: the canonical runner is **`bun run test` (vitest)** — `bun test` (Bun native) ignores `vi.mock` and reports different numbers. |
| `docker compose up` | ✅ **bot in default set** | **P1.1 done.** Default (no-profile) services are now `postgres, pgbouncer, redis, rabbitmq, dashboard, worker` (verified via `docker compose config --services`). `worker` (`EMBER_ROLE=monolith`) holds its own WS. Not booted runtime here (needs a live `BOT_TOKEN`), but the wiring is proven. |

> **P0.1 corrected diagnosis.** The "Polyfills for Sapphire" block was **not** in the published
> `discord.js@14.26.4` (the npm tarball is a clean 254-line `index.js`); it was **local pollution**
> present in both `node_modules` *and* the bun cache on this machine. `__exportStar(@discordjs/formatters)`
> already exports `time`/`TimestampStyles`/mentions, and discord.js already exports its own builders, so
> the block was pure redundancy that threw under Bun. HARDENING's suggested `Object.defineProperty` fix
> **also throws** — the `__exportStar` getters are **non-configurable**. Fix applied: restore all 3 copies
> (node_modules ×2 + cache) to pristine. **No `bun patch` is needed or possible** (the published package is
> already correct); a fresh `bun install` on a clean machine pulls the clean tarball.

The roadmap's own un-ticked boxes corroborate the rest: every item under **"Single-instance
guarantee"** and **"Cross-cutting gates"** at the bottom of `TODO.md` is still `[ ]`.

---

## Backlog (priority order)

### P0 — Get the tree green (blockers)

- [x] **P0.1 — Restore the test suite (the `node_modules` discord.js hack).** ✅ **DONE** — see corrected-diagnosis note in the snapshot above. The block was local pollution (node_modules + bun cache), not a published-package issue; restored all copies to the pristine 254-line tarball. Import `TypeError` gone; all 7 suites now run (which unmasked the stale-test failures below).
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

- [x] **P0.2 — Fix the failing unit tests.** ✅ **DONE 2026-05-30.** All 15 failures across 6 suites
  were **test staleness**, not code bugs — fixed test-only (plus one stale docstring); `bun run test`
  → **36 pass / 7 suites, 0 fail**, typecheck 0, lint 0 errors. Breakdown:
  - **`time.test.ts`** (1) — `shortTimestamp` asserted `:T` (LongTime). Per Discord `t` = ShortTime,
    which the helper correctly returns → assertion corrected to `:t`, and the helper's own stale
    `:T`/"14:30:00" docstring fixed to `:t`/"14:30". No helper logic change.
  - **`afk.test.ts`** (3) — mocked the old flat `container.prisma.afkEntry.*`; `DatabaseService` is
    namespaced → re-pointed to `container.db.afk.{findEntry,upsertEntry,deleteEntry,deleteAllForUser}`
    (note `deleteAllForUser` now returns a `number`, not `{count}`).
  - **`permission-overrides.test.ts`** (4) — namespaced `container.db.permissions.getPermissionOverrides`
    (dropped the dead `container.prisma.permissionOverride` mock).
  - **`permissions.test.ts`** (suite import-crash, 8 tests) — namespaced `container.db.config.getGuildSettings`,
    **and** fixed a load-time crash: `OWNER_IDS` is now parsed once at import (`envParseString("OWNER_IDS","")`),
    and the `vi.fn()` returned `undefined` → `.split` threw before any test ran. Env mock now returns the
    default string; bot-owner identity is tested via `container.client.application.owner` (the per-call
    `OWNER_IDS` `mockReturnValue` override can't affect an import-time const).
  - **`module_store.test.ts`** (4) — the deepest: the suite poked `_records`/`_ingest`/`_findIndex`, but
    discovery was refactored to **true ES-private** `#records`/`#walk` + **manifest-driven** ingest. Rewrote
    to drive the real walk/topo/conflict pipeline via a mocked `readManifest`/`metaFromManifest` + mocked FS,
    asserting through the public `getRecord()` / `registerPath` surface (incl. a b-first discovery order to
    actually exercise the topo sort).
  - **`workers.test.ts`** (3) — `WorkerManager` is now **lazy-spawn**: `new WorkerManager(n)` opens no threads
    until the first `send`/`broadcast`, and each spawn does a one-shot `__INIT__` handshake before jobs
    dispatch. Rewrote `MockWorker` to actually dispatch events + added a `completeInit()` helper; tests now
    assert lazy spawn (count honored only after first dispatch) and the init→job→response round-trip.
  - **Acceptance:** ✅ met. Canonical runner `bun run test` (vitest); changes are committed test files (+ one
    src docstring) so they survive a fresh `bun install` (the P0.1 node_modules pollution is the only
    install-fragile piece, already resolved).

- [x] **P0.3 — Clear the 26 lint errors.** ✅ **DONE** — `bunx eslint … ` exits 0 (0 errors).
  `require-await` resolved by dropping `async` + returning `Promise.resolve()` (no rule relaxation);
  `member-ordering` by relocating members (EmberClient `role`/`destroy`/`bootstrap`, ModuleStore
  `getConfigSchema`, scheduler-lock `release`); `no-this-alias`→arrow (also killed the `func-name-matching`
  warning); class-literal→readonly field. 6 pre-existing **warnings** left (non-blocking). Original detail:
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

- [x] **P1.1 — `docker compose up` must start a working bot. DONE.**
  - **Symptom (was):** bare `docker compose up` started infra only; `worker` was `profiles: [production]`
    (docker-compose.yml:130). A self-hoster got Postgres/Redis/RabbitMQ but **no bot** — breaking
    the roadmap's explicit promise ("runs `docker-compose up` and gets a working bot — no manual
    multi-service wiring"). TODO.md:179 confirms `worker` was *originally* on the default profile, so
    the `production` gating was a later regression.
  - **Fix (option a):** removed the `production` profile from `worker`, restoring it to the no-profile
    (default) set with `EMBER_ROLE=${EMBER_ROLE:-monolith}` (holds its own WS, talks to Discord
    directly — `DISCORD_PROXY_URL` defaults empty). Verified `docker compose config --services` →
    `worker` now in the default set; `docker compose config -q` parses clean.
  - **Dev/self-host reconciliation:** `ember-dev` stays under `profiles: [development]`. Because the
    default `worker` is now always-on, `--profile development up` would start **both** the worker and
    `ember-dev` on the same `BOT_TOKEN` (duplicate gateway identify). README now steers containerized
    hot-reload to `docker compose up ember-dev` (names the service → starts it + its infra deps only,
    **not** the prod worker). `--profile production up` stays backward-compatible (worker is always-on,
    so the profile is now a no-op alias of default).
  - **Acceptance:** ✅ `docker compose up` brings the bot into the boot set; it will fail only for a
    missing `BOT_TOKEN`, not missing wiring (not runtime-booted here — no live token). Updated
    `TODO.md`'s "Single-instance guarantee" boxes + status note and the README "Getting Started".

- [~] **P1.2 — Smoke every profile.** `default`, `production`, `scale`, `ha`, `observability`,
  `scale-nats`. For each: `docker compose --profile <p> config` parses, then `up` reaches healthy.
  - **Config-parse: done.** Every profile parses (`docker compose [--profile <p>] config -q` exits 0).
    Service counts per profile (via `config --services`):

    | Profile | `config` parses | Services activated | Notes |
    |---|---|---|---|
    | `default` (none) | ✅ | 6 | `postgres, pgbouncer, redis, rabbitmq, dashboard, worker` — the monolith bot (P1.1). |
    | `production` | ✅ | 6 | **Identical to default** — `worker` is now always-on, so this profile is a no-op alias (backward-compat only). |
    | `scale` | ✅ | 11 | default 6 + `worker-scale, gateway, scheduler, api, nirn-proxy` (gateway/worker split). |
    | `ha` | ✅ | **6** | **⚠️ no-op alias of default — now documented as PLANNED (P1.3 resolved via option b).** Activates only the default 6; the replica/sentinel/cluster services are config-only, not yet wired into `docker-compose.yml`. |
    | `observability` | ✅ | 10 | default 6 + `otel-collector, tempo, prometheus, grafana`. |
    | `scale-nats` | ✅ | 7 | default 6 + `nats` (JetStream transport). |

  - **Runtime "reaches healthy": NOT verified here** (needs a live `BOT_TOKEN` + booting heavy infra;
    `ha` would also need ~1.5 GB extra RAM per `ha-topology.md`). Left as a manual/staging step.

- [x] **P1.3 — The `ha` profile is empty (services never wired into compose).** ✅ **RESOLVED 2026-05-30 via option (b) — docs demoted to "planned."** Re-confirmed the gap (`--profile ha config --services` → only the default 6; `postgres-replica` 0 hits in compose and never in `git log -S`; the `config/{postgres,redis,rabbitmq}/*` files do exist). Since option (a) — wiring streaming replication + a 3-sentinel quorum + a 3-node Rabbit cluster — is a substantial feature build that is **runtime-unverifiable in this environment** (no multi-node infra; ~1.5 GB extra RAM per the doc) and the doc itself says "don't fabricate," I made the docs honest instead: added a **PLANNED status banner** to `docs/explanation/ha-topology.md` (reframed every "brings up" as intended design), and demoted the three false `[x]` claims in `TODO.md` (Part II Slice 3, the "no SPOF" gate, and the single-instance parenthetical) to `[~]` "config shipped, compose wiring pending." Option (a) remains the deliberate future build — the config files are the building blocks, only the `services:` blocks (tagged `profiles: [ha]`) and a staging boot are outstanding. Original detail below.
  - **Evidence / framing:** `docs/explanation/ha-topology.md`
  ("Lumi's `docker compose --profile ha up` brings up a replicated copy of every…") and TODO.md's Part II
  Slice 3 claim the `ha` profile delivers a Postgres replica, a 3-node Redis Sentinel trio, and a 3-node
  RabbitMQ cluster. **Reality:** `git log -S"postgres-replica" -- docker-compose.yml` shows the string has
  **never** existed in the compose file; `--profile ha config --services` returns the default 6. The supporting
  **config files do exist** (`config/postgres/{primary.conf,init-replication.sh,replica-entrypoint.sh}`,
  `config/redis/{redis-replica.conf,sentinel-entrypoint.sh}`, `config/rabbitmq/rabbitmq-ha.conf`) — only the
  `services:` blocks that consume them were never added (commit `545a371` shipped the configs + docs but not
  the wiring).
  - **Decide:** either (a) add the `postgres-replica` / `redis-replica` + `redis-sentinel-1/2/3` /
    `rabbitmq-2/3` + `rabbitmq-ha-policy` service blocks (tagged `profiles: [ha]`) to match the existing
    config files and the doc, or (b) demote the doc + TODO checkbox to "planned" until the wiring lands.
    (a) is a substantial, **runtime-unverifiable-here** feature build (streaming replication, sentinel quorum,
    Rabbit clustering) — scope it deliberately, don't fabricate. **Not done this session** (exceeds "smoke every profile").

### P2 — Prove the distributed paths (the unrun 🔬 tests)

- [~] **P2.1 — Make the chaos/verify scripts repeatable + CI-run.** ✅ **Scaffolding done 2026-05-30;**
  the first *green* run is the GitHub-mirror CI's job (no Redis/NATS in the authoring env to prove "green").
  - **`bun run verify:chaos`** — new `scripts/verify-chaos.ts` aggregate runner: runs the six Redis-backed
    legs sequentially (`chaos-streams`, `chaos-cluster`, `chaos-rolling-deploy`, `chaos-autoscale`,
    `chaos-gateway-proxy`[streams], `verify-scheduler-catchup`), classifies each by the scripts' own exit
    contract (**0 PASS / 2 INFRA-unreachable / else FAIL**), aborts loudly if infra is down, prints a per-leg
    ✅/❌/🔌 summary, and exits non-zero if any leg failed. `WITH_NATS=1` / `NATS_URL=…` appends the
    JetStream `gateway-proxy` leg (`verify:chaos:nats`). `loadtest-rest.ts` is deliberately **excluded**
    (needs a real `BOT_TOKEN` + nirn-proxy). **Smoke-tested locally:** with no Redis the runner correctly
    reports `🔌 INFRA … 0/6 passed, 5 not run (aborted)` and exits 1 — orchestration proven; the assertions
    themselves still need real Redis. typecheck clean (`scripts/` is in `tsconfig.json`).
  - **CI:** new `.github/workflows/chaos.yml` — Redis 7 service container + a JetStream NATS step
    (`nats:2.10-alpine -js`, healthz-gated), runs `bun run verify:chaos` as the **authoritative Redis gate**
    and the NATS/JetStream leg as **`continue-on-error` (informational until P2.2)**. Triggers: master push +
    nightly cron + manual dispatch (not every PR — chaos is slow). Also hardened `ci.yml`: added a **`test`
    job** (CI never ran `bun run test` before — the whole P0.2 suite was ungated; runs `db:generate` first)
    and switched the **`lint` job** from `bun run lint` (`eslint --fix` → auto-fixes-then-passes, gating
    nothing) to the read-only bare `bunx eslint packages/*/src apps/*/src --ext ts`.
  - **Acceptance:** ⚠ **partially met** — the documented command + ephemeral-infra CI exist and the runner
    is proven, but "**suite green against ephemeral infra**" can only be confirmed once `chaos.yml` actually
    runs on the mirror (first push/nightly). Flip to `[x]` after that run is green (or fix whatever the real
    Redis surfaces).

- [ ] **P2.2 — Exercise the NATS path.** `chaos-gateway-proxy.ts` and the `NatsJetStreamBus` were
  **never run** (no local NATS server in the authoring session). Bring up `--profile scale-nats`
  and run `TRANSPORT=nats NATS_URL=… bun scripts/chaos-gateway-proxy.ts`.
  - **Harness now exists (landed in P2.1):** `.github/workflows/chaos.yml` starts a JetStream NATS
    (`nats:2.10-alpine -js`) and runs the NATS leg as `continue-on-error`; locally `bun run verify:chaos:nats`
    (or `WITH_NATS=1 NATS_URL=… bun run verify:chaos`) drives it. **Remaining:** confirm a real run is green and
    meets the SLO/DLQ-parity acceptance, then promote the leg from informational to a hard gate.
  - **Acceptance:** the NATS transport drains events with the same p99 SLO (≤200 ms) the Redis path
    hit, and DLQ/redelivery behave identically.

- [ ] **P2.3 — The deferred multi-worker chaos.** S1's "kill a worker mid-command, another picks
  up, no double-effect" was deferred into S2/S6 scripts. Confirm it's genuinely covered by
  `chaos-rolling-deploy.ts` + `chaos-streams.ts` on a **multi-replica** run, not just single-proc.

### P3 — Pay down documented debt

- [~] **P3.1 — Migrate modules off local discord.js cache.** Original framing: "10
  `client.{guilds,channels,users,members}.cache` refs remain (worker role has no local cache —
  these silently no-op at scale)."
  - **⚠ Correction (2026-05-30): the premise is false — investigated, migration deliberately NOT
    done.** Workers *do* maintain a full guild/channel/role cache. Proof: (1) the gateway's
    `RawGatewayPublisher.attach()` forwards **every** DISPATCH packet whose type isn't in its
    `ignore` set (only `INTERACTION_CREATE` under `DEFER_AT_GATEWAY`) — so GUILD_CREATE / CHANNEL_* /
    GUILD_ROLE_* / GUILD_MEMBER_* all reach workers; (2) the worker `RawGatewayConsumer` feeds those
    to `client.ws.handlePacket`, which runs discord.js's action handlers and populates the cache —
    and the `ClusterReadyTracker` makes workers *wait* for the gateway's IDENTIFY backfill before
    consuming, precisely to get full guild state; (3) `makeCache` (EmberClient.ts:110) zeroes
    presence/voice/reactions/bans/etc. but keeps **GuildManager / ChannelManager / GuildRoleManager
    at default (unlimited)**. Two modules (`tempvc/listeners/raw.ts`, `core/entity-cache/entity-populator.ts`)
    explicitly rely on workers receiving GUILD_CREATE. The codebase's own comments
    (`captcha-expiry-handler.ts:1-3` — "each worker iterates its own guilds.cache … by design") are
    correct; this item contradicted them.
  - **Two of the listed files were never live sites:** `afk/lib/delete-handler.ts` and
    `mod/lib/lift-handler.ts` are already migrated — the grep matched their *explanatory comments*
    (`// not via client.{channels,guilds}.cache …`), not code.
  - **Why migrating now would be harmful:** `container.entityCache` has **zero readers** today; it is
    *provisioned-ahead* infra. It has **no enumerate-all method** (so the two `for…of guilds.cache`
    work-partitioning sites — captcha-expiry, tempvc-ready — cannot use it even in principle) and
    **no action methods / `.members.fetch()`** (so the ban/timeout/kick sites need a real `Guild`,
    not a `CachedGuild` projection). Routing 10 working sites through an unproven, untested read path
    buys nothing while GuildManager is still fully cached.
  - **Real prerequisite (the actual future work, not done here):** the entityCache only pays off
    once `makeCache` sets `GuildManager: 0` (+ Channel/Role) to reclaim the ~25 KB/guild the doc
    cites. *That* step is what would force the migration — and it additionally needs (a) an
    `entityCache.guildIdsForShard()` enumerate accessor for the partition sites, and (b) a documented
    "fetch a real Guild via REST for action sites" policy. Until then this is correctly deferred.
  - **Done here (premise-independent micro-fix):** `TempVcService.setOwner` no longer does
    `members.cache.get(record.ownerId)` — it already holds `record.ownerId`, so it edits the
    overwrite by raw id, gated on the channel's own (always-populated) overwrite cache. Removes one
    grep hit and fixes a latent cold-cache overwrite leak.

- [x] **P3.2 — Finish F5's lazy-load unification (`[~]`) → explicitly accepted (2026-05-30).**
  Discovery is already lazy (manifest-driven, no module code executed — the F5 win). The remaining
  gap is purely mechanical: boot convention-mounts sub-stores via `registerPath(moduleDir)` (Sapphire
  appends each store `.name`, so `commands/`, `listeners/`, … are scanned) and loads each Module
  piece manually, with a `removedPaths` prune around `super.loadAll()` so the recursive walker
  doesn't choke on non-Module files (`data.ts`, `keys.ts`) in module roots. **Decision: accept it.**
  The current path is correct and green; a "pure convention-mount" rewrite touches the most
  load-bearing boot code in the system for **zero functional gain**, and with the test suite still
  red/deferred it can't be verified not to silently break module loading. Revisit only if/when the
  module-system tests are repaired (deferred test batch).

- [x] **P3.3 — Verify generated manifests are in sync.** ✅ 2026-05-30: ran `bun run modules:manifest`
  (regenerated all 11), `git status` showed **no diff** — committed `manifest.json` == in-code `meta`.
  Discovery is reading correct metadata.

### P4 — Docs & contract sync

- [x] **P4.1 — Reconcile CLAUDE.md + skills with the new surfaces.** ✅ 2026-05-30. Unlike P3.1/P5, **every claimed surface was verified to exist in code first** (grep + read), and all checked out:
  - **CLAUDE.md** — added a **Monorepo** lead to _Layout_ (`packages/*` `@ember/{core,event-bus,observability,contracts,sharding,sdk}` + `apps/*` `@ember/{gateway,worker,scheduler,api}`; every `src/…` path is rooted at `packages/core/src/`); fixed the _Path aliases_ note (resolve within `@ember/core`; `#root/*` = `packages/core/src/*`; added the real `#lib/schedule-task.js` + `#lib/scheduler-bus.js`); added a new **Runtime roles & scale-out** subsection (`EMBER_ROLE` monolith/gateway/worker/scheduler + `getEmberRole`/`roleOwns…`; `TRANSPORT` inproc/streams/nats via `createEventBus`; `CLUSTER_NAME` coordinator; `REDIS_SENTINELS`/`SCHEDULER_LEADER_LOCK` HA; readiness probes + `runDrainSequence`; `/healthz`+`/readyz` on the metrics port, `@sapphire/plugin-api`/`HealthRoute` **confirmed gone** — 0 refs); added a `container.entityCache` bullet to _Data & cache_ flagged **not yet a read path** (carries the P3.1 finding — accessors exist, zero callers, no enumerate/action methods; don't migrate off discord.js caches yet); corrected the _Observability_ line that falsely said all "thin apps re-import `@ember/worker/main`" (only `apps/api` does; gateway is the standalone WS holder, scheduler/worker bootstrap their own `EmberClient`).
  - **`.skills/ember-sapphire-framework.md`** — dropped the **removed `plugin-api`** from the plugin list; corrected the `EmberClient` path to `packages/core/src/`.
  - **`.skills/ember-wizard.md`** — fixed two skill↔CLAUDE.md contradictions: the `@EmberModule` example used the **banned hand-authored `configFields`/`FieldType`** → now Zod-first `configSchema: cfg.object({…})`; and the verify block said **`bun test`** (Bun's runner) → `bun run test` (vitest is canonical). Also rooted the dir-tree at `packages/core/src/`. (Its data rule — `container.db` only — was already correct.)
- [x] **P4.2 — Update `TODO.md`'s bottom gates** (P0 portion). ✅ 2026-05-30. Ticked the "Cross-cutting
  gates" typecheck·lint·test box now that P0.1–P0.3 land it green (typecheck 0 / eslint 0+6 / vitest 36-of-36),
  with the canonical-runner (`bun run test` ≠ `bun test`) and `--fix` caveats inline. The other bottom gates
  stay `[ ]` **by design** — "golden-path smoke in a real guild" and "new service/transport → load + chaos
  test" depend on P1.2 (runtime smoke, needs a live token) / P2 (chaos in CI), neither landed here. Re-tick
  when P1.2 / P2.1 land.
- [x] **P4.3 — Reconcile `AGENTS.md` — it directly contradicted CLAUDE.md + the code.** ✅ **FIXED 2026-05-30** (surfaced during P4.1; user approved fixing it directly). The contradiction was **code-verified, not a style nit**: AGENTS.md §7/§Database/§module-system said "Modules access `container.prisma` and `container.redis` **directly**… **Never route module data through `DatabaseService`**" — the **exact opposite** of CLAUDE.md ("use `container.db`… never `container.prisma` from a module") and of HARDENING's own constraint list. Reality: **0** direct `container.prisma` calls in `packages/core/src/modules`, **62** `container.db`/`this.db` calls. It was also pervasively pre-monorepo-stale. **Fixes applied:** inverted the data rule in all three places (→ `container.db` is the sanctioned layer, `container.prisma` never called from a module); corrected the runtime table (`start = bun --filter @ember/worker run start`, `typecheck -p tsconfig.json`, `lint packages/*/src apps/*/src`, added `db:push`/`modules:manifest`, flagged `bun run test` ≠ `bun test`); fixed the entrypoint (`apps/worker/src/main.ts`) and all `src/…` paths (→ `packages/core/src/…`) incl. a monorepo lead; refreshed the container-augments list (added `db`, `entityCache`, `tasks`, `configChangeHooks`, `modules`).

### P5 — AI-Audit Security & Architecture Fixes

- [x] **P5.1 — Purge Hallucinated Dependencies.** ~~Remove the fake/typosquatted `sapphire-plugin-modal-commands` (~100 downloads on npm) and the hallucinated Zod version `zod@^3.25.76` from `packages/core/package.json`.~~ **DONE (partial — one claim corrected).**
  - **`sapphire-plugin-modal-commands` — removed.** Confirmed dead weight: unscoped community plugin, empty `description`, peer-dep `@sapphire/framework@^4.0.0` while this repo runs **v5** (unsatisfied peer). Imported exactly once as a pure side-effect (`packages/core/src/client/setup.ts`); **zero** `ModalCommand` pieces or `modal-commands/` store dirs exist. All modals already use **native Sapphire** `InteractionHandler` + `InteractionHandlerTypes.ModalSubmit` (`core/interaction-handlers/config-panel.ts:394`, `modules/utility/tempvc/interaction-handlers/modals.ts:24`), so removal needed **no replacement**. Dropped the import + the dependency, ran `bun install` (lockfile pruned), and physically removed the stale 15 MB `node_modules/sapphire-plugin-modal-commands/` dir — which also eliminated its **nested polluted discord.js copy** (one of the three P0.1 pollution sites). typecheck ✅, lint ✅ (0 errors).
  - **`zod@^3.25.76` — KEPT; audit claim was FALSE.** Not hallucinated: resolves in `bun.lock` with a valid registry integrity hash (`sha512-gzUt/…cQ==`) and is installed at exactly `3.25.76`; a non-existent version cannot produce a real tarball+hash. zod is also core to the project ("Zod-first" config per CLAUDE.md). Left untouched.
- [x] **P5.2 — Fix Channel Slicing Bug. DONE.** Replaced `.slice(0, 100)` (UTF-16 code units) with `[...rawName].slice(0, 100).join("")` — spread iterates *code points*, so a multi-byte emoji at the 100-char boundary can no longer be cut into a lone surrogate (which Discord rejects as an invalid-form-body validation error). `TempVcService.ts:82`.
- [x] **P5.3 — Patch Gateway Resilience. DONE.** Added an `everReady` latch in `publishReady()`: every shard is still required for the *initial* cluster-ready, but afterwards `clusterReady = everReady && shardReady.size > 0` — a single shard's transient Closed→Resumed no longer republishes `ready=false`, so it can't pause raw-event consumption fleet-wide. Total outage (0 shards) or process death (heartbeat TTL lapse) still un-readies the cluster; the local `/readyz` probe keeps real-time shard state. `apps/gateway/src/main.ts:388`.
- [~] **P5.4 — Secure NATS DLQ & Fix Workers. PARTIAL — one claim corrected.**
  - **`void stream;` — removed.** The `stream` param of `deliver<T>()` was vestigial (only `void stream;` referenced it). Dropped the param + its call-site arg + the consume-loop destructure; the `stream` *field* on `consumers` stays (still read by `runStats`). `NatsJetStreamBus.ts`.
  - **`tryDecodeRaw` — KEPT; the "redundant" claim was FALSE.** `sendToDlq` has **two** callers: the poison-message path (`deliveryCount > maxDeliveries`, line 197) where the envelope is **valid JSON**, and the malformed-envelope path (line 218) where `decode` already threw. Both `tryDecodeRaw` branches are therefore genuinely exercised — `decode()` preserves structure for poison messages, the raw-string fallback handles malformed ones. Removing it would crash the malformed path (or lose structure on the poison path). Left intact.
  - **aho-corasick `as Payload` — fixed.** Replaced the blind `payload as Payload` with a Zod `discriminatedUnion("kind", …).parse(payload)` (project is Zod-first), validating shape at the worker boundary (non-array `terms` / missing `text` rejected cleanly) instead of trusting unknown cross-thread input. `filter/workers/aho-corasick.ts`.
- [x] **P5.5 — Fix the Phantom Control Panel. DONE.** `createVc` now checks the move result — `const moved = await member.voice.setChannel(vc).then(() => true).catch(() => false);` — and on failure (member left voice) `vc.delete(...)`s and returns early, *before* writing the record, scheduling the reorder, or sending the panel. No orphaned channel + control panel left for the empty-VC reaper. `TempVcService.ts:97`.
- [x] **P5.6 — Remove Hardcoded AI Bloat. DONE (design note).** Stripped the hardcoded `getVcType` Duo/Trio/Squad name-regex + `typeOrder` map from `reorderChannels`. Managed VCs now group by the record's `generatorId` (structured data we already store), ordered by that generator's admin-controlled channel position, then by spawn `number`. No config schema needed — the admin's generator ordering *is* the configuration. **Behavior change:** the sort key is now generator-grouping, not name-keyword tiers; revisit if explicit per-tag config is later wanted. `TempVcService.ts`.

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
