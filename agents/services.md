# Services and dependency injection

Lumi has two service contracts. Keep them separate; do not merge them, alias
them, or add compatibility re-exports.

## The two contracts

| Contract         | Lives in                           | Audience                       | Shape                                              |
| ---------------- | ---------------------------------- | ------------------------------ | -------------------------------------------------- |
| `BotServices`    | `src/core/contracts.ts`            | built-in code under `src/`     | wide: every long-lived dependency the process owns |
| `ModuleServices` | `packages/module-kit/src/types.ts` | first-party modules and addons | narrow: the public API modules are allowed to use  |

`BotServices` intentionally has fields that modules must never see:
`redis`, `prisma`, `moduleLoader`, `moduleManager`, `addons`, `configService`.

`ModuleServices` is the boundary. It exposes `client`, `permits`, `config`
(a `ModuleConfigAccess`, not the internal `ConfigService`), `moduleConfig`, `ui`,
`scheduler`, `observability`, `modules`, `helpers`, `discord`, and an optional
`moduleName` when the host is running code on behalf of a module.

## The single projection

`servicesForModule()` in `src/core/modules.ts` is the **only** place that turns
`BotServices` into `ModuleServices`:

```ts
const view: ModuleServices = {
  client: services.client,
  permits: services.permits,
  config: services.configService,
  moduleConfig: services.moduleConfig,
  ui: services.ui,
  scheduler: services.scheduler,
  observability: services.observability,
  modules: services.modules,
  helpers: services.helpers,
  discord: services.discord,
};
return moduleName == null ? view : { ...view, moduleName };
```

Rules:

- Never pass `BotServices` directly to a module's `execute`, `autocomplete`,
  listener, or `onLoad` hook. Project first. Built-in commands are the exception;
  they are typed to receive `BotServices` (see below).
- Never introduce a second projection or a `{ ...services }` spread that leaks
  `prisma`/`redis`.
- A module that needs something new gets it added to `ModuleServices`, the
  projection, and this doc in the same change. Do not hand a module the wide bag.

## Command services

`CommandDefinition<S = ModuleServices>` is generic over the bag its `execute` and
`autocomplete` receive:

- module commands use the default, `CommandDefinition<ModuleServices>`;
- built-in commands use `BuiltinCommandDefinition = CommandDefinition<BotServices>`
  from `src/core/modules.ts`.

`CommandRegistry` stores `RegisteredCommand`, a union discriminated by `module`:
`RegisteredBuiltinCommand` (`module: null`) and `RegisteredModuleCommand`
(`module: string`). Dispatch and prefix narrow on `command.module === null` and
pass the matching bag. Do not cast built-ins to `CommandDefinition<ModuleServices>`.

## Adding a service

1. Construct it in `src/index.ts` (the composition root) or in
   `createCoreServices()` if it is infrastructure that needs `prisma`/`redis`/
   `client`.
2. Add it to `BotServices` if built-in code needs it.
3. If modules need it, add it to `ModuleServices` and to `servicesForModule()`.
4. Update this doc and the boot order in `architecture.md`.

Prefer a narrow behavioural interface over a concrete class when a service is
only used for one operation (see `modules` / `ModuleRegistryAccess`).

## Composition root

`src/index.ts` is the only place that builds the object graph. It:

1. Opens Redis, the database, and the Discord client.
2. Calls `createCoreServices({ client, redis })` for the infrastructure tree
   (`prisma`, `helpers`, `configService`, `permits`, `scheduler`,
   `healthMonitor`, `invalidation`, `cache`).
3. Builds the loader, RPC router, command sync, guild sync, addon manager, and
   module host.
4. Assembles a single `BotServices` object and passes it down.
5. Wires the process at the edges using focused helpers so `main()` stays
   linear:
   - `registerClientEvents()` — `src/core/clientEvents.ts`
   - `createRpcRouter()` — `src/core/rpcRouter.ts`
   - `registerShutdownHandlers()` — `src/core/shutdown.ts`

Nothing else may construct these services. Packages receive their dependencies
as constructor/function arguments and never import `src/`.

## Late-bound dependencies

Some services need each other in a cycle (the addon manager needs the module
host, the host needs the addon manager). Break the cycle with a provider
function, not a mutable field on the consumer:

```ts
const runtimeRef: { host?: ModuleHost } = {};
const addonManager = new AddonManager({
  // ...
  runtime: () => {
    if (!runtimeRef.host)
      throw new Error(
        "Add-on runtime requested before the module host exists.",
      );
    return runtimeRef.host;
  },
});
// ...host is built...
runtimeRef.host = host;
```

Providers are `() => T`. Do not widen them to `T | (() => T)`.

## Tests

Unit tests may construct a partial service object and cast it at the boundary
(`as never`). That is a fixture convenience, not a licence to add optional
fields or shims to the real contracts.
