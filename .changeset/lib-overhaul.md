---
"@lumi/core": minor
"@lumi/application": patch
"@lumi/infrastructure": patch
---

Overhaul `packages/core/src/lib`: split `addon-sandbox/` into `host/` + `isolate/` + `sdk/`, delete `branding/`, dissolve `moderation/`, regroup flat root files. No backward-compat shims — all importers updated.

- `addon-sandbox/`: `host/` (`addon-host.ts` renamed from `AddonHost.ts`, `host-methods.ts`, `capabilities.ts`, `sandbox-root.ts`, `addon-files.ts`), `isolate/` (`dispatch.ts`, `isolate-build.ts`, `event-relay.ts`, `interaction-router.ts`, `proxy-command.ts`, `proxy-module.ts`, `relay-task.ts`, `ndjson.ts`, `test-harness.ts`), `sdk/` unchanged plus colocated `sdk.test.ts`. Comment density already low from prior passes; nothing left to strip.
- `branding/` deleted: palette + overrides live in `lib/ui/palette.ts`, emoji map in `lib/ui/emoji.ts` (both dependency-free so the isolate bundle can still bake operator overrides at build time); `utilities/config.ts` keeps the single `resolveCardColor` path wired to `config/bot.ts`.
- `moderation/` dissolved: `ModerationCommand.ts` → `lib/commands/moderation-flow.ts`, `lockdown.ts` → `lib/discord/channel-locks.ts`, `multi-target.ts` → `lib/discord/mass-targets.ts`, `log.ts` → `lib/discord/mod-log.ts` (framework helpers shared across mod/security/filter); `QuarantineAction.ts` → `application/services/mod/actions/QuarantineAction.ts` and `immune-roles.ts` → `application/services/mod/immune-roles.ts` (mod-domain logic, also exported from the mod service barrel).
- `SecurityRepository.getPanicState` is now `getOrSet`-cached (new `ValkeyTTL.panicState = 60`), invalidated in `save/clearPanicState`: it runs on every mod command (`checkPanicLock`) and every channel/role-delete audit entry, mirroring the `isVoiceMuted` precedent.
- Flat root regrouped: `message-content.ts` → `utilities/`, `guild-transaction.ts` → `prisma/`, `gdpr.ts` → `gdpr/requests.ts`, `gdpr-export-token.ts` → `gdpr/export-token.ts`. `restart.ts`, `services.ts`, `env.ts` stay (no cluster); single-file `cluster/`/`sharding/`/`telemetry/`/`retention/` dirs left alone.
- Import vocabulary renamed: `#lib/*.js` → `@lumi/lib/*.js`, `#modules/*.js` → `@lumi/modules/*.js` (tsconfig paths + Bun runtime, `.js` suffixes kept). The `imports` maps are deleted from `@lumi/core`/`@lumi/application`; no backward-compat shims.
