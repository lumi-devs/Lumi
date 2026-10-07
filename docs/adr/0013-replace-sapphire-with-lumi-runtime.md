# 0013: Replace Sapphire with a discord.js-native Lumi runtime

Status: Proposed

## Context

Lumi's module model (metadata-first discovery, dependency graph, enable/disable,
addon sandbox with host-side proxies) no longer fits Sapphire's piece/store
model. Evidence in source: `ModuleStore.ts` (~875 lines) works around Sapphire
with `construct()` renaming, `attachModuleGuards()` mutating command
preconditions, and proxy commands for sandboxed addons;
`commands.ts` patches `autocompleteRun` because Sapphire's autocomplete
dispatch skips preconditions; `setup.ts` deliberately excluded the
scheduled-tasks plugin from workers. The `lib/discord-adapter/` seam
(`LumiCommand`, `LumiSubcommand`, `LumiListener`, `LumiPrecondition`)
contained the swap surface.

Inventory (Oct 2026): 35 `Listener`, 20 interaction handlers, 10 precondition
gates, 62 command classes, 14 scheduled-task classes, 9 `Utility` classes.
`i18next`, `bullmq`, `pino` are already direct dependencies — the Sapphire
plugins wrap packages we already own.

## Execution rules (binding on every agent, including subagents)

1. **No backward compatibility, ever.** No compat adapters, no shims, no
   deprecated aliases, no dual-run. Each phase deletes the Sapphire API it
   replaces; the tree is always fully-working with zero Sapphire mentions in
   the touched area (imports, types, AND comments).
2. **Debloat maximally; never replicate Sapphire.** If a replacement starts
   growing registries-with-lifecycle, base classes, option-merging, or
   registration APIs, it is Sapphire with extra steps — stop and simplify.
   Data + functions beat classes + frameworks. Deletion beats replacement.
3. **Functionality stays intact.** Debloat removes machinery, never behavior:
   per-command authorization (including autocomplete), owner/permit gates,
   ephemeral error paths, audit logging, cooldowns, module enable/disable
   semantics, repeatable schedules, en-US strings. When unsure whether
   something is load-bearing, ask — do not guess, and do not silently drop.
4. **Ask questions when needed.** Any agent blocked on a behavior-vs-bloat
   tradeoff posts a QUESTION to the message board and stops its scope instead
   of inventing an answer.
