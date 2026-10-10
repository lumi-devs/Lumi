# 0011: One `authorize()` evaluator for commands, RPC and the addon SDK

Status: Accepted

## Context

"Who is this actor" (authentication) and "may this actor do X" (authorization) were already
reasonably separate in practice - the RPC transport authenticates a caller with
`RPC_INTERNAL_TOKEN` before `req.actorId` is trusted, commands read `interaction.user` straight
off the gateway event, and the addon SDK never supplies its own identity (the host binds it to
the real `CommandContext`). But the authorization side itself had no single entry point:
`PermitResolver.isBotOwner()` was imported and called directly from five separate files
(`permissions/preconditions/BotOwner.ts`, `MaintenanceMode.ts`, `commands.ts`'s
`guardAutocompleteRun`, `rpc/implement.ts`, `rpc/system-rpc.ts`, `rpc/account-rpc.ts`), and the
"is this a guild manager" question had two independently-written implementations: `rpc/
discord-rest-lookup.ts`'s `checkGuildManagerRest` computed a `PermissionsBitField` from a REST
guild+member fetch and checked `ManageGuild || Administrator` explicitly, while `modules/core/
services/setup-wizard.ts`'s `hasSetupAccess` read `interaction.memberPermissions` and checked
only `ManageGuild` (correct only because discord.js's `.has()` treats Administrator as an
implicit override by default - a fact nothing enforced staying true).

## Decision

`packages/core/src/lib/permissions/authorize.ts` exports one function,
`authorize(actor: Actor, requirement: AuthorizationRequirement): Promise<boolean>`, where
`requirement` is a closed union (`permit` / `botOwner` / `guildOwner` / `guildManager`) and
`actor` carries whatever the call site already has (`userId` plus optional `guildId`,
`guildOwnerId`, `roleIds`, `channelId`, `memberPermissions`). It delegates to
`PermitResolver`'s existing static methods for `botOwner`/`guildOwner`/`permit`, and owns the
`ManageGuild`-or-`Administrator` bitfield check for `guildManager` - the one piece of decision
logic that was genuinely duplicated. `PermitResolver` itself did not move; `authorize()` sits in
front of it as the one place every "what may you do" call goes through.

Every direct `PermitResolver` import outside `permissions/` itself was replaced with a call to
`authorize()`: the Sapphire preconditions, `commands.ts`'s autocomplete gate,
`permissions/index.ts`'s `hasRequiredPermit`, and the RPC authorizers in `implement.ts`/
`system-rpc.ts`/`account-rpc.ts`. `discord-rest-lookup.ts` and `setup-wizard.ts` both now ask
`authorize({ ..., memberPermissions }, { kind: "guildManager" })` instead of each writing their
own bitfield check.

`CommandContext.checkPermit` (used by commands directly and, through it, the addon SDK's
`ctx.checkPermit` via `host-methods.ts`) was deliberately left calling
`container.permitResolver.assertPermit` directly rather than being routed through `authorize()`.
It was already a single call site reused by both commands and the addon SDK, so wrapping it
would add indirection without removing any duplication - `authorize()`'s job is to be the one
place a *scattered* check gets consolidated, not a mandatory layer over every existing call.

`eslint.config.mjs` and `packages/core/tests/architecture/import-graph.test.ts` both forbid
importing `#lib/permissions/permit-resolver.js` from `permissions/preconditions/**`, `rpc/**`, or
`addon-sandbox/**` - those three surfaces must go through `authorize()`.

## Consequences

The `ManageGuild`/`Administrator` guild-manager rule now has exactly one implementation, so a
future change to what counts as "can manage this guild" (e.g. adding a custom permit override)
changes in one function instead of needing to be found and updated in two REST- and
gateway-flavored copies. The ESLint/architecture-test pair makes the boundary self-enforcing:
a new RPC handler or precondition that reaches for `PermitResolver` directly fails lint instead
of silently reintroducing the scatter this ADR fixes. The cost is one more file to look at when
tracing an authorization decision (`authorize.ts` before `PermitResolver.ts`), which the
call-site table in
[`agents/architecture/permissions.md`](../../agents/architecture/permissions.md) exists to make
cheap.
