# @lumi/core

## 3.0.0

### Major Changes

- 70337e8: Remove the split gateway/worker topology; the worker now owns its own Discord
  Gateway connection.

  `apps/gateway` relayed raw Discord dispatch packets to workers over Redis
  Streams, and the worker replayed them into discord.js's internal
  `client.ws.handlePacket()`. That method assumes single-process invariants, which
  the relay could not satisfy: interaction pre-acknowledgement state was lost,
  `client.application` was unset when Sapphire registered slash commands, and two
  WebSocket sessions competed for one bot token.

  **Breaking changes:**

  - `apps/gateway` is deleted. Remove any `LUMI_ROLE=gateway` process from your
    deployment; the worker replaces it entirely.
  - `LUMI_ROLE` accepts only `worker` (default) and `scheduler`. The `monolith`
    and `gateway` roles are gone - `monolith` is now simply `worker`.
  - `RawGatewayPublisher`, `RawGatewayConsumer`, and the `RawGatewayEnvelope` /
    `rawGatewayStream` contracts are removed from `@lumi/event-bus` and
    `@lumi/contracts`.
  - `INTERACTION_DEFER_AT_GATEWAY` is removed; interactions are always deferred
    in-process.
  - Kubernetes: `gateway-statefulset.yaml` and `worker-scaledobject.yaml` are
    removed, and the worker deployment becomes a StatefulSet - it now holds real
    per-shard state, so replica count is a shard-assignment decision rather than a
    queue-lag autoscaler target.

  `@lumi/sharding` is now wired into the worker: with `CLUSTER_NAME` set, replicas
  divide the shard count from `GET /gateway/bot` between themselves, throttle
  IDENTIFY through Redis, and resume persisted sessions across restarts. Command
  registration against Discord's REST routes is gated behind a Redis leader lock
  so only one replica performs it per boot. Multi-replica deployments should set
  `DISCORD_PROXY_URL` to a shared `nirn-proxy` so REST rate-limit buckets stay
  coordinated. The task queue, scheduler RPC, and dashboard RabbitMQ RPC paths are
  unchanged.

### Minor Changes

