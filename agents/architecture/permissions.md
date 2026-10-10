# Permissions: authentication vs authorization

Grounded in `packages/core/src/lib/permissions/` and `packages/core/src/lib/rpc/implement.ts`.
For the permit-node vocabulary itself (node names, wildcards, autocomplete), see
[`agents/domains/permissions.md`](../domains/permissions.md) — this doc is about the split
between "who is this" and "what may they do", not the node list.

## The split

**Authentication** ("who is this actor") stays where it always was, close to the transport
that establishes identity - it never moves into the permissions layer:

- **RPC** (`apps/api`): the transport already authenticated the caller with
  `RPC_INTERNAL_TOKEN` before a request reaches `dispatchRpc`; `req.actorId` is then an
  *unsigned claim* the dashboard attaches, trusted only because the transport already checked
  the token (`packages/core/src/lib/rpc/implement.ts:92-93`).
- **Commands**: the Discord gateway/interaction already tells you `interaction.user`/
  `message.author` - that identity isn't re-derived, just read off the event.
- **Addon SDK**: the host binds an addon's RPC call to the real `CommandContext` of the
  interaction that triggered it (`host-methods.ts`'s `requireCtx(scope)`); the addon never
  supplies its own identity.

**Authorization** ("may this actor do X") is answered in exactly one place:
`packages/core/src/lib/permissions/authorize.ts`. Its `authorize(actor, requirement)`:

```ts
export interface Actor {
  userId: string;
  guildId?: string;
  guildOwnerId?: string | null;
  roleIds?: readonly string[];
  channelId?: string;
  memberPermissions?: PermissionsBitField | bigint | null;
}

export type AuthorizationRequirement =
  | { kind: "permit"; node: string }
  | { kind: "botOwner" }
  | { kind: "guildOwner" }
  | { kind: "guildManager" };
```

`authorize()` itself never authenticates anything - it takes an already-identified `actor` and
delegates the actual decision to `PermitResolver` (permit nodes, bot-owner, guild-owner) or to
a plain Discord permission-bitfield check (guild-manager). It's a thin dispatcher over logic
that already lived in one place (`PermitResolver`); what it adds is a single call shape every
consumer goes through, instead of each reaching into `PermitResolver`'s statics directly.

## Consumers

| Consumer | Where | What it asks |
| :--- | :--- | :--- |
| Sapphire preconditions | `permissions/preconditions/{BotOwner,GuildOwner,MaintenanceMode}.ts`, `PermitPrecondition.ts` (backs `Administrator`/`Moderator`/`RequirePermit`) | `botOwner`, `guildOwner`, `permit` |
| Autocomplete gate | `commands.ts`'s `guardAutocompleteRun` - Sapphire skips preconditions for `autocompleteRun`, so this mirrors the same checks directly | `botOwner`, `permit` |
| Interaction-handler permit check | `permissions/index.ts`'s `hasRequiredPermit` - interaction handlers never run through `RequirePermitPrecondition` | `permit` |
| RPC authorizers | `rpc/implement.ts` (`botOwner`), `rpc/system-rpc.ts`, `rpc/account-rpc.ts` | `botOwner` |
| RPC guild-manager gate | `rpc/discord-rest-lookup.ts`'s `checkGuildManagerRest` - computes a `PermissionsBitField` from a REST guild+member fetch (no gateway cache in `apps/api`), then asks `authorize()` whether it counts as a manager | `guildManager` |
| Setup wizard | `modules/core/services/setup-wizard.ts`'s `hasSetupAccess` - reads the interaction's own `memberPermissions` (already computed by Discord/discord.js) rather than re-fetching anything | `guildManager` |
| Addon SDK | `CommandContext.checkPermit` (`command-context.ts`) → `container.permitResolver.assertPermit` directly - already a single call site, so it isn't routed through `authorize()`; see below. | `permit` |

The `guildManager` case is the one place two independent implementations of the *same*
decision existed before this: the RPC path computed a permission bitfield from REST data and
checked `ManageGuild || Administrator` inline, while the setup wizard read
`interaction.memberPermissions` and checked only `ManageGuild` (relying on discord.js's
`.has()` implicitly treating Administrator as a wildcard). Both now ask `authorize()` the same
`{ kind: "guildManager" }` question over whatever `PermissionsBitField` they have on hand -
the environment still decides *how* to obtain that bitfield (REST fetch vs. reading an
already-resolved interaction field), but not what counts as "manager".

## What stayed put, and why

`CommandContext.checkPermit` was deliberately **not** rewritten to call `authorize()`. It
already funnels through one place (`container.permitResolver.assertPermit`), so wrapping it
would only add a layer of indirection with no duplication removed - the addon SDK reaches this
exact same method (`host-methods.ts`'s `"ctx.checkPermit"` → `requireCtx(scope).checkPermit`),
so commands and the addon SDK already share one evaluator for permit checks without needing to
change this file.

## Enforcement

`eslint.config.mjs` forbids importing `@lumi/lib/permissions/permit-resolver.js` from
`permissions/preconditions/**`, `rpc/**`, or `addon-sandbox/**` - those three ask `authorize()`
instead. `packages/core/tests/architecture/import-graph.test.ts` carries the same rule as an
ESLint-independent check (it walks the parsed import graph rather than relying on ESLint's own
resolver), so the boundary holds even if a future refactor moves a file's directory without
re-running lint.