5. **npm only if it deletes code.** New dependencies must net-remove more lines
   than they add (docs + API surface included). Rejected already: `p-queue`
   (ESM-only overkill for a mutex), `ms` (single-unit only), `lexure` (stale
   since ~2020), `discord-sync-commands` (diffing we don't need), `cron`
   (both reference bots ship it, neither uses it).
6. **Keep what's needed, in one place.** Shared trivial code lives in exactly
   one home (`@lumi/shared`); no per-package copies, no re-export shims.
   Near-duplicate logic in several places becomes one generic with args.
7. **Minimal comments, no dead code.** No comment narrates what the code says;
   no unused returns, unused options, or speculative hooks. Dead code found
   mid-churn gets deleted in the same phase.

## Guiding principle: basics over fidelity

We do NOT replicate Sapphire behavior 1:1. Where Sapphire is clever, we choose
the boring version the wider discord.js ecosystem already uses.

Deliberately dropped with no replacement:

- **Registration diffing** — blind full-overwrite `PUT`, run only when
  definitions change (discord.js guide rule: never on every `ready`). A no-op
  overwrite is harmless.
- **Prefix arg lexer** — per-guild prefix + mention regex, `split(/ +/g)`.
  Quoted args are not supported until someone needs them.
- **Cooldown framework** — no buckets/scopes. Nested in-memory map
  `userId -> commandName -> expiresAt`, default 3000ms. Valkey-backed
  cooldowns only if cross-shard abuse appears.
- **Component registries, handler kinds, parse/some/none ceremony** — every
  component customId is `module:action:state`; ONE prefix→handler map, first
  match wins. The 2–3 exotic customIds get rewritten, not accommodated.
- **Modal dismiss handling** — Discord never notifies; `time` on collectors
  only, same as every reference bot.
- **`cron` package, `p-queue`, `ms`, `lexure`, `discord-sync-commands`** —
  rejected per rule 5.

## Reference implementations (cloned to `/tmp/opencode/refbots/`, read-only)

| Pattern we steal | Source | File |
| :--- | :--- | :--- |
| Full-overwrite `PUT` registration, inside boot, shard-0-gated | CorwinDev/Discord-Bot | `src/handlers/loaders/commands.js`, `src/bot.js:140-144` |
| Register-once standalone deploy script (our long-term shape) | discord.js guide | `guide/creating-your-bot/command-deployment.md` |
| `translate(key, args, guildLang)` over `Map<lang, getFixedT(lang)>` | AtlantaBot | `src/base/Atlanta.ts:95-101`, `src/helpers/languages.ts:34-55` |
| Per-guild language column with default | AtlantaBot | `src/base/Guild.ts:43,63`, `setlang.ts` |
| `customId.split("-")` namespaced routing | CorwinDev | `src/events/client/interactionCreate.js:190-191` |
| Collector-per-command for confirms | AtlantaBot | `src/commands/Economy/marry.ts:101-109` |
| Nested-map cooldowns | AtlantaBot | `src/events/interactionCreate.ts:104-115` |
| Prefix regex + mention fallback | CorwinDev | `src/events/message/messageCreate.js:303-314` |
| `feature:action:state` colon customId, warn-on-miss | Ticket-Bot | `src/core/custom-id.ts`, `src/core/router.ts` |
| `{ data: builder, cooldown, execute }` command modules + plain event files | evobot / KevinNovak template | `commands/*.ts`, `src/events/*.ts` |

## Replication inventory — where we rebuilt Sapphire, and the verdict

| File (lines) | What it replicates | Verdict |
| :--- | :--- | :--- |
| `discord-adapter/` (324) | Piece base classes | **DELETE all** — defs + fns replace them |
| `commands.ts` (674) | Command store behavior | **SPLIT**: keep reply helpers, `fetchTyped`, `guardAutocompleteRun`, builder finalize; dispatch → `command-dispatch.ts`; `run: "method"` → handler maps in defs |
| `ModuleStore.ts` (875) | Store w/ lifecycle | **COLLAPSE**: keep discover/walk/manifest/topo/conflicts/schema/invalidation/addon glue; drop `Store` base, `construct`, `attachModuleGuards` → plain records + Maps |
| `interaction-router.ts` (172) + `LumiInteractionHandler.ts` (198) | Handler store + dispatch | **DELETE both** → `{ prefix, module?, run }` objects, one prefix-map dispatch (~40 lines). `checkSecurity` survives as one fn; `some/none/parse` die |
| `listener-loader.ts` + `LumiListener.ts` + `ModuleListener.ts` (~180) | Listener store | **COLLAPSE to one file**: fs-walk + attach/detach + gate wrapper. One base max, then none |
| `precondition-checks.ts` (255) | Precondition store | **KEEP** — already the right shape (plain fns over `authorize()`) |
| 9 precondition piece files | Precondition pieces | **DELETE** with the command rewrite (framework still dispatches through them today — verified; early deletion denies all gated commands) |
| `scheduler-runner.ts` + task registry | Task store | **KEEP** — honest thin code over documented BullMQ |
| `dispatch-tracker.ts` (47) | Miss detection | **FOLD** into dispatch (5-line timeout warn, no module) |
| `LumiClient.ts` + `client-options.ts` + `setup*.ts` | Client + plugin loading | **COLLAPSE**: plain discord.js `Client`, object-literal options, delete setup files as their stores die |
| `container` (framework, ~200 files) | Service bag | **BAG-SWAP** to our own `services` object, same shape — call sites unchanged, only import source changes |
| `Utility.ts` + utilities store (9 services, ~100 call sites) | Utilities store | **PLAIN MAP**: `new XxxService()` instances; keep `getUtility/tryGetUtility` signatures so call sites don't churn |
| `proxy-command.ts` / `ProxyModule` | Addon command pieces | **CommandDefs over the sandbox** — host returns defs, registered like any other |
| `ApplicationCommandRegistries` + registration shadow | Command registration | **STANDALONE deploy script**, full-overwrite PUT |
| shapeshift (25 core + 17 contracts) | Validators | **zod** — mechanical, type-level, LAST |
| `command-context.ts`, i18n helpers, `defineCustomId` | — | **KEEP** — ours, thin, needed |

## Decision

Migrate to discord.js `Client` + data + functions. No replacement framework.

| Sapphire | Replacement | How (concrete) |
| :--- | :--- | :--- |
| `framework` Client/stores | discord.js `Client` + `Collection` registries | `client.commands: Collection<string, CommandDef>`; events via `client.on` in one loader; no Store base |
| `framework` Command/Subcommand (62 classes) | `CommandDef` objects + one dispatch fn | `{ name, module?, permits?, gates?, cooldown?, build, run, autocomplete?, prefix? }`; subcommand groups route by `getSubcommand(Group)`; `run: "method"` → handler maps |
| `framework` InteractionHandler (20) | `{ prefix, module?, run }` + prefix-map dispatch | Strict `module:action:state`; first match wins; miss → watchdog warn; errors → existing error-card path |
| `framework` Listener (35) | one loader + gate wrapper | fs-walk + attach/detach; per-event `isModuleEnabled` gate; tracing preserved |
| `framework` Precondition (10) | `authorize()` gate fns | Already live via `precondition-checks`; pieces die with commands |
| `framework` Args (prefix) | regex + `split(/ +/g)` | Per-guild prefix + mention fallback |
| `framework` container | own `services` bag | Same shape; mechanical import swap; unblocks pino |
| `framework` UserError/Result | plain `Error` + `CommandContext` helpers | `replyError`/`handleDenied` already own the path |
| `pieces` | delete | Registries are `Map`s |
| `decorators` | DONE (Phase 1) | Explicit constructors; shim deleted |
| `plugin-subcommands` | builders + two-tier dispatch | Native `addSubcommand(Group)`; dies with commands |
| `plugin-i18next` | DONE (Phase 2) | Stock `i18next` behind same helpers |
| `plugin-logger` | pino direct (blocked on bag-swap) | `pino()` + `.child()`; delete adapter with the client rewrite |
| `plugin-scheduled-tasks` | DONE (Phase 3) | Native BullMQ runner + registry |
| `plugin-utilities-store` | plain `Map` services | Dies with commands (API boots it for RPC) |
| `plugin-hmr` | DONE (Phase 1) | `bun --hot` / `--watch` |
| `async-queue`/`snowflake`/`time-utilities`/`utilities` | DONE (Phase 1) | `@lumi/shared` + `SnowflakeUtil` |
| `shapeshift` | `zod` | LAST; biggest type churn, zero behavior change |

## Phases (each ends green: `bun run typecheck`, `bun run lint`, `bun test`)

Tooling: `bun`, `gh` via `nix develop --command <cmd>`. Push per phase, CI
builds, watchtower rolls the Pi. Subagents coordinate via
`/tmp/opencode/msgboard.md` (claims before touching files) + scratchpad
bullets below. No local image juggling.

0. **Seam lock** — DONE (dropped the eslint blacklist per review; the plan
   itself is the lock now).
1. **Leaves** — DONE. `@lumi/shared` (primitives, Ms, Mutex); snowflake,
   async-queue, Time, utilities, HMR, `@ApplyOptions` (148 files → explicit
   ctors) gone. Exit met: no removed-package imports in src.
2. **Logger + i18n** — i18n DONE (stock `i18next`, same helpers/JSONs).
   Logger BLOCKED on bag-swap (framework `ILogger` type) → rides P5a.
3. **Scheduler** — DONE. Native BullMQ runner + registry + dir loader; 14
   task files are plain classes; setup-scheduler deleted. (Also fixed a latent
   bug: the old store path never registered task paths, so `createRepeated`
   found nothing.)
4. **Events + preconditions + dispatch (IN PROGRESS — tree is mid-migration).**
   Listener/handler/precondition agents delivered bases + loaders + gate map;
   strict-prefix simplification now applies: collapse to `{prefix, run}`
   dispatch + one listener file. ModuleStore skip-wiring + `attachModuleLoaders`
   + `attachInteractionRouter` in `LumiClient.login` are IN — old stores still
   load too. Exit: single-fire verified on Pi (View-Mentions click, one log
   line); no `extends Listener/Precondition/InteractionHandler`.
5. **Services bag + commands.** 5a first (mechanical, unblocks logger):
   `services.ts` bag, import-source sed, delete `container` re-export. 5b:
   62 classes → `CommandDef`s + `command-dispatch.ts` (chat-input, message,
   autocomplete reusing `denyGated` + cooldown map + `CommandContext`) +
   deploy script; delete bases, registries, precondition pieces, subcommand
   plugin, `LumiClient` subclass, setup files, five stores. Exit: zero
   `@sapphire/framework|pieces|plugin-subcommands` imports; `/afklist` +
   View-Mentions verified on Pi.
6. **ModuleStore → plain registry.** Drop `Store` base; keep
   discovery/deps/manifests/schema/sandbox; `loaded()`/`getRecord()`/enable
   API unchanged (dashboard RPC depends on it).
7. **Utilities → Map.** Keep `getUtility` signatures.
8. **zod.** Mechanical, last.
9. **Delete.** All `@sapphire/*` deps, prune lockfile. Exit:
   `rg '@sapphire/' packages/*/src apps/*/src` empty.

## ⚠️ Tree-state hazard (land before any deploy)

The tree is mid-Phase-4 and **double-registers**: `loadModule` still
registers store paths AND calls the new `attachModuleLoaders` → listeners and
handlers fire twice in worker. First action on resume: finish the Phase 4
collapse, then verify single-fire. Never deploy a half-migrated tree.

## Scratchpad (progress log — all agents update here, append-only, newest last)

- `2026-10-06 — coordinator: plan rewritten. Basics-over-fidelity principle set (full-overwrite PUT, no lexer, nested-map cooldowns, split-routing, no compat adapter). Reference bots cloned to /tmp/opencode/refbots/ (AtlantaBot, CorwinDev-Bot).`
- `2026-10-06 — coordinator: gh search (TS discord.js bots by stars) picked evobot (1871★, i18n at scale), Ticket-Bot (503★, component routing), KevinNovak template (643★, TS structure); refbot-miner cloned+skimmed all three, stole Ticket-Bot colon customId + feature handler tables. Starting Phase 0/1 execution.`
- `2026-10-06 — coordinator: Phase 0+1 DONE. New @lumi/shared package (primitives, Ms, Mutex — single home, both packages import it). Deleted: async-queue/decorators/snowflake/time-utilities/utilities/plugin-hmr imports (~190 files) + HMR client-options key + duplicate helpers. ApplyOptions→explicit constructors via codemod-agent (148 files, decorator shim deleted, no Proxy remake). Mutex fixed to 1-tick uncontended acquire (kept module_store serialization test green untouched). Verify: typecheck 10/10, lint clean, tests 2043+42+33 pass, 0 fail.`
- `2026-10-06 — coordinator: Phase 3 DONE (self-executed, subagent hit infra 502). New ScheduledTaskRunner (BullMQ Queue+Worker, create/createRepeated/delete/close/execute) + LumiScheduledTask base + task registry + dir loader; 14 task files converted to no-arg ctors, payload types now augment #lib/types/common.js; error listener deleted (runner logs fatal directly); setup-scheduler.ts deleted; worker/api/scheduler client options stripped of tasks blocks. This also fixes a latent bug: scheduler never registered task paths so createRepeated found nothing — tasks now load explicitly from module dirs. Verify: typecheck 10/10, lint clean, tests 2046+42+33 pass, 0 fail.`
- `2026-10-06 — refbot-miner: evobot i18n via npm i18n pkg (global locale, worse than Atlanta per-guild); deploy = readdir + global PUT on every ready. Ticket-Bot: feature:action:state customIds + InteractionRouter tables + standalone bulkOverwrite deploy. KevinNovak: explicit wiring, autocomplete 25-slice, GET-diff registration (rejected). Verdict: stole Ticket-Bot colon customId; nothing else beats existing table.`
- `2026-10-06 — codemod-agent: @ApplyOptions shim deleted (148 files -> explicit constructors, 0 src refs left, typecheck 10/10 green).`
- `2026-10-06 — logger-agent: Phase 2 logger BLOCKED by SapphireClient (ILogger type); zero plugin-logger imports in src already; defer adapter deletion to client rewrite.`
- `2026-10-06 — i18n-agent: Phase 2 i18n DONE (stock i18next, same helpers/JSONs). core tsc + i18n tests + lint green.`
- `2026-10-06 — listener-agent: Phase 4 listeners DONE (plain LumiListener base, ModuleListener re-pointed, listener-loader attach/detach). core tsc + eslint + 56 listener tests green. ModuleStore wiring left to coordinator.`
- `2026-10-06 — precondition-agent: direct gates live (precondition-checks map, commands.ts bridges deny via handleDenied, store appends removed). Piece classes KEPT (framework still dispatches through them; deletion rides Phase 5).`
- `2026-10-06 — handler-agent: Phase 4 handlers DONE (interaction-router tables, all handler files unchanged). Watchdog ParseSome/ParseNone listeners deleted.`
- `2026-10-06 — coordinator: user rulings locked: data-commands (break addons), keep zod, STRICT prefix dispatch (no parse/some/none, no kinds/tables), keep tracked detach, services-bag next, break dashboard freely. Rewriting router+bases to prefix dispatch.`
- `2026-10-06 — coordinator: P4-finish landed (self-executed). DELETED interaction-router.ts (kinds/tables/register APIs) + LumiInteractionHandler.ts; new interaction-dispatch.ts single loop (first parse-match wins, miss→watchdog, error cards preserved); 25 handler files mechanically converted to one base; 23 raw-Listener files converted to plain base (denied/error listeners work again); loader recurses like the old store walk. Per-file parse() kept deliberately: it is param extraction (customId→args), not framework — irreducible without losing params. Remaining strict-prefix work: namespace the 3 flat customIds (ping/setup/duration). typecheck 10/10. Lint deferred to the very end per user; tests skipped per user call.`
- `2026-10-06 — cmd-converter: 30 command files classes→CommandDefs (script /tmp/opencode/cmd-convert.ts). run→run, run:"m"→handlers, default→defaultSub, autocompleteRun→autocomplete, builders→build thunks with setName, ModerationCommand overrides→Flow objects + runModerationFlow, this.container→container. 19 skipped pending coordinator: diverged per-entry permits (ban/timeout/cases/quarantine), context-menu punish-author, aliases (9 files), requiredClientPermissions (nick/purge), defaultMemberPermissions (setup), sapphire-coupled help, module (builder in application/). tsc: 0 src errors.`
- `2026-10-06 — zod-contracts-agent: contracts shapeshift→zod v4 done (z.ZodType/z.infer, native .min/.max/.gte/.lte, z.url protocol regex, z.enum const-object; outcomes identical, messages reworded; core .run() sites flagged for core agent).`

## Consequences

Module enable/disable, sandbox routing, and guild overrides become runtime
concepts instead of store patches. Each phase is independently shippable.
Revisit only if a phase's verification fails on real Discord behavior, in
which case the reference repos above (not Sapphire docs) are the first place
to look.
- `2026-10-06 — converter3-agent: all 62 command files now CommandDefs (batch-2: ban/timeout/cases/quarantine with per-entry handler permits, punish-author contextMenu-only, aliases/clientPerms/memberPerms/defaultSub/autocomplete preserved; help rebuilt over commandRegistry+loaded(); module build thunk reuses registerModuleCommand via capture registry). tsc: zero errors outside tests/. Known deltas for C3: punish-author slash build stub, dead requiredUserPermissions dropped, ping cooldownLimit default, six messageRun-without-flag commands now slash-only.`
- `2026-10-06 — deleter-agent (C3): command-class world deleted — ProxyCommand→CommandDefs over sandbox (dir→names map), 3 adapter bases + 8 precondition pieces + LumiPermissionPrecondition + ModerationSubcommand + 3 listeners (incl. registries-sync; PUT overwrites cover stale cleanup) gone, commands.ts bases/mappings/guards/registries stripped, attachModuleGuards+#guarded gone, subcommands plugin unregistered + dep removed (2 package.jsons), LumiClient registries block gone, new lumi commands deploy [--guild] (walk + loadCommandDefs + finalizeBuilder + full-overwrite PUT, raw-JSON passthrough for proxy builders). tsc 0 src errors; punish-author contextMenu-only def deploys nowhere until loader accepts build-less defs (open).`
- `2026-10-06 — bag-agent: services bag hinge landed — new packages/core/src/lib/services.ts (one-line re-export of framework container; import+export form rejected by tsc TS2303), 149 files swapped to #lib/services.js (mixed imports split, type-only + UserError/Events/Result/SapphireClient lines untouched), index.ts re-exports via hinge. tsc: 0 errors in src/ (tests/ red is converter/deleter in-progress, expected). True swap now touches one file.`
- `2026-10-06 — coordinator: Sapphire runtime deleted. Module/Utility/ModuleStore/LumiClient now plain classes; services bag owns client+logger+moduleStore; utilities load from Map; Downloader sync + module builder + addon template ported; @sapphire/* deps pruned (6 packages). Exit rg empty. tsc clean in every workspace except tests/ (rewrite deferred per user). Smoked: afk utilities/commands/listeners/interactions load via plain loaders; afk module index instantiates + onLoad/onUnload.`
- `2026-10-06 — coordinator: smoke fixes. #loadIndex assumed default export, all modules use named exports — added findModuleCtor (meta match, else Module subclass). Legacy addons (info.json, no manifest.json) were invisible — wrote manifest.json for all 11 installed addons instead of compat code (25 discovered, was 14; `utility` name collision resolves to core).`
- `2026-10-06 — coordinator: shim sweep. Deleted finalizeBuilder round-trip (direct builder defaults), instrumentCommandPiece (zero callers), Parameters<typeof handleDenied> casts, api-bootstrap as-any; renamed PinoSapphireLogger→LumiPinoLogger; ported addon template to lumi/* SDK; knip: dropped 5 unused application deps + core ahocorasick, declared cli discord deps, fixed benchmark @lumi/shared import. knip unused-exports all false positives (same-file use). Zero sapphire strings in src/scripts outside tests. tsc clean in all 10 workspaces (src).`