- 342061d: Add a public addon SDK (`"lumi"`, `"lumi/commands"`, `"lumi/permissions"`, `"lumi/scheduling"`, `"lumi/ui"`, `"lumi/utils"`), modeled on Red-DiscordBot's `redbot.core`/`redbot.core.commands` namespacing, as a real Node/Bun package self-reference against the repo root. Third-party addon code should import from these instead of reaching into `#core/*`, `#lib/*`, `#utilities/*`, or `#database/*` directly - the Downloader's addon linter (`validateAddon`) now warns when it sees a direct internal-path import. Fixes a latent bug where addons declaring `requirements` in `info.json` got a synthetic local `package.json` that silently broke all internal-path resolution, `"lumi"` included, by creating a closer package boundary than the root.

  Also adds a one-time confirmation prompt before `,repo add` clones a third-party repository (warns that addon code runs inside the bot process with full container access), and `,module pin <name>` / `,module unpin <name>` (mirroring Red's `[p]cog pin`/`unpin`) to freeze an installed addon's version against `,module update`.

- 70337e8: Protect the event loop from guild-controlled work. Filter regex now runs in a `node:worker_threads` worker (`lib/regex-worker/`) with a hard per-evaluation timeout, restart-on-hang, and automatic disabling of the offending pattern; patterns are probed against adversarial inputs when saved, so catastrophic backtracking is rejected at config time rather than discovered on the message path. Fire-and-forget sends (mod-log entries, security alerts, logging cards) move onto the BullMQ `send-message` task with one in-flight send per channel, so a Discord outage or a rate-limited log channel delays them instead of losing them or blocking a handler; interaction replies stay inline. Adds `lumi_event_loop_delay_seconds` (p50/p99/max) and a `container.configValueValidators` hook for pre-write config validation.
- c1c11a6: Heat-based escalation for the `filter` module. Each member accrues a decaying
  "heat" score from spam signals (per message, per mention, repeated messages, and
  hard filter hits); as heat crosses configurable thresholds the member is warned,
  timed out, then quarantined. Heat decays linearly on read via a self-expiring
  Redis key (no cron), and per-guild heat config is cached in memory alongside the
  compiled rules so the hot message path adds no extra config reads.
- adfe8ac: `/purge` gains Red-DiscordBot-style filtered cleanup subcommands alongside
  the existing plain `messages` variant: `user` (a specific member's
  messages), `bots`, `links` (messages containing a URL), `regex` (custom
  pattern), and `duration` (messages newer than a given age, e.g. `10m`/`2h`).
  Each supports an optional `amount` cap (default 100) and reuses the existing
  rate-limit-aware bulk/individual delete machinery and >50-message
  confirmation prompt. `/purge` now also has full slash-command support
  (previously prefix-only).
- 4b2b884: New `security` module with a Wick-style anti-nuke detector: watches audit-log entries for mass bans, kicks, channel/role deletions, and webhook creation, counts per-executor actions in a sliding Redis window, and responds with automatic quarantine, ban, or a logged alert (guild owner, the bot, and configured trusted roles are exempt). Quarantine and mod-log helpers move to `#lib/moderation` for cross-module reuse. The worker ships the GuildModeration, GuildInvites, and GuildWebhooks intents so audit-log, ban, role, webhook, and invite dispatches reach the module.
- b98e33f: Adds `/panic` (admin-only server lockdown: pauses invites, mutes `@everyone`
  in text channels with a one-button Revert) and `/permit` (grant/revoke/list
  custom and enforced permit nodes on roles or members). The hub panel's
  Permissions tab now grants permits through a role/user picker followed by a
  node picker instead of the old free-text "Allow/Deny a Command" modal, which
  wrote grants in a scheme (`chatInputCommandPath`) that the actual permit
  precondition never checked — that dead code path
  (`PermissionOverridesPrecondition`) and its unused `PermissionService`
  methods are removed.
- 1503ca0: Join-gate raid detection and member verification for the `security` module. New members can be screened by account age and join-burst rate (kick, timeout, or quarantine during a raid), and an emoji-sequence captcha replaces DM-based verification: admins post a persistent Components V2 panel with `/verifypanel`, and clicking Verify runs the challenge entirely in an ephemeral, in-place interaction (no reliance on open DMs). Passing grants the verified role and strips the pending role; a periodic sweep evicts members who never verify when kick-on-timeout is enabled. Panel and panic state persist through a new `SecurityRepository` (proper Prisma models) rather than the generic module KV store.
- 27d4684: Group config fields into navigable subsections in the `/lumi` config panel.
  Modules with many settings (security, filter, logging) no longer render as a
  flat, multi-page scroll of every field; a `group` on each config field collects
  related settings into a section, and the detail view shows one section at a time
  with a "jump to section" select. Small modules are unchanged. Large ungrouped
  modules fall back to automatic paging so the component budget is never exceeded.
- 0d30456: Reimagined control panels on the Components V2 kit: `/lumi panel` gains a persistent five-tab bar, guild-icon thumbnail header, section rows with inline action buttons (permit revoke, addon browse/install/uninstall, prefix edit), and paginated permission lists. The module config panel now renders every field as a section row with an inline toggle/edit button and per-field edit subpanels, structurally eliminating the five-action-row overflow that silently dropped select menus. Adds a typed i18n key system (Skyra-style `T`/`FT` keys with compile-checked interpolation args), a new `panels` translation namespace localizing the entire admin surface, tempvc subview localization, and a 5s cache for ping panel data.
- 2aa3396: Migrate the `tempvc` module off the generic `ModuleData` KV store onto dedicated
  Prisma tables (`TempVcGenerator`, `TempVcRecord`) via a new `TempVcRepository`.
  Built-in modules now own real tables end to end; the KV store is reserved for
  third-party addons. The module's in-memory registry and InvalidationBus behaviour
  are unchanged. Note: existing tempvc generators stored under the old KV rows are
  not auto-migrated (temp channels are ephemeral); re-create generators after deploy.

### Patch Changes

- 496bd98: Removes dead code left behind by the panel-kit rebuild: unused `*Row` select-menu
  wrapper functions in `#utilities/panels.js` (`createUserSelectMenuRow`,
  `createRoleSelectMenuRow`, `createChannelSelectMenuRow`,
  `createMentionableSelectMenuRow`, `createStringSelectMenuRow`,
  `createMultiSelectMenuRow`), and unused layout helpers (`metric`,
  `metricsBlock`, `statBlock`, `createSection`, `smallSeparator`, `SB`) along
  with their now-unreferenced `Field`/`StatItem` types. No behavior changes -
  none of these had any callers.
- ee531ab: docs: update AGENTS.md with 3-step changeset release pipeline and GitHub Action bot automation capabilities.
- 455d5f8: Bug-fix batch: quarantine cases now record `quarantine`/`unquarantine` actions (fixing the dead rejoin re-enforcement DB fallback) and lift stale cases on apply/undo; repository `getOrSet` gains single-flight dedup and no longer caches `undefined`; GUILD_CREATE entity-cache writes are pipelined instead of sequential; RabbitMQ `publishEvent` catches and logs publish failures centrally; empty catch blocks now log at debug; the unused `TRANSPORT` env var and dead `RestrictAction`/`BaseAction` scaffolding are removed; the `INTERACTION_DEFER_AT_GATEWAY` env var is removed (interactions are deferred in-process).
- 5d96c1b: Bug-fix batch from an architecture review: symlink install no longer crashes on a dangling target; `ping`/`telemetryStats` clean up their intervals and REST listeners on unload; `InvalidationBus` now does a full resync when its Redis subscriber reconnects after a dropped connection, and `ModuleStore`/`TempVcRegistry` consume it; cache invalidation gets a delayed double-delete to close the stale-write race; sharding's `reconcileAssignment` re-reads the assignment after acquiring the leader lock to close a split-brain window; `ClusterReadyTracker` is now per-replica instead of a single global key; `RedisSessionStore.flush()` restores unflushed entries on a failed pipeline instead of losing them; `RedisIdentifyThrottler` no longer sleeps 250ms when a bucket lock is already free; dashboard RPC mutation handlers re-validate the actor's live Discord permissions instead of trusting the (up to 8h stale) session; the RabbitMQ RPC bridge nacks malformed messages and always replies on handler failure instead of leaving the dashboard caller to time out, and the dashboard RPC client no longer leaks its timer/listener on a synchronous send failure; `RedisStreamsBus` still acks a poison message if publishing it to the DLQ fails, instead of retrying it forever; `GuildWriteTransaction`'s `Symbol.dispose` logs release failures instead of swallowing them; `SecurityService`'s anti-nuke/raid rate limiters increment and set their TTL atomically, and `grantVerified` swaps roles in one call instead of leaving a member stuck with both roles if the second call fails.
- 69b8295: Add cutText truncation and max item limits to makeListCard in cards.ts to prevent Discord message payload length rejections.
- c12e5f6: Unified Components V2 panel kit: new `settingRow`/`thumbRow`/`tabRow`/`confirmRow`/`backRow` builders and an `updatePanel` re-render helper. Removes the dead, unwired session navigation framework (NavigationSession, menu/forms pages, session pagination). Cards now render real body content beside thumbnails instead of a placeholder, and the accent-color guard no longer relies on falsy zero.
- 70337e8: Readability pass over the core package: no behaviour change.

  Moderation commands now share a `ModerationCommand` / `ModerationSubcommand`
  base in `lib/moderation/`, which owns the defer → translate → resolve target →
  act → reply pipeline that eight commands each hand-rolled. Commands declare
  `resolveTarget`, `action` and `buildSuccessMessage`; the optional `preHandle`
  hook exists because `CommandContext` binds positional prefix arguments in
  getter-call order, so options sitting between target and reason (`timeout`'s
  duration, `ban add`'s `delete_days`) need a slot in the fixed call order.

  `BaseCommand` and `BaseSubcommand` no longer carry duplicate
  `reply*`/`checkPermit` wrappers - nothing called them. Command builder defaults
  are applied through a prototype-inheriting registry view rather than by
  temporarily overwriting `registerChatInputCommand` and restoring it in a
  `finally`, so the shared registry is never mutated.

  Oversized files are split along existing conventions: `lib/i18n/keys.ts` becomes
  a barrel over per-domain files under `i18n/keys/`; `LumiClient` composes
  `ReadinessProbes` and `CommandRegistrationLeaderElection` instead of
  implementing them; the hub and config panels move their view builders into
  `modules/core/ui/`; and every module now follows one-Piece-per-file for
  interaction handlers.

  `DownloaderService.syncApplicationCommands` reads an undocumented private field
  of Sapphire's `ApplicationCommandRegistry` to re-sync slash commands after a
  live addon install. That is now documented and guarded - if the field
  disappears in a future `@sapphire/framework`, the sync is skipped with a warning
  rather than throwing.

- Updated dependencies [70337e8]
- Updated dependencies [4b2b884]
- Updated dependencies [5d96c1b]
- Updated dependencies [a453146]
- Updated dependencies [27d4684]
- Updated dependencies [70337e8]
  - @lumi/observability@3.0.0
  - @lumi/event-bus@3.0.0
  - @lumi/sharding@3.0.0
  - @lumi/contracts@3.0.0

## 1.0.1

### Patch Changes

- 40741cc: Add project hygiene, Changesets release automation, pre-commit hooks, and documentation fact-checking across workspace packages.
- Updated dependencies [40741cc]
  - @lumi/event-bus@1.0.1
  - @lumi/sharding@1.0.1
  - @lumi/observability@1.0.1
  - @lumi/contracts@1.0.1
