# @lumi/contracts

## 0.9.0

### Minor Changes

- [`8c5a209`](https://github.com/lumi-devs/Lumi/commit/8c5a209ca043ae6762d09561a199555c236ced0d) - Expand addon sandbox contracts: add manageStickers and fetchMessage capabilities, sticker RPCs, clientStats RPC, repliedToId on invocations, and isOwner flag on SerialisedMember.

- [#186](https://github.com/lumi-devs/Lumi/pull/186) [`879ddaf`](https://github.com/lumi-devs/Lumi/commit/879ddaf93c2a63e641e6ac3896560bd4e59dcb5a) Thanks [@rebizzz](https://github.com/rebizzz)! - Run every addon in a V8 isolate inside a Node sidecar instead of a Bun child process. The isolate has no filesystem, network, subprocess, or process access at all - addon code reaches the host only through the capability-gated RPC bridge, with per-isolate memory limits and CPU timeouts. New mediated RPC methods: `util.randomHex`/`util.sha256Hex`/`util.sleep` (always allowed, pure compute) and SSRF-guarded `net.fetch` (new `network` manifest capability, exposed as `lumi/net`). The addon SDK transport is now injected (`setRpcTransport`) so one RPC module serves both runtimes, card-color and error helpers moved to dependency-free homes (`#lib/discord/constants`, `#lib/branding/colors`, `@lumi/shared`), and `Bun.spawn` mocks in resolver tests are scoped per-test so later suites can spawn real processes. The dashboard RPC client now retries server-directed retryable failures (honoring `retryAfterMs`) and caps response bodies. Docker images install Node.js and compile the isolated-vm binding in the deps stage.

### Patch Changes

- [`8c5a209`](https://github.com/lumi-devs/Lumi/commit/8c5a209ca043ae6762d09561a199555c236ced0d) - Ship addon `configFields` over the sandbox `ready` handshake and merge them into the host module record, so addons render the same config UI as built-in modules in the Discord hub panel and dashboard. Previously the host only ever saw the manifest's (usually empty) `configFields` while the real schema lived in the child process.

- [`8c5a209`](https://github.com/lumi-devs/Lumi/commit/8c5a209ca043ae6762d09561a199555c236ced0d) - Addon modal file uploads end to end: `modal()` builds label-wrapped file-upload components, the host serialises uploads onto the invocation, and `discord.attachments.rehost` (Discord CDN URLs only, 8MB cap, gated under `sendMessage`) re-hosts them. `discord.channels.send` accepts `replyTo` for native message references without pinging. The host acknowledges modal submits before invoking the addon so slow handlers no longer blow the 3s window.

- [#186](https://github.com/lumi-devs/Lumi/pull/186) [`879ddaf`](https://github.com/lumi-devs/Lumi/commit/879ddaf93c2a63e641e6ac3896560bd4e59dcb5a) Thanks [@rebizzz](https://github.com/rebizzz)! - Continue the caller's W3C trace in RPC dispatch with per-action spans, and harden the RPC client: retry any retryable coded failure (honoring retryAfterMs) and reject over-cap response bodies without buffering them.

## 0.8.0

### Minor Changes

- [`273ff04`](https://github.com/lumi-devs/Lumi/commit/273ff045cb269aae9ee6b0038fe6d30ce76cf4b4) - Sapphire-as-thin-adapter refactor: `LumiCommand`/`LumiListener`/`LumiSubcommand`/`LumiPrecondition` bases, canonical `LumiPermissionPrecondition` with per-subcommand nodes, `interactions/` layout (`KnownSubstores` renames `interaction-handlers` to `interactions`), service re-export shims removed.

### Patch Changes

- [`edfe1a7`](https://github.com/lumi-devs/Lumi/commit/edfe1a76d38f6083fad667d2568f18ce1a7775c7) - Remove Sapphire-carcass APIs with no aliases: addon SDK is plain `defineModule`/`defineCommand` data (deleted `DefineModule`/`Module`/`BaseCommand`/`BaseSubcommand`/`CommandRegistry`/`captureBuilder`), single `ScheduledTasks` source of truth, one reply stack (`ctx.reply*`), fail-closed unknown gates, deleted dead infra services (`BaseRepository`, `CacheService`, `InfrastructureDatabaseService`, outbox, queue-service barrel), `prisma/errors` inlined at the RPC boundary, `repositoryCache` co-located with `CacheStore`, explicit Valkey publishers, global `lock.ts` shim removed. Deleted the dead `permission` RPC option.
